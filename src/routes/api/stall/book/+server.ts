import { json } from '@sveltejs/kit';
import { validateStallBooking, type StallBookingInput } from '#lib/stall-booking.ts';
import { createStallBooking, isBookingStoreAvailable, paymentOf } from '#lib/server/bookings.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Books a stall (awaiting payment) and returns what the payment step shows. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	const preferred = body?.preferredStall;
	const input: StallBookingInput = {
		fullName: str(body?.fullName),
		businessName: str(body?.businessName),
		email: str(body?.email),
		phone: str(body?.phone, 20),
		preferredStall: typeof preferred === 'number' && Number.isInteger(preferred) ? preferred : null,
		stallTypeId: str(body?.stallTypeId, 60),
		promoCode: str(body?.promoCode, 40)
	};
	const errors = validateStallBooking(input);
	if (Object.keys(errors).length) return json({ message: 'Check the highlighted fields.', errors }, { status: 400 });
	if (!isBookingStoreAvailable) return json({ message: 'Stall booking is not available right now. Please try again later.' }, { status: 503 });
	if (!allow(`stall-book:${getClientAddress()}`, 10, 10 * 60_000)) {
		return json({ message: 'Too many bookings from this device. Wait a few minutes and try again.' }, { status: 429 });
	}

	const result = await createStallBooking(input);
	if (result.ok) return json(paymentOf(result.booking), { headers: { 'cache-control': 'no-store' } });
	const messages = {
		invalid: 'That promo code is not valid for stalls. Check it and try again.',
		closed: 'That promo code is no longer accepted.',
		used_up: 'That promo code has been fully used.',
		no_offer: 'Choose a stall type.'
	};
	return json({ message: messages[result.reason], errors: result.reason === 'no_offer' ? {} : { promoCode: messages[result.reason] } }, { status: 409 });
};
