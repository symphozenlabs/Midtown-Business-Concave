import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, logout } from '#lib/server/ops/handlers.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.handler) await logout(locals.handler.sessionId);
	cookies.delete(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
	redirect(303, '/handler/login');
};
