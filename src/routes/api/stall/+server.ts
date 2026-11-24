import { json } from '@sveltejs/kit';
import { isBookingStoreAvailable, listStallOffers } from '#lib/server/bookings.ts';
import { listExhibitors } from '#lib/server/stall-directory/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * The stall types open for booking, with their prices, and the confirmed stalls:
 * taken numbers for the booking form, and who is on each for the floor map (the same
 * public details as the stall directory).
 */
export const GET: RequestHandler = async () => {
	if (!isBookingStoreAvailable) return json({ offers: [], taken: [], exhibitors: [] }, { status: 503 });
	const [offers, exhibitors] = await Promise.all([listStallOffers(), listExhibitors()]);
	const placed = exhibitors.filter((e) => e.stall !== null);
	return json(
		{
			offers: offers.map(({ id, name, sizeLabel, priceRupees }) => ({ id, name, sizeLabel, priceRupees })),
			taken: placed.map((e) => e.stall!).sort((a, b) => a - b),
			exhibitors: placed.map(({ id, stall, businessName }) => ({ id, stall, businessName }))
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
