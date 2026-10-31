import { error, json } from '@sveltejs/kit';
import { getEventSettings, listFrontJobs } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * Everything the organiser's browser needs to redraw every delegate's ID card
 * front, e.g. after the event date or time changed: the current schedule and
 * each delegate's name, title, company, category, photo and framing.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	const [event, jobs] = await Promise.all([getEventSettings(), listFrontJobs()]);
	return json({ event, jobs }, { headers: { 'cache-control': 'no-store' } });
};
