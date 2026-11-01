import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { SESSION_COOKIE, SESSION_COOKIE_PATH, SESSION_HOURS, changeAdminPassword, createSession } from '#lib/server/auth.ts';
import { passwordProblem } from '#lib/server/crypto.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, getClientAddress }) => {
		if (!locals.admin) redirect(303, '/login');
		const form = await request.formData();
		const current = String(form.get('current') ?? '').slice(0, 200);
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const problem = passwordProblem(password);
		if (problem) return fail(400, { message: problem });
		if (password !== confirm) return fail(400, { message: 'The two new passwords do not match.' });
		if (password === current) return fail(400, { message: 'Choose a password different from the current one.' });
		if (!allow(`admin-password:${getClientAddress()}`, 10, 5 * 60_000)) {
			return fail(429, { message: 'Too many attempts. Wait five minutes.' });
		}

		const admin = await changeAdminPassword(locals.admin.email, current, password);
		if (!admin) return fail(400, { message: 'Your current password is not right.' });

		// The old session was signed with the old password; keep this browser signed in.
		cookies.set(SESSION_COOKIE, await createSession(admin), {
			path: SESSION_COOKIE_PATH,
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev,
			maxAge: SESSION_HOURS * 3600
		});
		return { saved: true };
	}
};
