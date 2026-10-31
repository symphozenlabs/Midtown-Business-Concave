import { fail, redirect } from '@sveltejs/kit';
import { passwordProblem } from '#lib/server/crypto.ts';
import { changePassword } from '#lib/server/ops/handlers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ forced: Boolean(locals.handler?.mustChangePassword) });

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.handler) redirect(303, '/handler/login');
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const problem = passwordProblem(password);
		if (problem) return fail(400, { message: problem });
		if (password !== confirm) return fail(400, { message: 'The two new passwords do not match.' });
		if (password === current) return fail(400, { message: 'Choose a password different from the current one.' });
		if (!(await changePassword(locals.handler, current, password))) {
			return fail(400, { message: 'Your current password is not right.' });
		}
		redirect(303, '/handler');
	}
};
