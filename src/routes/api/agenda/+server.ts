import { json } from '@sveltejs/kit';
import { getDefaultEvent, listAgenda, opsReady } from '#lib/server/ops/event.ts';
import type { AgendaItem } from '#lib/agenda.svelte.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * The website agenda: sessions set up under Event setup → Halls and sessions that
 * are marked "Show on the website agenda". Nothing personal, safe to cache briefly.
 */
export const GET: RequestHandler = async () => {
	let items: AgendaItem[] = [];
	if (await opsReady()) {
		const event = await getDefaultEvent();
		items = (await listAgenda(event.id)).map((s) => ({
			id: s.id,
			title: s.title,
			hall: s.hall,
			startsAt: s.startsAt,
			endsAt: s.endsAt,
			speaker: s.speaker,
			description: s.description,
			isBreak: !s.countsForAttendance
		}));
	}
	return json({ items }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
};
