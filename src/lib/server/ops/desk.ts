import { error, redirect } from '@sveltejs/kit';
import { isCategory, type Category } from '#lib/ops/categories.ts';
import { audit, getEvent, listMeals, listSessions } from './event.ts';
import { assignmentFor } from './handlers.ts';
import { currentMeal, currentSession, mealsFor, sessionsFor } from './scan.ts';

/** What a desk page shows about where the handler is working. Safe to send to the browser. */
export interface DeskInfo {
	category: Category;
	eventId: string;
	eventName: string;
	gateName: string | null;
	hall: string | null;
	counterName: string | null;
	canIssueCertificates: boolean;
	sessions: { id: string; hall: string; title: string; startsAt: string; endsAt: string }[];
	currentSessionId: string | null;
	meals: { id: string; name: string; startsAt: string | null; endsAt: string | null }[];
	currentMealId: string | null;
	/** The handler works this category at more than one event: links carry ?event=. */
	multiEvent: boolean;
}

/**
 * Opens a desk for the signed-in handler, or refuses with 403. Typing another
 * desk's address lands here and is refused (and recorded) like an API call.
 */
export async function openDesk(locals: App.Locals, param: string, eventParam: string | null): Promise<DeskInfo> {
	const handler = locals.handler;
	if (!handler) redirect(303, '/handler/login');
	if (!isCategory(param)) error(404, 'There is no such desk.');

	const assignment = assignmentFor(handler, param, eventParam ?? undefined);
	if (!assignment) {
		await audit({ actorType: 'handler', actor: handler.id, action: 'desk.forbidden', targetType: 'category', targetId: param });
		error(403, 'You are not assigned to this desk. Ask the event administrator if you should be.');
	}
	const event = await getEvent(assignment.eventId);
	if (!event) error(404, 'This event no longer exists.');

	const sessions = param === 'hall' ? sessionsFor(assignment, await listSessions(event.id)) : [];
	const meals = param === 'food' ? mealsFor(assignment, await listMeals(event.id)) : [];
	return {
		category: param,
		eventId: event.id,
		eventName: event.name,
		gateName: assignment.gateName,
		hall: assignment.hall,
		counterName: assignment.counterName,
		canIssueCertificates: assignment.canIssueCertificates,
		sessions: sessions.map((s) => ({ id: s.id, hall: s.hall, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt })),
		currentSessionId: (currentSession(sessions) ?? (sessions.length === 1 ? sessions[0] : null))?.id ?? null,
		meals: meals.map((m) => ({ id: m.id, name: m.name, startsAt: m.startsAt, endsAt: m.endsAt })),
		currentMealId: currentMeal(meals)?.id ?? null,
		multiEvent: handler.assignments.filter((a) => a.category === param).length > 1
	};
}
