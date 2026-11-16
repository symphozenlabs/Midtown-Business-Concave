/**
 * The agenda the organisers keep under Event setup → Halls and sessions, loaded
 * by the prerendered home page. Shared so the hero can offer "View agenda" only
 * once there is an agenda to show.
 */

import { EVENT_TIME_ZONE } from './event-settings.ts';

export interface AgendaItem {
	id: string;
	title: string;
	hall: string;
	startsAt: string;
	endsAt: string;
	speaker: string | null;
	description: string | null;
	/** Not counted for attendance: openings, tea, lunch. Shown more quietly. */
	isBreak: boolean;
}

export const agenda = $state({ items: [] as AgendaItem[], loaded: false });

let loading: Promise<void> | null = null;

/** Fetches once per page; later calls share the same request. */
export function loadAgenda() {
	loading ??= fetch('/api/agenda')
		.then((r) => (r.ok ? r.json() : { items: [] }))
		.then((data: { items?: AgendaItem[] }) => {
			agenda.items = Array.isArray(data.items) ? data.items : [];
		})
		.catch(() => {})
		.finally(() => {
			agenda.loaded = true;
		});
	return loading;
}

const clockFormat = new Intl.DateTimeFormat('en-IN', {
	hour: 'numeric',
	minute: '2-digit',
	hour12: true,
	timeZone: EVENT_TIME_ZONE
});

/** "9.30 am", "12 pm": the site's own way of writing times. */
export function agendaClock(iso: string) {
	const parts = Object.fromEntries(clockFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
	const period = (parts.dayPeriod ?? '').toLowerCase().replace(/\./g, '');
	return parts.minute === '00' ? `${parts.hour} ${period}` : `${parts.hour}.${parts.minute} ${period}`;
}

/** Sessions that start together (parallel tracks) share one slot, in time order. */
export function agendaSlots(items: AgendaItem[]): [string, AgendaItem[]][] {
	const bySlot = new Map<string, AgendaItem[]>();
	for (const item of items) {
		const list = bySlot.get(item.startsAt) ?? [];
		list.push(item);
		bySlot.set(item.startsAt, list);
	}
	return [...bySlot.entries()].sort(([a], [b]) => Date.parse(a) - Date.parse(b));
}
