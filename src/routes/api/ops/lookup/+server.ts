import { json } from '@sveltejs/kit';
import { isCategory } from '#lib/ops/categories.ts';
import { assignmentFor } from '#lib/server/ops/handlers.ts';
import { lookup } from '#lib/server/ops/scan.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Manual lookup when a QR will not scan: a few names and registration numbers, nothing more. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const handler = locals.handler;
	if (!handler) return json({ message: 'Sign in again.' }, { status: 401 });
	const category = url.searchParams.get('category');
	if (!isCategory(category) || !assignmentFor(handler, category)) {
		return json({ message: 'You are not assigned to this desk.' }, { status: 403 });
	}
	if (!allow(`lookup:${handler.id}`, 30, 60_000)) return json({ message: 'Too many searches. Wait a moment.' }, { status: 429 });
	return json({ results: await lookup(url.searchParams.get('q') ?? '') });
};
