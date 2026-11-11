import { json } from '@sveltejs/kit';
import { normaliseUtr } from '#lib/payment.ts';
import { isBookingStoreAvailable, paymentOf, submitStallPayment } from '#lib/server/bookings.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const MESSAGES = {
	not_found: 'We could not find your booking. Please book again.',
	utr_used: 'This UPI transaction ID has already been used. Check the ID and try again.',
	utr_required: 'Enter the 12-digit UPI transaction ID from your payment receipt.',
	paid: 'This booking is already confirmed.',
	rejected: 'This booking was not confirmed by the organisers. Please book again or contact them.'
} as const;

/** The exhibitor reports the UPI transaction ID of their stall payment for review. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
	const free = body?.free === true;
	const utr = free ? null : normaliseUtr(typeof body?.utr === 'string' ? body.utr : '');

	if (!/^STL-[A-Z0-9]{6}$/.test(code) || !email) return json({ message: MESSAGES.not_found }, { status: 400 });
	if (!free && !utr) return json({ message: MESSAGES.utr_required }, { status: 400 });
	if (!isBookingStoreAvailable) return json({ message: 'Payments cannot be recorded right now. Please try again later.' }, { status: 503 });

	const result = await submitStallPayment(code, email, utr);
	if (result.ok) return json(paymentOf(result.booking));
	return json({ message: MESSAGES[result.reason], reason: result.reason }, { status: result.reason === 'not_found' ? 404 : 409 });
};
