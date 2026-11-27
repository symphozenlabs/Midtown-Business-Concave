import { fail, redirect } from '@sveltejs/kit';
import { normaliseUtr } from '#lib/payment.ts';
import { STALL_NUMBERS, validateManualStallBooking } from '#lib/stall-booking.ts';
import { sendExhibitorLoginEmail, sendStallConfirmedEmail, sendStallRejectedEmail } from '#lib/server/booking-emails.ts';
import {
	allotStall,
	createConfirmedStallBooking,
	deleteStallBooking,
	getStallBooking,
	isBookingStoreAvailable,
	listStallBookings,
	listStallOffers,
	markStallPaid,
	prepareBookings,
	rejectStallBooking,
	type StallBooking
} from '#lib/server/bookings.ts';
import { isDatabaseConfigured } from '#lib/server/db.ts';
import { audit } from '#lib/server/ops/event.ts';
import { publicOrigin } from '#lib/server/site.ts';
import { isExhibitorLoginAvailable } from '#lib/server/stall-directory/exhibitor.ts';
import { stallCardPath, stallCardQr } from '#lib/server/stall-directory/card.ts';
import type { ExhibitorKit } from '#lib/server/booking-emails.ts';
import { loginEmailsWaiting, markLoginEmailed } from '#lib/server/stall-directory/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	if (!isBookingStoreAvailable) return { available: false as const };
	await prepareBookings();
	const [bookings, offers, waiting] = await Promise.all([
		listStallBookings(),
		listStallOffers(),
		isExhibitorLoginAvailable ? loginEmailsWaiting() : Promise.resolve([])
	]);
	return {
		available: true as const,
		bookings,
		offers: offers.map(({ id, name, sizeLabel, priceRupees }) => ({ id, name, sizeLabel, priceRupees })),
		loginsWaiting: waiting.length,
		exhibitorLogin: isExhibitorLoginAvailable
	};
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** An empty field clears the stall; anything else must be on the layout. */
function readStall(form: FormData): { ok: true; value: number | null } | { ok: false } {
	const raw = text(form, 'allotted');
	if (!raw) return { ok: true, value: null };
	const n = Number(raw);
	return STALL_NUMBERS.includes(n) ? { ok: true, value: n } : { ok: false };
}

/** Stalls already allotted to another confirmed booking. */
async function takenBy(stall: number | null, id: string) {
	if (stall === null) return null;
	return (await listStallBookings()).find((b) => b.id !== id && b.status === 'paid' && b.allottedStall === stall) ?? null;
}

/** The stall login and the stall QR (contact card), with links on the live site. */
async function exhibitorKit(url: URL, b: { id: string; code: string }): Promise<ExhibitorKit> {
	const origin = publicOrigin(url);
	// Sign in, then straight to their messages or their leads (already signed in: no login screen).
	const signIn = (path: string) => `${origin}/login?next=${encodeURIComponent(path)}`;
	return {
		loginUrl: signIn('/stallDirectory/exhibitor'),
		leadsUrl: signIn('/stallDirectory/exhibitor/leads'),
		cardUrl: origin + (await stallCardPath(b)),
		qr: await stallCardQr(origin, b)
	};
}

/** The confirmation email, with the stall QR and login when they are on. Never throws: says how it went. */
async function emailConfirmation(url: URL, booking: StallBooking): Promise<string> {
	const withLogin = isExhibitorLoginAvailable;
	try {
		await sendStallConfirmedEmail(booking, withLogin ? await exhibitorKit(url, booking) : undefined);
		if (withLogin) await markLoginEmailed(booking.id).catch((e) => console.error('[stalls] could not record the login email', e));
		return ` and emailed to ${booking.email}${withLogin ? ' with the stall QR and login' : ''}.`;
	} catch (e) {
		console.error('[stalls] confirmation email failed', e);
		return ', but the confirmation email could not be sent.';
	}
}

export const actions: Actions = {
	/**
	 * Confirms the payment with the final stall, which then stays locked, and emails the
	 * confirmation with the stall number and the stall directory login.
	 */
	markPaid: async ({ request, locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = text(form, 'id');
		const stall = readStall(form);
		if (!stall.ok) return fail(400, { id, message: 'Choose a stall number from the layout.' });
		if (stall.value === null) return fail(400, { id, message: 'Choose the stall to allot before confirming. It is locked once confirmed.' });
		const clash = await takenBy(stall.value, id);
		if (clash) return fail(409, { id, message: `Stall ${stall.value} is already allotted to ${clash.businessName} (${clash.code}).` });
		const booking = await markStallPaid(id, stall.value, locals.admin.email);
		if (!booking) return fail(404, { id, message: 'That booking is already confirmed or no longer exists.' });
		return { success: `${booking.code} confirmed with stall ${stall.value}${await emailConfirmation(url, booking)}` };
	},

	/**
	 * A booking taken offline (cash, bank transfer, complimentary): added already
	 * confirmed with its stall, which is locked from then on, and emailed like any
	 * confirmation unless the organiser unticks it.
	 */
	create: async ({ request, locals, url }) => {
		if (!locals.admin) return fail(401, { create: true, message: 'Sign in again.' });
		const form = await request.formData();
		const offers = await listStallOffers();
		const offer = offers.find((o) => o.id === text(form, 'stallTypeId')) ?? (offers.length === 1 ? offers[0] : undefined);
		if (!offer) return fail(400, { create: true, message: 'Choose a stall type.' });
		const amount = text(form, 'amountRupees').replace(/[₹,\s]/g, '');
		const stall = text(form, 'allotted');
		const input = {
			fullName: text(form, 'fullName'),
			businessName: text(form, 'businessName'),
			email: text(form, 'email'),
			phone: text(form, 'phone'),
			allottedStall: stall ? Number(stall) : null,
			amountRupees: amount ? Number(amount) : Number.NaN,
			upiTxnId: text(form, 'upiTxnId')
		};
		const errors = validateManualStallBooking(input, offer.priceRupees);
		if (Object.keys(errors).length) return fail(400, { create: true, errors, message: 'Check the highlighted fields.' });

		const allotted = input.allottedStall!;
		const result = await createConfirmedStallBooking(
			{ ...input, offer, allottedStall: allotted, upiTxnId: normaliseUtr(input.upiTxnId) },
			locals.admin.email
		);
		if (!result.ok) {
			if (result.reason === 'stall_taken') {
				const holder = await takenBy(allotted, '');
				const message = `Stall ${allotted} is already allotted${holder ? ` to ${holder.businessName} (${holder.code})` : ''}. Choose another.`;
				return fail(409, { create: true, errors: { allottedStall: message }, message });
			}
			const message = 'That UPI transaction ID is already on another stall booking or delegate registration.';
			return fail(409, { create: true, errors: { upiTxnId: message }, message });
		}

		const booking = result.booking;
		if (isDatabaseConfigured) {
			await audit({
				actorType: 'admin',
				actor: locals.admin.email,
				action: 'stall.create',
				targetType: 'stall_booking',
				targetId: booking.id,
				details: { code: booking.code, businessName: booking.businessName, allottedStall: allotted, amountRupees: booking.amountRupees, upiTxnId: booking.upiTxnId }
			});
		}
		const added = `${booking.code} added for ${booking.businessName} with stall ${allotted}`;
		if (!form.get('email')) {
			return { success: `${added}. No email sent${isExhibitorLoginAvailable ? ': send the stall QR and login from the booking when ready' : ''}.` };
		}
		return { success: added + (await emailConfirmation(url, booking)) };
	},

	/** Before confirmation only: a confirmed booking's stall is locked. */
	allot: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = text(form, 'id');
		const stall = readStall(form);
		if (!stall.ok) return fail(400, { id, message: 'Choose a stall number from the layout.' });
		const before = await getStallBooking(id);
		if (!before) return fail(404, { id, message: 'That booking no longer exists.' });
		if (before.status === 'paid' && before.allottedStall) {
			return fail(409, { id, message: `${before.code} is confirmed: stall ${before.allottedStall} is locked.` });
		}
		const clash = await takenBy(stall.value, id);
		if (clash) return fail(409, { id, message: `Stall ${stall.value} is already allotted to ${clash.businessName} (${clash.code}).` });
		const booking = await allotStall(id, stall.value, locals.admin.email);
		if (!booking) return fail(409, { id, message: 'That stall is locked.' });
		return { success: stall.value ? `${booking.code} allotted stall ${stall.value}.` : `${booking.code}: allotted stall cleared.` };
	},

	reject: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = text(form, 'id');
		const reason = text(form, 'reason').replace(/\s+/g, ' ').slice(0, 300);
		const booking = await rejectStallBooking(id, reason, locals.admin.email);
		if (!booking) return fail(404, { id, message: 'That booking is already rejected or no longer exists.' });
		try {
			await sendStallRejectedEmail(booking, reason);
			return { success: `${booking.code} rejected and ${booking.fullName} emailed.` };
		} catch (e) {
			console.error('[stalls] rejection email failed', e);
			return { success: `${booking.code} rejected, but the email could not be sent.` };
		}
	},

	/** Removes the booking, its stall directory messages and leads. Frees its stall. No email. */
	delete: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = text(await request.formData(), 'id');
		const booking = await deleteStallBooking(id);
		if (!booking) return fail(404, { id, message: 'That booking no longer exists.' });
		if (isDatabaseConfigured) {
			await audit({
				actorType: 'admin',
				actor: locals.admin.email,
				action: 'stall.delete',
				targetType: 'stall_booking',
				targetId: booking.id,
				details: { code: booking.code, businessName: booking.businessName, status: booking.status, allottedStall: booking.allottedStall }
			});
		}
		const freed = booking.allottedStall ? ` Stall ${booking.allottedStall} is free again.` : '';
		return { success: `${booking.code} (${booking.businessName}) deleted.${freed}` };
	},

	/** Emails one confirmed exhibitor their stall QR and login again. */
	resendKit: async ({ request, locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		if (!isExhibitorLoginAvailable) return fail(503, { message: 'Exhibitor login needs the database and PASS_SECRET.' });
		const id = text(await request.formData(), 'id');
		const b = await getStallBooking(id);
		if (!b || b.status !== 'paid') return fail(404, { id, message: 'Only confirmed stalls get a stall QR and login.' });
		try {
			await sendExhibitorLoginEmail(b, await exhibitorKit(url, b));
			await markLoginEmailed(b.id);
			return { success: `Stall QR and login emailed to ${b.email}.` };
		} catch (e) {
			console.error('[stalls] stall QR email failed', b.code, e);
			return fail(502, { id, message: 'The email could not be sent. Try again.' });
		}
	},

	/** One click: the stall directory login to every confirmed exhibitor who hasn't had it. */
	sendLogins: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		if (!isExhibitorLoginAvailable) return fail(503, { message: 'Exhibitor login needs the database and PASS_SECRET.' });
		const ids = await loginEmailsWaiting();
		let sent = 0;
		let failed = 0;
		for (const id of ids) {
			const b = await getStallBooking(id);
			if (!b || b.status !== 'paid') continue;
			try {
				await sendExhibitorLoginEmail(b, await exhibitorKit(url, b));
				await markLoginEmailed(id);
				sent++;
			} catch (e) {
				console.error('[stalls] login email failed', b.code, e);
				failed++;
			}
		}
		if (!sent && !failed) return { success: 'Every confirmed exhibitor already has their login.' };
		return { success: `Stall QR and login emailed to ${sent} exhibitor${sent === 1 ? '' : 's'}.${failed ? ` ${failed} could not be sent; try again.` : ''}` };
	}
};
