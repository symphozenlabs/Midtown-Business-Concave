import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '$app/env/private';
import { sql } from './db.ts';

/**
 * Web Push for the visitors directory, behind one small module. Payloads never carry
 * message text: "New message from <name>" / "Tap to read and reply".
 */
export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
export const vapidPublicKey: string | null = isPushConfigured ? VAPID_PUBLIC_KEY! : null;

export interface PushPayload {
	title: string;
	body: string;
	/** Same-site path the notification opens. */
	url: string;
}

export interface Subscription {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

/** Saves this browser for the delegate. A shared phone's subscription moves to whoever turned it on last. */
export async function saveSubscription(registrationId: string, sub: Subscription): Promise<void> {
	await sql()`
		insert into push_subscriptions (registration_id, endpoint, p256dh, auth)
		values (${registrationId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
		on conflict (endpoint) do update set registration_id = excluded.registration_id, p256dh = excluded.p256dh, auth = excluded.auth`;
}

export async function removeSubscription(registrationId: string, endpoint: string): Promise<void> {
	await sql()`delete from push_subscriptions where registration_id = ${registrationId} and endpoint = ${endpoint}`;
}

type WebPush = typeof import('web-push');
let client: Promise<WebPush> | null = null;

function webPush(): Promise<WebPush> {
	client ??= import('web-push').then((m) => {
		const wp = ((m as unknown as { default?: WebPush }).default ?? m) as WebPush;
		wp.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
		return wp;
	});
	return client;
}

/** Sends to every browser the delegate turned on; forgets ones the push service says are gone. Returns how many took it. */
export async function pushTo(registrationId: string, payload: PushPayload): Promise<number> {
	if (!isPushConfigured) return 0;
	const subs = await sql()`select endpoint, p256dh, auth from push_subscriptions where registration_id = ${registrationId}`;
	if (!subs.length) return 0;
	const wp = await webPush();
	const body = JSON.stringify(payload);
	const results = await Promise.allSettled(
		subs.map((s) =>
			// A push service that stops answering mustn't hold the function open.
			wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'high', timeout: 10_000 })
		)
	);
	let delivered = 0;
	for (const [i, r] of results.entries()) {
		if (r.status === 'fulfilled') {
			delivered++;
			continue;
		}
		const status = (r.reason as { statusCode?: number })?.statusCode;
		if (status === 404 || status === 410) {
			await sql()`delete from push_subscriptions where endpoint = ${subs[i].endpoint}`;
		} else {
			console.error('[push] send failed', status ?? r.reason);
		}
	}
	return delivered;
}
