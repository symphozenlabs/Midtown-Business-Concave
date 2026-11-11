import { json } from '@sveltejs/kit';
import { voucherLabel } from '#lib/voucher.ts';
import { checkStallPromo, isBookingStoreAvailable, listStallOffers } from '#lib/server/bookings.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const PROMO_MESSAGES = {
	invalid: 'That promo code is not valid for stalls. Check it and try again.',
	closed: 'That promo code is no longer accepted.',
	used_up: 'That promo code has been fully used.'
} as const;

/** Checks a stall promo code and returns the price after the discount. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code.slice(0, 40) : '';
	const stallTypeId = typeof body?.stallTypeId === 'string' ? body.stallTypeId : '';
	if (!isBookingStoreAvailable) return json({ message: 'Promo codes cannot be checked right now.' }, { status: 503 });
	if (!allow(`stall-promo:${getClientAddress()}`, 20, 10 * 60_000)) {
		return json({ message: 'Too many tries. Wait a few minutes and try again.' }, { status: 429 });
	}
	const offers = await listStallOffers();
	const offer = offers.find((o) => o.id === stallTypeId) ?? offers[0];
	const result = await checkStallPromo(code, offer.priceRupees);
	if (!result.ok) return json({ message: PROMO_MESSAGES[result.reason], reason: result.reason }, { status: 400 });
	return json({
		code: result.voucher?.code ?? null,
		label: result.voucher ? voucherLabel(result.voucher) : null,
		discountRupees: result.discount,
		amountRupees: offer.priceRupees - result.discount
	});
};
