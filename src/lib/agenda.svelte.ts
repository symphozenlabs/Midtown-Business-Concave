/**
 * The agenda the organisers keep under Event setup → Halls and sessions, loaded
 * by the prerendered home page. Shared so the hero can offer "View agenda" only
 * once there is an agenda to show.
 */

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
