import { categoryInfo } from '#lib/ops/categories.ts';
import { handlerRecent, handlerToday } from '#lib/server/ops/activity.ts';
import { openDesk } from '#lib/server/ops/desk.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const desk = await openDesk(locals, params.category, url.searchParams.get('event'));
	const [today, recent] = await Promise.all([
		handlerToday(locals.handler!.id, desk.category),
		handlerRecent(locals.handler!.id, desk.category)
	]);
	return {
		desk,
		info: categoryInfo(desk.category),
		today,
		recent: recent.map((t) => ({ id: t.id, at: t.at, result: t.result, title: t.title, name: t.participantName, code: t.participantCode })),
		otherDesks: locals.handler!.assignments.length > 1
	};
};
