import { redirect } from '@sveltejs/kit';
import { listAudit, listTransactions, overview, readFilter } from '#lib/server/ops/activity.ts';
import { getDefaultEvent, opsReady } from '#lib/server/ops/event.ts';
import { listHandlers } from '#lib/server/ops/handlers.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.admin) redirect(303, '/admin/login');
	if (!(await opsReady())) return { available: false as const };
	const event = await getDefaultEvent();
	const filter = readFilter(url.searchParams);
	const tab = url.searchParams.get('tab') === 'audit' ? 'audit' : 'scans';
	const [ov, transactions, handlers, auditLog] = await Promise.all([
		overview(event.id),
		tab === 'scans' ? listTransactions(event.id, filter) : Promise.resolve([]),
		listHandlers(true),
		tab === 'audit' ? listAudit(200) : Promise.resolve([])
	]);
	return {
		available: true as const,
		eventName: event.name,
		overview: ov,
		filter,
		tab,
		transactions,
		auditLog,
		handlers: handlers.map((h) => ({ id: h.id, name: h.fullName, username: h.username }))
	};
};
