import { isCategory } from '#lib/ops/categories.ts';
import { normalisePhone } from '#lib/registration.ts';
import { listGates, listMeals, listSessions } from './event.ts';
import type { AssignmentInput, HandlerInput } from './handlers.ts';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function readHandlerInput(form: FormData): { input: HandlerInput; errors: Record<string, string> } {
	const errors: Record<string, string> = {};
	const fullName = text(form, 'fullName').replace(/\s+/g, ' ');
	const username = text(form, 'username').toLowerCase();
	const email = text(form, 'email').toLowerCase();
	const mobileRaw = text(form, 'mobile');
	const mobile = mobileRaw ? normalisePhone(mobileRaw) : null;

	if (fullName.length < 2 || fullName.length > 80) errors.fullName = 'Enter the handler’s full name.';
	if (!/^[a-z0-9._-]{3,32}$/.test(username)) errors.username = '3–32 characters: letters, numbers, dot, dash or underscore.';
	if (email && (!EMAIL.test(email) || email.length > 120)) errors.email = 'Enter an email like name@company.com, or leave it empty.';
	if (mobileRaw && !mobile) errors.mobile = 'Enter a 10-digit Indian mobile number, or leave it empty.';
	return { input: { fullName, username, email: email || null, mobile }, errors };
}

/**
 * Reads the category checkboxes and each desk's context. Gate, session and meal
 * ids must belong to the event, so a crafted form cannot point a desk elsewhere.
 */
export async function readAssignments(form: FormData, eventId: string): Promise<{ list: AssignmentInput[]; error: string | null }> {
	const categories = [...new Set(form.getAll('categories').map(String))].filter(isCategory);
	if (!categories.length) return { list: [], error: 'Choose at least one category.' };

	const [gates, sessions, meals] = await Promise.all([listGates(eventId), listSessions(eventId), listMeals(eventId)]);
	const list: AssignmentInput[] = [];
	for (const category of categories) {
		const a: AssignmentInput = { category };
		if (category === 'gate') {
			const gateId = text(form, 'gateId');
			if (gateId && !gates.some((g) => g.id === gateId)) return { list: [], error: 'Choose a gate from the list.' };
			a.gateId = gateId || null;
		}
		if (category === 'hall') {
			// "hall:<name>" for every session in a hall, "session:<id>" for one session, "" for any.
			const where = text(form, 'hallScope');
			if (where.startsWith('session:')) {
				const id = where.slice(8);
				if (!sessions.some((s) => s.id === id)) return { list: [], error: 'Choose a session from the list.' };
				a.sessionId = id;
			} else if (where.startsWith('hall:')) {
				const hall = where.slice(5);
				if (!sessions.some((s) => s.hall === hall)) return { list: [], error: 'Choose a hall from the list.' };
				a.hall = hall;
			} else {
				return { list: [], error: 'Assign the hall handler to a hall or a session.' };
			}
		}
		if (category === 'food') {
			const mealId = text(form, 'mealId');
			if (mealId && !meals.some((m) => m.id === mealId)) return { list: [], error: 'Choose a meal from the list.' };
			a.mealId = mealId || null;
			a.counterName = text(form, 'counterName').slice(0, 40) || null;
		}
		if (category === 'certificate') a.canIssueCertificates = form.get('canIssue') === 'on';
		list.push(a);
	}
	return { list, error: null };
}

/** Lists for the assignment fields, so the form only offers this event's desks. */
export async function assignmentOptions(eventId: string) {
	const [gates, sessions, meals] = await Promise.all([listGates(eventId), listSessions(eventId), listMeals(eventId)]);
	return {
		gates,
		halls: [...new Set(sessions.map((s) => s.hall))].sort(),
		sessions: sessions.map((s) => ({ id: s.id, hall: s.hall, title: s.title, startsAt: s.startsAt })),
		meals: meals.map((m) => ({ id: m.id, name: m.name, active: m.active }))
	};
}
