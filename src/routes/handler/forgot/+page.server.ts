import { fail } from '@sveltejs/kit';
import { sendHandlerResetEmail } from '#lib/server/email.ts';
import { opsReady } from '#lib/server/ops/event.ts';
import { createPasswordReset } from '#lib/server/ops/handlers.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { Actions } from './$types';

const SENT = 'If that account has an email address, a reset link is on its way. It works for 30 minutes.';

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const identifier = String((await request.formData()).get('identifier') ?? '').trim().slice(0, 120);
		if (!(await opsReady())) return fail(503, { message: 'Event operations are not set up yet.' });
		if (!identifier) return fail(400, { message: 'Enter your username or email.' });
		if (!allow(`forgot:${getClientAddress()}:${identifier.toLowerCase()}`, 3, 15 * 60_000) || !allow(`forgot:${getClientAddress()}`, 30, 15 * 60_000)) {
			return fail(429, { message: 'Too many requests. Wait a few minutes, or ask the administrator.' });
		}

		// The same answer whether or not the account exists, so this cannot be used to find usernames.
		const reset = await createPasswordReset(identifier);
		if (reset) {
			try {
				await sendHandlerResetEmail(reset.email, reset.fullName, `${url.origin}/handler/reset/${reset.token}`);
			} catch (e) {
				console.error('[handler] reset email failed', e);
			}
		}
		return { sent: SENT };
	}
};
