import { redirect } from '@sveltejs/kit';
import { categoryInfo } from '#lib/ops/categories.ts';
import type { PageServerLoad } from './$types';

/** One desk: straight to it. Several: a choice of big buttons. */
export const load: PageServerLoad = ({ locals }) => {
	const handler = locals.handler;
	if (!handler) redirect(303, '/handler/login');
	const events = new Set(handler.assignments.map((a) => a.eventId));
	const href = (a: (typeof handler.assignments)[number]) => `/handler/${a.category}${events.size > 1 ? `?event=${a.eventId}` : ''}`;
	if (handler.assignments.length === 1) redirect(303, href(handler.assignments[0]));

	return {
		desks: handler.assignments.map((a) => ({
			href: href(a),
			category: a.category,
			title: categoryInfo(a.category).title,
			description: categoryInfo(a.category).description,
			context: [a.gateName, a.sessionTitle ?? a.hall, a.mealName, a.counterName].filter(Boolean).join(' · '),
			eventName: events.size > 1 ? a.eventName : null
		}))
	};
};
