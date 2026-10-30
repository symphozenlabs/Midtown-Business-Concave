import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { SESSION_COOKIE, SESSION_HOURS, checkCredentials, createSession, isAdminConfigured } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.admin) redirect(303, '/admin');
	return { configured: isAdminConfigured };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');

		if (!isAdminConfigured) return fail(503, { email, message: 'Admin sign-in is not set up. Add ADMIN_EMAIL and ADMIN_PASSWORD.' });
		if (!(await checkCredentials(email, password))) {
			// Slow down guessing.
			await new Promise((r) => setTimeout(r, 800));
			return fail(400, { email, message: 'That email and password do not match.' });
		}

		cookies.set(SESSION_COOKIE, await createSession(), {
			path: '/admin',
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev,
			maxAge: SESSION_HOURS * 3600
		});
		redirect(303, '/admin');
	}
};
