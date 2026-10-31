import { json } from '@sveltejs/kit';
import { isCategory } from '#lib/ops/categories.ts';
import { audit } from '#lib/server/ops/event.ts';
import { assignmentFor } from '#lib/server/ops/handlers.ts';
import { performScan, type ScanRequest } from '#lib/server/ops/scan.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const ACTIONS = ['check', 'issue', 'profile', 'introduce'] as const;
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** Every desk scans through here. The handler's assignment is checked on each request. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const handler = locals.handler;
	if (!handler) return json({ message: 'Sign in again.' }, { status: 401 });
	// A busy gate scans every two or three seconds; this only stops runaway clients.
	if (!allow(`scan:${handler.id}`, 120, 60_000)) {
		return json({ message: 'Too many scans in a minute. Wait a moment.' }, { status: 429 });
	}

	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const category = body?.category;
	const scanned = str(body?.scanned);
	if (!isCategory(category) || !scanned) return json({ message: 'Send a category and the scanned text.' }, { status: 400 });

	const eventId = str(body?.eventId, 36);
	const assignment = assignmentFor(handler, category, eventId);
	if (!assignment) {
		await audit({
			actorType: 'handler',
			actor: handler.id,
			action: 'scan.forbidden',
			targetType: 'category',
			targetId: category
		});
		return json({ message: 'You are not assigned to this desk.' }, { status: 403 });
	}

	const action = ACTIONS.find((a) => a === body?.action);
	const req: ScanRequest = {
		category,
		scanned,
		clientScanId: str(body?.clientScanId, 36),
		sessionId: str(body?.sessionId, 36),
		mealId: str(body?.mealId, 36),
		action,
		withScanned: str(body?.withScanned),
		// Only hall attendance may be recorded after the fact (the offline queue).
		scannedAt: category === 'hall' ? str(body?.scannedAt, 40) : undefined
	};
	return json(await performScan(handler, assignment, req));
};
