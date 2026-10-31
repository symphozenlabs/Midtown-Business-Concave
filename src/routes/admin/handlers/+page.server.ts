import { fail, redirect } from '@sveltejs/kit';
import { overview } from '#lib/server/ops/activity.ts';
import { assignmentOptions, readAssignments, readHandlerInput } from '#lib/server/ops/admin-forms.ts';
import { getDefaultEvent, getEvent, opsReady, listEvents } from '#lib/server/ops/event.ts';
import { DuplicateHandlerError, createHandler, handlerPasswords, isPasswordLookupAvailable, listHandlers } from '#lib/server/ops/handlers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	if (!(await opsReady())) return { available: false as const };
	const event = await getDefaultEvent();
	const [events, handlers, options, ov, passwords] = await Promise.all([
		listEvents(),
		listHandlers(),
		assignmentOptions(event.id),
		overview(event.id),
		handlerPasswords()
	]);
	return {
		available: true as const,
		eventId: event.id,
		events: events.map((e) => ({ id: e.id, name: e.name })),
		handlers,
		// Current sign-in passwords for the organiser (stored encrypted); null where none is stored.
		passwords,
		passwordLookup: isPasswordLookupAvailable,
		options,
		tallies: Object.fromEntries(ov.byHandler.map((h) => [h.id, h.tally])),
		summary: { ...ov.handlers, scans: ov.scans.total }
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const event = await getEvent(String(form.get('eventId') ?? ''));
		if (!event) return fail(400, { message: 'Choose the event.' });

		const { input, errors } = readHandlerInput(form);
		const { list, error } = await readAssignments(form, event.id);
		if (Object.keys(errors).length || error) {
			return fail(400, { errors, message: error ?? 'Check the highlighted fields.', values: input });
		}
		try {
			const { handler, temporaryPassword } = await createHandler(input, event.id, list, locals.admin.email);
			return {
				created: { id: handler.id, fullName: handler.fullName, username: handler.username, password: temporaryPassword }
			};
		} catch (e) {
			if (e instanceof DuplicateHandlerError) return fail(409, { errors: { username: e.message }, message: e.message, values: input });
			throw e;
		}
	}
};
