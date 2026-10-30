import { isValidEventSettings, type EventSettings } from './event-settings.ts';
import type { RegistrationDraft } from './registration';

export class SubmitError extends Error {
	constructor(
		message: string,
		readonly kind: 'duplicate' | 'invalid' | 'network' | 'unavailable' | 'unknown'
	) {
		super(message);
	}
}

/** A registration awaiting payment: everything the payment step needs. */
export interface PendingRegistration {
	code: string;
	fullName: string;
	email: string;
	amountRupees: number;
	vpa: string;
	payeeName: string;
}

export interface PosterFraming {
	zoom: number;
	dx: number;
	dy: number;
}

async function post(url: string, init: RequestInit) {
	try {
		return await fetch(url, { method: 'POST', ...init });
	} catch {
		throw new SubmitError('We could not reach the server. Check your connection and try again.', 'network');
	}
}

function failure(res: Response, data: { message?: unknown }): never {
	const message = typeof data?.message === 'string' ? data.message : '';
	if (res.status === 409) throw new SubmitError(message, 'duplicate');
	if (res.status === 400 || res.status === 404 || res.status === 413 || res.status === 415) {
		throw new SubmitError(message || 'Some details need attention. Check them and try again.', 'invalid');
	}
	if (res.status === 503) throw new SubmitError(message, 'unavailable');
	throw new SubmitError('Something went wrong. Your details are saved — try again.', 'unknown');
}

/** Sends the registration, photo and finished poster to /api/register. */
export async function submitRegistration(
	draft: RegistrationDraft,
	photo: Blob,
	poster: Blob,
	framing: PosterFraming
): Promise<PendingRegistration> {
	const body = new FormData();
	for (const [key, value] of Object.entries(draft)) {
		if (key === 'interests') continue;
		body.set(key, String(value));
	}
	for (const interest of draft.interests) body.append('interests', interest);
	body.set('zoom', String(framing.zoom));
	body.set('dx', String(framing.dx));
	body.set('dy', String(framing.dy));
	const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
	body.set('photo', photo, `photo.${ext}`);
	body.set('poster', poster, 'poster.jpg');

	const res = await post('/api/register', { body });
	const data = await res.json().catch(() => ({}));
	if (res.ok) return data as PendingRegistration;
	failure(res, data);
}

/** Reports the UPI transaction ID so the organisers can verify the payment. */
export async function submitPayment(pending: PendingRegistration, utr: string): Promise<void> {
	const res = await post('/api/payment', {
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: pending.code, email: pending.email, utr })
	});
	if (res.ok) return;
	failure(res, await res.json().catch(() => ({})));
}

export interface SiteConfig {
	priceRupees: number | null;
	event: EventSettings | null;
}

/** Current ticket price and event schedule, as set on the dashboard. */
export async function fetchSiteConfig(): Promise<SiteConfig> {
	const none: SiteConfig = { priceRupees: null, event: null };
	try {
		const res = await fetch('/api/config');
		if (!res.ok) return none;
		const data = await res.json();
		return {
			priceRupees: typeof data.priceRupees === 'number' ? data.priceRupees : null,
			event: isValidEventSettings(data.event) ? { startsAt: data.event.startsAt, endsAt: data.event.endsAt } : null
		};
	} catch {
		return none;
	}
}
