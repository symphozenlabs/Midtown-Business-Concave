import { STALL_DIRECTORY_PATH, stallPagePath } from '#lib/stall-directory/rules.ts';
import type { DirectorySettings } from '#lib/directory/rules.ts';
import { sendExhibitorMessageEmail } from '../booking-emails.ts';
import { getStallBooking } from '../bookings.ts';
import { takeEmailSlot } from '../directory/notify.ts';
import { sendMessageEmail } from '../email.ts';
import { signInLink } from '../ops/passes.ts';
import { isPushConfigured, pushTo } from '../push.ts';
import { getRegistration } from '../store.ts';
import { releaseStallEmail } from './store.ts';

/*
 * Tells the other side of a stall conversation about a new message, after the
 * response has gone. Same rules as the visitors directory: never the message text,
 * one backup email per conversation until it is read, and the shared daily email cap.
 * Never throws: the message is already saved.
 */

/** A delegate wrote to a stall: email the exhibitor a link to sign in and read it. */
export async function notifyExhibitor(n: {
	origin: string;
	from: { fullName: string; designation: string; companyName: string };
	bookingId: string;
	conversationId: string;
	emailDue: boolean;
	settings: DirectorySettings;
}): Promise<void> {
	if (!n.emailDue) return;
	let sent = false;
	try {
		if (!(await takeEmailSlot(n.settings.emailCapPerDay))) return;
		const booking = await getStallBooking(n.bookingId);
		if (!booking || booking.status !== 'paid') return;
		const next = `${STALL_DIRECTORY_PATH}/exhibitor/messages/${n.conversationId}`;
		const link = `${n.origin}/login?next=${encodeURIComponent(next)}`;
		await sendExhibitorMessageEmail(booking, n.from, link);
		sent = true;
	} catch (e) {
		console.error('[stall-directory] exhibitor email failed', e);
	} finally {
		if (!sent) await releaseStallEmail(n.conversationId, 'exhibitor').catch((e) => console.error('[stall-directory] could not release the email claim', e));
	}
}

/** The exhibitor replied: push to the delegate's phones and send the backup email. */
export async function notifyDelegate(n: {
	origin: string;
	stall: { businessName: string; number: number | null };
	bookingId: string;
	registrationId: string;
	conversationId: string;
	emailDue: boolean;
	settings: DirectorySettings;
}): Promise<void> {
	const path = stallPagePath(n.bookingId);
	const name = n.stall.number ? `${n.stall.businessName} (stall ${n.stall.number})` : n.stall.businessName;
	await Promise.all([
		(async () => {
			if (!n.settings.pushEnabled || !isPushConfigured) return;
			try {
				await pushTo(n.registrationId, { title: `New message from ${name}`, body: 'Tap to read and reply', url: path });
			} catch (e) {
				console.error('[stall-directory] push failed', e);
			}
		})(),
		(async () => {
			if (!n.emailDue) return;
			let sent = false;
			try {
				if (!(await takeEmailSlot(n.settings.emailCapPerDay))) return;
				const reg = await getRegistration(n.registrationId);
				if (!reg || reg.status !== 'paid') return;
				const link = await signInLink(reg, n.origin, path);
				if (!link) return;
				await sendMessageEmail(reg.email, { fullName: name, designation: '', companyName: '' }, link, 'the visitors directory', `${name}, an exhibitor`);
				sent = true;
			} catch (e) {
				console.error('[stall-directory] delegate email failed', e);
			} finally {
				if (!sent) await releaseStallEmail(n.conversationId, 'delegate').catch((e) => console.error('[stall-directory] could not release the email claim', e));
			}
		})()
	]);
}
