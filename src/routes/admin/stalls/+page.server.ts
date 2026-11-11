import { fail, redirect } from '@sveltejs/kit';
import { STALL_NUMBERS } from '#lib/stall-booking.ts';
import { sendStallChangedEmail, sendStallConfirmedEmail, sendStallRejectedEmail } from '#lib/server/booking-emails.ts';
import {
	allotStall,
	getStallBooking,
	isBookingStoreAvailable,
	listStallBookings,
	listStallOffers,
	markStallPaid,
	prepareBookings,
	rejectStallBooking
} from '#lib/server/bookings.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	if (!isBookingStoreAvailable) return { available: false as const };
	await prepareBookings();
	const [bookings, offers] = await Promise.all([listStallBookings(), listStallOffers()]);
	return { available: true as const, bookings, offers: offers.map(({ name, sizeLabel, priceRupees }) => ({ name, sizeLabel, priceRupees })) };
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

export const actions: Actions = {
	markPaid: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = text(form, 'id');
		const stall = readStall(form);
		if (!stall.ok) return fail(400, { id, message: 'Choose a stall number from the layout.' });
		const clash = await takenBy(stall.value, id);
		if (clash) return fail(409, { id, message: `Stall ${stall.value} is already allotted to ${clash.businessName} (${clash.code}).` });
		const booking = await markStallPaid(id, stall.value, locals.admin.email);
		if (!booking) return fail(404, { id, message: 'That booking is already confirmed or no longer exists.' });
		try {
			await sendStallConfirmedEmail(booking);
			return { success: `${booking.code} confirmed and emailed to ${booking.email}.` };
		} catch (e) {
			console.error('[stalls] confirmation email failed', e);
			return { success: `${booking.code} confirmed, but the confirmation email could not be sent.` };
		}
	},

	allot: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = text(form, 'id');
		const stall = readStall(form);
		if (!stall.ok) return fail(400, { id, message: 'Choose a stall number from the layout.' });
		const clash = await takenBy(stall.value, id);
		if (clash) return fail(409, { id, message: `Stall ${stall.value} is already allotted to ${clash.businessName} (${clash.code}).` });
		const before = await getStallBooking(id);
		const booking = await allotStall(id, stall.value, locals.admin.email);
		if (!booking) return fail(404, { id, message: 'That booking no longer exists.' });
		const done = stall.value ? `${booking.code} allotted stall ${stall.value}.` : `${booking.code}: allotted stall cleared.`;
		// A confirmed exhibitor already has a stall number by email; tell them it changed.
		if (booking.status !== 'paid' || before?.allottedStall === booking.allottedStall) return { success: done };
		try {
			await sendStallChangedEmail(booking);
			return { success: `${done} ${booking.fullName} has been emailed.` };
		} catch (e) {
			console.error('[stalls] stall change email failed', e);
			return { success: `${done} The email to ${booking.fullName} could not be sent.` };
		}
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
	}
};
