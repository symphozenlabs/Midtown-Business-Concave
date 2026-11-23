import { json } from '@sveltejs/kit';
import { directoryViewer } from '#lib/server/directory/viewer.ts';
import { isPushConfigured, removeSubscription, saveSubscription } from '#lib/server/push.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestEvent, RequestHandler } from './$types';

export const prerender = false;

const KEY = /^[A-Za-z0-9_-]{1,200}$/;

function validEndpoint(v: unknown): v is string {
	if (typeof v !== 'string' || v.length > 1000) return false;
	try {
		return new URL(v).protocol === 'https:';
	} catch {
		return false;
	}
}

/** The signed-in delegate's id when push is switched on; otherwise the response to send. */
async function delegate(event: RequestEvent): Promise<string | Response> {
	const viewer = await directoryViewer(event.cookies);
	if (viewer.state !== 'open') return json({ message: 'Sign in again.' }, { status: 401 });
	if (!viewer.settings.pushEnabled || !isPushConfigured) return json({ message: 'Notifications are not switched on.' }, { status: 404 });
	if (!allow(`dirpush:${viewer.me.id}`, 10, 60_000)) return json({ message: 'Too many requests.' }, { status: 429 });
	return viewer.me.id;
}

/** Turn on notifications for this browser. Body: the PushSubscription as JSON. */
export const POST: RequestHandler = async (event) => {
	const me = await delegate(event);
	if (typeof me !== 'string') return me;
	const body = (await event.request.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
	const endpoint = body?.endpoint;
	const p256dh = body?.keys?.p256dh;
	const auth = body?.keys?.auth;
	if (!validEndpoint(endpoint) || typeof p256dh !== 'string' || !KEY.test(p256dh) || typeof auth !== 'string' || !KEY.test(auth)) {
		return json({ message: 'That subscription is not valid.' }, { status: 400 });
	}
	await saveSubscription(me, { endpoint, keys: { p256dh, auth } });
	return json({ ok: true });
};

/** Turn notifications off for this browser. Body: { endpoint }. */
export const DELETE: RequestHandler = async (event) => {
	const me = await delegate(event);
	if (typeof me !== 'string') return me;
	const body = (await event.request.json().catch(() => null)) as { endpoint?: unknown } | null;
	const endpoint = body?.endpoint;
	if (!validEndpoint(endpoint)) return json({ message: 'That subscription is not valid.' }, { status: 400 });
	await removeSubscription(me, endpoint);
	return json({ ok: true });
};
