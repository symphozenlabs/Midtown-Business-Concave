import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { safeNext } from '#lib/directory/rules.ts';
import { normalisePhone } from '#lib/registration.ts';
import { SESSION_COOKIE, SESSION_COOKIE_PATH, SESSION_HOURS, checkCredentials, createSession, isAdminConfigured } from '#lib/server/auth.ts';
import { audit, opsReady } from '#lib/server/ops/event.ts';
import { SESSION_COOKIE as HANDLER_COOKIE, SESSION_COOKIE_OPTIONS as HANDLER_COOKIE_OPTIONS, login } from '#lib/server/ops/handlers.ts';
import { allow } from '#lib/server/rate-limit.ts';
import { checkExhibitorLogin, exhibitorCookie, readExhibitor, setExhibitorCookie } from '#lib/server/stall-directory/exhibitor.ts';
import type { Actions, PageServerLoad } from './$types';

// Private and per-request: never prerendered.
export const prerender = false;

const EXHIBITOR_HOME = '/stallDirectory/exhibitor';

/** After an exhibitor signs in: only pages inside the exhibitor area. */
const exhibitorNext = (raw: string | null) => {
	const next = safeNext(raw);
	return next && next.startsWith(EXHIBITOR_HOME) ? next : EXHIBITOR_HOME;
};

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const next = url.searchParams.get('next') ?? '';
	// Sent here from an exhibitor page while already signed in as that exhibitor.
	if (next.startsWith(EXHIBITOR_HOME) && (await readExhibitor(cookies))) redirect(303, exhibitorNext(next));
	if (locals.admin) redirect(303, '/admin');
	if (locals.handler) redirect(303, '/handler');
	return { configured: isAdminConfigured, next };
};

/**
 * One sign-in for everyone: the organiser with their email, event handlers with the
 * username (or email) the organiser gave them, and exhibitors with the email they
 * booked their stall with and their mobile number. Each lands on their own pages.
 */
export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const identifier = String(form.get('identifier') ?? form.get('email') ?? '').trim().slice(0, 120);
		const password = String(form.get('password') ?? '').slice(0, 200);
		if (!identifier || !password) return fail(400, { identifier, message: 'Enter your username or email, and your password.' });

		const ip = getClientAddress();
		if (!allow(`signin:${ip}:${identifier.toLowerCase()}`, 10, 5 * 60_000) || !allow(`signin:${ip}`, 200, 5 * 60_000)) {
			return fail(429, { identifier, message: 'Too many attempts. Wait five minutes.' });
		}

		const admin = await checkCredentials(identifier, password);
		if (admin) {
			// Clear a cookie from before sign-in moved to /login, so only one session cookie is sent.
			cookies.delete(SESSION_COOKIE, { path: '/admin' });
			cookies.set(SESSION_COOKIE, await createSession(admin), {
				path: SESSION_COOKIE_PATH,
				httpOnly: true,
				sameSite: 'strict',
				secure: !dev,
				maxAge: SESSION_HOURS * 3600
			});
			redirect(303, '/admin');
		}

		if (await opsReady()) {
			const result = await login(identifier, password, false, request.headers.get('user-agent') ?? '');
			if (result.ok) {
				cookies.set(HANDLER_COOKIE, result.token, { ...HANDLER_COOKIE_OPTIONS, secure: !dev, maxAge: result.maxAge });
				redirect(303, result.mustChangePassword ? '/handler/password' : '/handler');
			}
			if (result.reason !== 'invalid') {
				return fail(400, {
					identifier,
					message:
						result.reason === 'locked'
							? 'Too many wrong passwords. The account is locked for 15 minutes, or ask the organiser to reset it.'
							: 'This account is switched off. Ask the organiser.'
				});
			}
		}

		// A confirmed exhibitor: the booking email, with the mobile number as the password.
		const exhibitor = await checkExhibitorLogin(identifier, password);
		if (exhibitor) {
			setExhibitorCookie(cookies, await exhibitorCookie(exhibitor.bookingId, normalisePhone(password)!));
			await audit({
				actorType: 'system',
				actor: `exhibitor:${exhibitor.email}`,
				action: 'stall_directory.login',
				targetType: 'stall_booking',
				targetId: exhibitor.bookingId
			});
			redirect(303, exhibitorNext(String(form.get('next') ?? '')));
		}

		// Slow down guessing.
		await new Promise((r) => setTimeout(r, 700));
		return fail(400, { identifier, message: 'That username or email and password do not match.' });
	}
};
