import { json } from '@sveltejs/kit';
import { isBookingStoreAvailable, listStallOffers } from '#lib/server/bookings.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** The stall types open for booking, with their prices. */
export const GET: RequestHandler = async () => {
	if (!isBookingStoreAvailable) return json({ offers: [] }, { status: 503 });
	const offers = (await listStallOffers()).map(({ id, name, sizeLabel, priceRupees }) => ({ id, name, sizeLabel, priceRupees }));
	return json({ offers }, { headers: { 'cache-control': 'no-store' } });
};
