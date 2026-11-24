import { redirect } from '@sveltejs/kit';
import { stallCardPath } from '#lib/server/stall-directory/card.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { countLeads, exhibitorConversations, stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import type { PageServerLoad } from './$types';

export const prerender = false;

/** The exhibitor's inbox: delegates who wrote to any of their stalls. */
export const load: PageServerLoad = async (event) => {
	event.depends('stall-directory:inbox');
	const exhibitor = await readExhibitor(event.cookies);
	if (!exhibitor) redirect(303, '/login?next=/stallDirectory/exhibitor');
	if (!(await stallDirectoryReady())) return { conversations: [], unread: 0, latest: null, multipleStalls: false, leadCount: 0, cards: [] };
	const [conversations, leadCount, cards] = await Promise.all([
		exhibitorConversations(exhibitor.bookingIds),
		countLeads(exhibitor.bookingIds),
		// Each stall's QR and the contact card it opens.
		Promise.all(exhibitor.stalls.map(async (s) => ({ id: s.id, stall: s.stall, businessName: s.businessName, path: await stallCardPath(s) })))
	]);
	return {
		conversations,
		unread: conversations.filter((c) => c.unread).length,
		latest: conversations[0]?.lastAt ?? null,
		multipleStalls: exhibitor.stalls.length > 1,
		leadCount,
		cards
	};
};
