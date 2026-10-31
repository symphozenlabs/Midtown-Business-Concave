import { opsReady } from '#lib/server/ops/event.ts';
import type { LayoutServerLoad } from './$types';

// Desk pages are private and live: never prerendered or indexed.
export const prerender = false;

export const load: LayoutServerLoad = async ({ locals }) => ({
	opsAvailable: await opsReady(),
	handler: locals.handler
		? {
				fullName: locals.handler.fullName,
				username: locals.handler.username,
				mustChangePassword: locals.handler.mustChangePassword,
				desks: locals.handler.assignments.length
			}
		: null
});
