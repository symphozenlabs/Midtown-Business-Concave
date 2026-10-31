import { json } from '@sveltejs/kit';
import { allow } from '#lib/server/rate-limit.ts';
import { applyVoucher, isStoreAvailable } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const MESSAGES = {
	not_found: 'We could not find your registration. Please register again.',
	not_pending: 'Your payment has already been sent for review, so the voucher can no longer be changed.',
	invalid: 'That voucher code is not valid. Check it and try again.',
	closed: 'That voucher is no longer accepted.',
	used_up: 'That voucher has been fully used.'
} as const;

/** Applies a voucher code to an unpaid registration; an empty code takes it off. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
	const voucher = typeof body?.voucher === 'string' ? body.voucher.slice(0, 40) : '';

	if (!/^MBC-[A-Z0-9]{6}$/.test(code) || !email) return json({ message: MESSAGES.not_found }, { status: 400 });
	if (!isStoreAvailable) return json({ message: 'Vouchers cannot be checked right now. Please try again later.' }, { status: 503 });
	// Slows down guessing codes, per registration and per address.
	if (!allow(`voucher:${code}`, 10, 10 * 60_000) || !allow(`voucher-ip:${getClientAddress()}`, 30, 10 * 60_000)) {
		return json({ message: 'Too many tries. Wait a few minutes and try again.' }, { status: 429 });
	}

	const result = await applyVoucher(code, email, voucher.trim() || null);
	if (result.ok) return json(result.details, { headers: { 'cache-control': 'no-store' } });
	const status = result.reason === 'not_found' ? 404 : result.reason === 'invalid' ? 400 : 409;
	return json({ message: MESSAGES[result.reason], reason: result.reason }, { status });
};
