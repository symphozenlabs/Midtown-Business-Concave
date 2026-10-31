import { fail, redirect } from '@sveltejs/kit';
import { opsReady } from '#lib/server/ops/event.ts';
import { connectionState, consent, publicProfile, withdraw } from '#lib/server/ops/networking.ts';
import { PARTICIPANT_COOKIE, readParticipant, resolveToken } from '#lib/server/ops/passes.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

/**
 * What a phone camera opens when it scans a delegate's QR. Strangers see only the
 * professional card (name, role, company, industry). A delegate signed in to their
 * own pass on this phone can ask to connect.
 */
export const load: PageServerLoad = async ({ params, cookies }) => {
	if (!(await opsReady())) return { valid: false as const };
	const resolved = await resolveToken(params.token);
	if (resolved.status !== 'active') return { valid: false as const, revoked: resolved.status === 'revoked' };

	const viewer = await readParticipant(cookies.get(PARTICIPANT_COOKIE));
	if (viewer?.registrationId === resolved.registrationId) redirect(303, '/me');

	const profile = await publicProfile(resolved.registrationId);
	if (!profile) return { valid: false as const };
	const sameEvent = viewer?.eventId === resolved.eventId;
	return {
		valid: true as const,
		profile,
		signedIn: Boolean(viewer && sameEvent),
		state: viewer && sameEvent ? await connectionState(resolved.eventId, viewer.registrationId, resolved.registrationId) : null
	};
};

async function pair(token: string, cookie: string | undefined) {
	const viewer = await readParticipant(cookie);
	const resolved = await resolveToken(token);
	if (!viewer || resolved.status !== 'active' || viewer.eventId !== resolved.eventId) return null;
	return { eventId: viewer.eventId, me: viewer.registrationId, other: resolved.registrationId };
}

export const actions: Actions = {
	connect: async ({ params, cookies }) => {
		const p = await pair(params.token, cookies.get(PARTICIPANT_COOKIE));
		if (!p) return fail(401, { message: 'Open your own pass from your ticket email on this phone first.' });
		if (!allow(`connect:${p.me}`, 30, 60_000)) return fail(429, { message: 'Too many requests. Wait a moment.' });
		if (!(await publicProfile(p.other))) return fail(409, { message: 'This delegate cannot receive requests.' });
		const state = await consent(p.eventId, p.me, p.other);
		return { success: state === 'connected' ? 'Connected. Contact details are on your pass.' : 'Request sent. You are connected once they accept.' };
	},

	withdraw: async ({ params, cookies }) => {
		const p = await pair(params.token, cookies.get(PARTICIPANT_COOKIE));
		if (!p) return fail(401, { message: 'Open your own pass first.' });
		await withdraw(p.eventId, p.me, p.other);
		return { success: 'Withdrawn.' };
	}
};
