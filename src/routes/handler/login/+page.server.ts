import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { opsReady } from '#lib/server/ops/event.ts';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, login } from '#lib/server/ops/handlers.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

/** Only same-site paths under /handler, so the login cannot be used to redirect elsewhere. */
const safeNext = (next: string | null) => (next && /^\/handler(\/[\w/-]*)?$/.test(next) ? next : '/handler');

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.handler) redirect(303, safeNext(url.searchParams.get('next')));
	return { available: await opsReady(), reset: url.searchParams.has('reset') };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const identifier = String(form.get('identifier') ?? '').trim().slice(0, 120);
		const password = String(form.get('password') ?? '').slice(0, 200);
		const remember = form.get('remember') === 'on';

		if (!(await opsReady())) return fail(503, { identifier, message: 'Event operations are not set up: run db/schema.sql.' });
		if (!identifier || !password) return fail(400, { identifier, message: 'Enter your username or email, and your password.' });
		// Handlers share the venue's Wi-Fi address, so the tight limit is per account and address;
		// the per-address ceiling only stops a scripted attack. Wrong passwords also lock the account.
		const ip = getClientAddress();
		if (!allow(`login:${ip}:${identifier.toLowerCase()}`, 10, 5 * 60_000) || !allow(`login:${ip}`, 200, 5 * 60_000)) {
			return fail(429, { identifier, message: 'Too many attempts. Wait five minutes.' });
		}

		const result = await login(identifier, password, remember, request.headers.get('user-agent') ?? '');
		if (!result.ok) {
			await new Promise((r) => setTimeout(r, 600));
			const message = {
				invalid: 'That username and password do not match.',
				locked: 'Too many wrong passwords. The account is locked for 15 minutes, or ask the administrator to reset it.',
				inactive: 'This account is switched off. Ask the event administrator.'
			}[result.reason];
			return fail(400, { identifier, message });
		}

		cookies.set(SESSION_COOKIE, result.token, { ...SESSION_COOKIE_OPTIONS, secure: !dev, maxAge: result.maxAge });
		redirect(303, result.mustChangePassword ? '/handler/password' : safeNext(url.searchParams.get('next')));
	}
};
