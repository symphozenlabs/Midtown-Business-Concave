import { redirect } from '@sveltejs/kit';
import { stallCardPaths } from '#lib/server/stall-directory/card.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { listExhibitors } from '#lib/server/stall-directory/store.ts';
import type { PageServerLoad } from './$types';

export const prerender = false;

/** The other stalls and the floor map, inside the exhibitor area. */
export const load: PageServerLoad = async ({ cookies }) => {
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) redirect(303, '/login?next=/stallDirectory/exhibitor/stalls');
	const [exhibitors, cards] = await Promise.all([listExhibitors(), stallCardPaths()]);
	return { exhibitors, cards, mine: exhibitor.bookingIds };
};
