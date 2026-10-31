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
	/** What to pay now, after any voucher. */
	amountRupees: number;
	vpa: string;
	payeeName: string;
	/** The fee before the voucher. Optional: registrations saved by an older page lack these. */
	priceRupees?: number;
	voucherCode?: string | null;
	discountRupees?: number;
}

/** The parts of a pending registration the server can change while the payment step is open. */
export type PaymentDetails = Pick<
	PendingRegistration,
	'amountRupees' | 'vpa' | 'payeeName' | 'priceRupees' | 'voucherCode' | 'discountRupees'
>;

function readDetails(data: any): PaymentDetails | null {
	if (typeof data?.amountRupees !== 'number' || typeof data.vpa !== 'string' || typeof data.payeeName !== 'string') return null;
	return {
		amountRupees: data.amountRupees,
		vpa: data.vpa,
		payeeName: data.payeeName,
		priceRupees: typeof data.priceRupees === 'number' ? data.priceRupees : data.amountRupees,
		voucherCode: typeof data.voucherCode === 'string' ? data.voucherCode : null,
		discountRupees: typeof data.discountRupees === 'number' ? data.discountRupees : 0
	};
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

/**
 * Reports the UPI transaction ID so the organisers can verify the payment.
 * Null when a voucher covers the whole fee and there is nothing to pay.
 */
export async function submitPayment(pending: PendingRegistration, utr: string | null): Promise<void> {
	const res = await post('/api/payment', {
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(utr ? { code: pending.code, email: pending.email, utr } : { code: pending.code, email: pending.email, free: true })
	});
	if (res.ok) return;
	failure(res, await res.json().catch(() => ({})));
}

/** Applies a voucher code (or, with an empty code, removes it); returns the new amount to pay. */
export async function applyVoucher(pending: PendingRegistration, voucher: string): Promise<PaymentDetails> {
	const res = await post('/api/payment/voucher', {
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: pending.code, email: pending.email, voucher })
	});
	const data = await res.json().catch(() => ({}));
	const details = res.ok ? readDetails(data) : null;
	if (details) return details;
	const message = typeof data?.message === 'string' ? data.message : 'The voucher could not be checked. Please try again.';
	throw new SubmitError(message, res.status === 503 ? 'unavailable' : 'invalid');
}

/**
 * The amount and UPI payee this registration should pay now. The organisers can
 * change the fee or UPI ID after someone registered; null when it can't be checked.
 */
export async function fetchPaymentDetails(pending: PendingRegistration): Promise<PaymentDetails | null> {
	try {
		const res = await fetch('/api/payment/details', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: pending.code, email: pending.email })
		});
		if (!res.ok) return null;
		const data = await res.json();
		if (data.status !== 'pending_payment') return null;
		return readDetails(data);
	} catch {
		return null;
	}
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
