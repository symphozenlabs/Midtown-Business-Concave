import { json, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, readSession } from '#lib/server/auth.ts';
import { SESSION_COOKIE as HANDLER_COOKIE, readHandlerSession } from '#lib/server/ops/handlers.ts';
import { opsReady } from '#lib/server/ops/event.ts';

/** Handler pages anyone may open: signing in and resetting a forgotten password. */
const HANDLER_PUBLIC = ['/handler/login', '/handler/forgot', '/handler/reset'];

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname === '/admin' || pathname.startsWith('/admin/')) {
		const admin = await readSession(event.cookies.get(SESSION_COOKIE));
		if (admin) event.locals.admin = admin;

		if (!admin && !pathname.startsWith('/admin/login')) {
			if (pathname.startsWith('/admin/media/')) return new Response('Not found', { status: 404 });
			redirect(303, '/admin/login');
		}
	}

	const isHandlerPage = pathname === '/handler' || pathname.startsWith('/handler/');
	const isOpsApi = pathname.startsWith('/api/ops/');
	if ((isHandlerPage || isOpsApi) && (await opsReady())) {
		const handler = await readHandlerSession(event.cookies.get(HANDLER_COOKIE));
		if (handler) event.locals.handler = handler;

		const isPublic = HANDLER_PUBLIC.some((p) => pathname.startsWith(p));
		if (!handler && !isPublic) {
			if (isOpsApi) return json({ message: 'Sign in again.' }, { status: 401 });
			redirect(303, `/handler/login?next=${encodeURIComponent(pathname)}`);
		}
		// A temporary password must be replaced before any desk opens.
		if (handler?.mustChangePassword && !isPublic && pathname !== '/handler/password' && pathname !== '/handler/logout') {
			if (isOpsApi) return json({ message: 'Change your temporary password first.' }, { status: 403 });
			redirect(303, '/handler/password');
		}
	}

	const response = await resolve(event);
	if (pathname.startsWith('/admin') || pathname.startsWith('/api/') || isHandlerPage || pathname.startsWith('/me') || pathname.startsWith('/pass/')) {
		response.headers.set('cache-control', 'no-store');
		response.headers.set('x-robots-tag', 'noindex');
	}
	return response;
};
