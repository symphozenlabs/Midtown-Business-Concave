import { redirect } from '@sveltejs/kit';
import { clearExhibitorCookie } from '#lib/server/stall-directory/exhibitor.ts';
import type { RequestHandler } from './$types';

/** Signs the exhibitor out on this browser. */
export const POST: RequestHandler = async ({ cookies }) => {
	clearExhibitorCookie(cookies);
	redirect(303, '/login');
};
