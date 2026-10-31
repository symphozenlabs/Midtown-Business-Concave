import { json } from '@sveltejs/kit';
import { getPaymentDetails, isStoreAvailable } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * The payment step asks this while it is open, so a fee or UPI change made on the
 * dashboard reaches delegates who registered before it. POST keeps the email out of URLs.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

	if (!/^MBC-[A-Z0-9]{6}$/.test(code) || !email) {
		return json({ message: 'We could not find your registration.' }, { status: 400 });
	}
	if (!isStoreAvailable) return json({ message: 'Unavailable.' }, { status: 503 });

	const details = await getPaymentDetails(code, email);
	if (!details) return json({ message: 'We could not find your registration.' }, { status: 404 });
	return json(details, { headers: { 'cache-control': 'no-store' } });
};
