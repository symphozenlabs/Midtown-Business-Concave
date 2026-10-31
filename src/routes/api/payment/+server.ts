import { json } from '@sveltejs/kit';
import { normaliseUtr } from '#lib/payment.ts';
import { isStoreAvailable, submitPayment } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * The delegate reports the UPI transaction ID of their payment for review. With
 * `free: true` and no ID, a registration whose voucher covers the whole fee is sent for review.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
	const free = body?.free === true;
	const utr = free ? null : normaliseUtr(typeof body?.utr === 'string' ? body.utr : '');

	if (!/^MBC-[A-Z0-9]{6}$/.test(code) || !email) {
		return json({ message: 'We could not find your registration. Please register again.' }, { status: 400 });
	}
	if (!free && !utr) {
		return json({ message: 'Enter the 12-digit UPI transaction ID from your payment receipt.' }, { status: 400 });
	}
	if (!isStoreAvailable) {
		return json({ message: 'Payments cannot be recorded right now. Please try again later.' }, { status: 503 });
	}

	const result = await submitPayment(code, email, utr);
	if (result.ok) return json({ code, status: result.registration.status });

	switch (result.reason) {
		case 'utr_used':
			return json(
				{ message: 'This UPI transaction ID has already been used for another registration. Check the ID and try again.' },
				{ status: 409 }
			);
		case 'utr_required':
			return json(
				{ message: 'Your voucher no longer covers the whole fee. Pay the amount shown and enter the UPI transaction ID.' },
				{ status: 400 }
			);
		case 'paid':
			return json({ message: 'This registration is already paid. Your ticket has been emailed to you.' }, { status: 409 });
		default:
			return json({ message: 'We could not find your registration. Please register again.' }, { status: 404 });
	}
};
