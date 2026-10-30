import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, readSession } from '#lib/server/auth.ts';

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

	const response = await resolve(event);
	if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
		response.headers.set('cache-control', 'no-store');
		response.headers.set('x-robots-tag', 'noindex');
	}
	return response;
};
