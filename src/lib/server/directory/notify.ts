import { indiaDay, type DirectorySettings } from '#lib/directory/rules.ts';
import { sql } from '../db.ts';
import { sendMessageEmail } from '../email.ts';
import { signInLink } from '../ops/passes.ts';
import { isPushConfigured, pushTo } from '../push.ts';
import { getRegistration } from '../store.ts';
import { releaseEmail } from './messages.ts';
import type { Member } from './viewer.ts';

/**
 * Claims one of today's backup emails (India date), or false once the day's cap is
 * reached. One statement, so two messages at once can't both take the last slot.
 */
export async function takeEmailSlot(cap: number, now: Date = new Date()): Promise<boolean> {
	if (cap <= 0) return false;
	const rows = await sql()`
		insert into directory_email_days (day, sent) values (${indiaDay(now)}::date, 1)
		on conflict (day) do update set sent = directory_email_days.sent + 1
		where directory_email_days.sent < ${cap}
		returning sent`;
	return rows.length > 0;
}

/**
 * Tells the recipient about a new message: a push when switched on, and the backup
 * email that sendMessage claimed when the day's cap allows. Runs after the response;
 * never throws, as the message is saved. An email that doesn't go releases the claim,
 * so a later message can try again.
 */
export async function notifyRecipient(n: {
	origin: string;
	sender: Member;
	recipientId: string;
	conversationId: string;
	emailDue: boolean;
	settings: DirectorySettings;
}): Promise<void> {
	if (n.settings.pushEnabled && isPushConfigured) {
		try {
			await pushTo(n.recipientId, {
				title: `New message from ${n.sender.fullName}`,
				body: 'Tap to read and reply',
				url: `/visitorDirectory/${n.sender.id}`
			});
		} catch (e) {
			console.error('[directory] push failed', e);
		}
	}
	if (!n.emailDue) return;
	let sent = false;
	try {
		if (!(await takeEmailSlot(n.settings.emailCapPerDay))) return;
		const recipient = await getRegistration(n.recipientId);
		if (!recipient) return;
		const link = await signInLink(recipient, n.origin, `/visitorDirectory/${n.sender.id}`);
		if (!link) return;
		await sendMessageEmail(recipient.email, n.sender, link);
		sent = true;
	} catch (e) {
		console.error('[directory] backup email failed', e);
	} finally {
		if (!sent) await releaseEmail(n.conversationId, n.recipientId).catch((e) => console.error('[directory] could not release the email claim', e));
	}
}
