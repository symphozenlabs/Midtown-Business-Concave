import { resolveStallCard } from '#lib/server/stall-directory/card.ts';
import type { PageServerLoad } from './$types';

export const prerender = false;

/**
 * What a phone camera opens when it scans a stall's QR: the exhibitor's contact card
 * (business, name, phone, email, stall) with "Save contact", like a delegate's pass.
 */
export const load: PageServerLoad = async ({ params }) => {
	const card = await resolveStallCard(params.token);
	if (!card) return { valid: false as const };
	return { valid: true as const, card };
};
