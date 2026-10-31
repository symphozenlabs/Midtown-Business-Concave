import { fail, redirect } from '@sveltejs/kit';
import { passwordProblem } from '#lib/server/crypto.ts';
import { completePasswordReset, isResetValid } from '#lib/server/ops/handlers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({ valid: await isResetValid(params.token) });

export const actions: Actions = {
	default: async ({ request, params }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');
		const problem = passwordProblem(password);
		if (problem) return fail(400, { message: problem });
		if (password !== confirm) return fail(400, { message: 'The two passwords do not match.' });
		if (!(await completePasswordReset(params.token, password))) {
			return fail(400, { message: 'This link has expired or was already used. Ask for a new one.' });
		}
		redirect(303, '/handler/login?reset=1');
	}
};
