import type { RequestEvent } from '@sveltejs/kit';
import { waitUntil } from '@vercel/functions';

/**
 * Runs `task` after the response has gone, so a slow email or push never delays the
 * person who sent a message. Vercel keeps the function alive for it through
 * waitUntil (a no-op elsewhere); Cloudflare through the platform context. Never throws.
 */
export function background(event: RequestEvent, task: () => Promise<unknown>): void {
	let promise: Promise<unknown>;
	try {
		promise = task().catch((e) => console.error('[background]', e));
	} catch (e) {
		console.error('[background]', e);
		return;
	}
	try {
		waitUntil(promise);
	} catch (e) {
		console.error('[background] waitUntil failed', e);
	}
	try {
		(event.platform as { context?: { waitUntil?: (p: Promise<unknown>) => void } } | undefined)?.context?.waitUntil?.(promise);
	} catch {
		// Not on Cloudflare.
	}
}
