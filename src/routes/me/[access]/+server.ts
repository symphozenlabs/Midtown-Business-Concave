import { redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { opsReady } from '#lib/server/ops/event.ts';
import { PARTICIPANT_COOKIE, participantCookie, verifyAccess } from '#lib/server/ops/passes.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** The private link from the ticket email: signs this phone in to the delegate's pass, then shows it. */
export const GET: RequestHandler = async ({ params, cookies, getClientAddress }) => {
	// Delegates share the venue Wi-Fi address; the 128-bit link signature is the real guard.
	if (!(await opsReady()) || !allow(`me:${getClientAddress()}`, 300, 60_000)) redirect(303, '/me?link=invalid');
	const access = await verifyAccess(params.access);
	if (!access) redirect(303, '/me?link=invalid');
	const cookie = await participantCookie(access.registrationId, access.version);
	cookies.set(PARTICIPANT_COOKIE, cookie.value, { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: cookie.maxAge });
	redirect(303, '/me');
};
