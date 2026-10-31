import { error, fail, redirect } from '@sveltejs/kit';
import { listAudit, listTransactions, readFilter } from '#lib/server/ops/activity.ts';
import { assignmentOptions, readAssignments, readHandlerInput } from '#lib/server/ops/admin-forms.ts';
import { getDefaultEvent, opsReady } from '#lib/server/ops/event.ts';
import {
	DuplicateHandlerError,
	deleteOrArchive,
	getHandler,
	resetPassword,
	revokeSessions,
	setAssignments,
	setStatus,
	updateHandler
} from '#lib/server/ops/handlers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.admin) redirect(303, '/admin/login');
	if (!(await opsReady())) redirect(303, '/admin/handlers');
	const handler = await getHandler(params.id);
	if (!handler) error(404, 'No such handler.');
	const event = await getDefaultEvent();
	const filter = { ...readFilter(new URLSearchParams()), handlerId: handler.id };
	const [options, transactions, auditLog] = await Promise.all([
		assignmentOptions(event.id),
		listTransactions(event.id, filter, 50),
		listAudit(50, handler.id)
	]);
	return { handler, eventId: event.id, options, transactions, auditLog };
};

const by = (locals: App.Locals) => locals.admin!.email;

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const { input, errors } = readHandlerInput(await request.formData());
		if (Object.keys(errors).length) return fail(400, { errors, message: 'Check the highlighted fields.' });
		try {
			await updateHandler(params.id, input, by(locals));
		} catch (e) {
			if (e instanceof DuplicateHandlerError) return fail(409, { errors: { username: e.message }, message: e.message });
			throw e;
		}
		return { success: 'Details saved.' };
	},

	assignments: async ({ request, locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const event = await getDefaultEvent();
		const { list, error: problem } = await readAssignments(await request.formData(), event.id);
		if (problem) return fail(400, { message: problem });
		await setAssignments(params.id, event.id, list, by(locals));
		return { success: 'Categories saved. The handler sees the change on their next tap.' };
	},

	resetPassword: async ({ locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const password = await resetPassword(params.id, by(locals));
		return { password, success: 'Password reset and every device signed out.' };
	},

	activate: async ({ locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		await setStatus(params.id, 'active', by(locals));
		return { success: 'Account activated.' };
	},

	deactivate: async ({ locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		await setStatus(params.id, 'inactive', by(locals));
		return { success: 'Account deactivated and signed out everywhere.' };
	},

	revoke: async ({ locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		await revokeSessions(params.id, by(locals));
		return { success: 'Signed out of every device.' };
	},

	remove: async ({ locals, params }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const outcome = await deleteOrArchive(params.id, by(locals));
		if (outcome === 'deleted') redirect(303, '/admin/handlers');
		return { success: 'This handler has scan history, so the account was archived instead of deleted. Their records stay.' };
	}
};
