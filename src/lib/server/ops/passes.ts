import { dev } from '$app/env';
import { PASS_SECRET } from '$app/env/private';
import type { EventSettings } from '#lib/event-settings.ts';
import { sql } from '../db.ts';
import { b64url, bytesEqual, fromB64url, hmac, hmacKey, sha256Hex } from '../crypto.ts';
import type { PassEmail } from '../email.ts';
import { qrPng } from '../qr-png.ts';
import { getEventSettings } from '../store.ts';
import { audit, getDefaultEvent, opsReady } from './event.ts';

/**
 * One QR per participant. The QR carries https://<site>/pass/<token>, nothing
 * personal. The token is an HMAC of the registration id and a version number,
 * so it can be shown again at any time without being stored; the database keeps
 * only its SHA-256 to resolve scans. Reissuing bumps the version, which revokes
 * the old QR and the old "My pass" link together.
 */

const secret = PASS_SECRET ?? (dev ? 'mbc-development-pass-secret' : undefined);
export const isPassConfigured = Boolean(secret);

let keyPromise: Promise<CryptoKey> | null = null;
const key = () => (keyPromise ??= hmacKey(`mbc-pass:${secret}`));

/** 128 bits: 22 URL-safe characters. */
async function sign(purpose: string, ...parts: (string | number)[]) {
	return b64url((await hmac(await key(), [purpose, ...parts].join(':'))).slice(0, 16));
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^MBC-[A-Z0-9]{6}$/;

export interface Pass {
	registrationId: string;
	eventId: string;
	version: number;
	token: string;
}

export async function qrToken(registrationId: string, version: number) {
	return sign('qr', registrationId, version);
}

export const passUrl = (origin: string, token: string) => `${origin}/pass/${token}`;

/** The participant's current pass, created on first use. */
export async function ensurePass(eventId: string, registrationId: string): Promise<Pass> {
	const existing = await sql()`
		select version from participant_qr_tokens
		where event_id = ${eventId} and registration_id = ${registrationId} and revoked_at is null`;
	if (existing[0]) {
		const version = existing[0].version as number;
		return { registrationId, eventId, version, token: await qrToken(registrationId, version) };
	}
	const latest = await sql()`
		select coalesce(max(version), 0)::int as v from participant_qr_tokens
		where event_id = ${eventId} and registration_id = ${registrationId}`;
	const version = latest[0].v + 1;
	const token = await qrToken(registrationId, version);
	// Two requests creating the same pass at once: the unique index keeps one, both return it.
	await sql()`
		insert into participant_qr_tokens (event_id, registration_id, token_hash, version)
		values (${eventId}, ${registrationId}, ${await sha256Hex(token)}, ${version})
		on conflict do nothing`;
	return ensurePass(eventId, registrationId);
}

/** Revokes the participant's QR and issues the next one. The old code then scans as revoked. */
export async function reissuePass(eventId: string, registrationId: string, by: string): Promise<Pass> {
	const latest = await sql()`
		select coalesce(max(version), 0)::int as v from participant_qr_tokens
		where event_id = ${eventId} and registration_id = ${registrationId}`;
	const version = latest[0].v + 1;
	const token = await qrToken(registrationId, version);
	await sql().transaction([
		sql()`
			update participant_qr_tokens set revoked_at = now(), revoked_by = ${by}
			where event_id = ${eventId} and registration_id = ${registrationId} and revoked_at is null`,
		sql()`
			insert into participant_qr_tokens (event_id, registration_id, token_hash, version)
			values (${eventId}, ${registrationId}, ${await sha256Hex(token)}, ${version})`
	]);
	await audit({ eventId, actorType: 'admin', actor: by, action: 'pass.reissue', targetType: 'registration', targetId: registrationId });
	return { registrationId, eventId, version, token };
}

export type Resolved =
	| { status: 'active'; registrationId: string; eventId: string; version: number }
	| { status: 'revoked'; registrationId: string; eventId: string }
	| { status: 'unknown' };

export async function resolveToken(token: string): Promise<Resolved> {
	if (!TOKEN.test(token)) return { status: 'unknown' };
	const rows = await sql()`
		select registration_id, event_id, version, revoked_at from participant_qr_tokens
		where token_hash = ${await sha256Hex(token)}`;
	const r = rows[0];
	if (!r) return { status: 'unknown' };
	if (r.revoked_at) return { status: 'revoked', registrationId: r.registration_id, eventId: r.event_id };
	return { status: 'active', registrationId: r.registration_id, eventId: r.event_id, version: r.version };
}

/**
 * What a handler's scanner read: a pass URL from any host, a bare token, or a
 * registration number typed in at the manual lookup.
 */
export function parseScanned(text: string): { token: string } | { code: string } | null {
	const value = text.trim();
	const fromUrl = value.match(/\/pass\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/);
	if (fromUrl) return { token: fromUrl[1] };
	if (TOKEN.test(value)) return { token: value };
	const code = value.toUpperCase();
	if (CODE.test(code)) return { code };
	return null;
}

/* ---------- the back of the ID card ---------- */

/**
 * Versioned, so a reissued QR makes the old back out of date. The key also carries
 * the schedule printed on the artwork, so changing the event date or time in Event
 * setup makes every back stale too. Bump BACK_DESIGN when the back's layout changes:
 * every existing back then has a stale key, and the admin dashboard redraws them all.
 */
// 3: name, photo and designation taken off the back (they are on the front).
const BACK_DESIGN = 3;
const scheduleTag = (event: EventSettings) =>
	[event.startsAt, event.endsAt].map((t) => (Date.parse(t) / 60000).toString(36)).join('-');
export const cardBackKey = (registrationId: string, version: number, event: EventSettings) =>
	`registrations/2026/${registrationId}-back-d${BACK_DESIGN}-v${version}-s${scheduleTag(event)}.jpg`;

export interface CardBackJob {
	id: string;
	/** Where the finished back must be stored. */
	key: string;
	/** What its QR encodes: the delegate's pass link. */
	qrText: string;
}

/**
 * Paid delegates whose ID card back is missing or shows an old QR. The organiser's
 * browser draws these with the poster artwork and uploads them.
 */
export async function cardBacksToMake(
	regs: { id: string; ticketBackKey: string | null }[],
	origin: string,
	limit = 12
): Promise<CardBackJob[]> {
	if (!regs.length || !isPassConfigured || !(await opsReady())) return [];
	const [event, schedule] = await Promise.all([getDefaultEvent(), getEventSettings()]);
	const rows = await sql()`
		select registration_id, version from participant_qr_tokens
		where event_id = ${event.id} and revoked_at is null and registration_id = any(${regs.map((r) => r.id)}::uuid[])`;
	const versions = new Map<string, number>(rows.map((r) => [r.registration_id, r.version]));
	const jobs: CardBackJob[] = [];
	for (const reg of regs) {
		if (jobs.length >= limit) break;
		const version = versions.get(reg.id) ?? (await ensurePass(event.id, reg.id)).version;
		const key = cardBackKey(reg.id, version, schedule);
		if (reg.ticketBackKey === key) continue;
		jobs.push({ id: reg.id, key, qrText: passUrl(origin, await qrToken(reg.id, version)) });
	}
	return jobs;
}

/** The key a back for this delegate must have right now, or null when passes are off. */
export async function currentCardBackKey(registrationId: string): Promise<string | null> {
	if (!isPassConfigured || !(await opsReady())) return null;
	const [event, schedule] = await Promise.all([getDefaultEvent(), getEventSettings()]);
	return cardBackKey(registrationId, (await ensurePass(event.id, registrationId)).version, schedule);
}

/* ---------- emailing passes ---------- */

/** QR and "My pass" link for a delegate's email, or null when passes are not set up. */
export async function passEmailFor(reg: { id: string; code: string }, origin: string): Promise<PassEmail | null> {
	if (!isPassConfigured || !(await opsReady())) return null;
	const event = await getDefaultEvent();
	const pass = await ensurePass(event.id, reg.id);
	return {
		myPassUrl: origin + (await accessPath(reg.code, reg.id, pass.version)),
		qr: await qrPng(passUrl(origin, pass.token))
	};
}

export async function markPassEmailed(registrationId: string) {
	await sql()`update registrations set pass_emailed_at = now() where id = ${registrationId}`;
}

/** Paid delegates whose ticket went out without a pass. */
export async function passesToSend(limit: number): Promise<{ ids: string[]; total: number }> {
	if (!isPassConfigured || !(await opsReady())) return { ids: [], total: 0 };
	const rows = await sql()`
		select id, count(*) over ()::int as total from registrations
		where status = 'paid' and ticket_emailed_at is not null and pass_emailed_at is null
		order by ticket_emailed_at limit ${limit}`;
	return { ids: rows.map((r) => r.id), total: rows[0]?.total ?? 0 };
}

/* ---------- the participant's own "My pass" link and cookie ---------- */

export const PARTICIPANT_COOKIE = 'mbc_me';
const PARTICIPANT_DAYS = 30;

/** /me/<code>.<signature>: emailed to the participant only, never printed in the QR. */
export async function accessPath(code: string, registrationId: string, version: number) {
	return `/me/${code}.${await sign('me', registrationId, version)}`;
}

/** Checks a "My pass" link against the participant's current pass version. */
export async function verifyAccess(param: string): Promise<{ registrationId: string; eventId: string; version: number } | null> {
	const [code, signature] = param.split('.');
	if (!code || !signature || !CODE.test(code)) return null;
	const rows = await sql()`
		select t.registration_id, t.event_id, t.version from participant_qr_tokens t
		join registrations r on r.id = t.registration_id
		where r.code = ${code} and t.revoked_at is null`;
	const r = rows[0];
	if (!r) return null;
	const expected = await sign('me', r.registration_id, r.version);
	if (!bytesEqual(fromB64url(signature), fromB64url(expected))) return null;
	return { registrationId: r.registration_id, eventId: r.event_id, version: r.version };
}

export async function participantCookie(registrationId: string, version: number) {
	const exp = Date.now() + PARTICIPANT_DAYS * 86_400_000;
	return { value: `${registrationId}.${version}.${exp}.${await sign('session', registrationId, version, exp)}`, maxAge: PARTICIPANT_DAYS * 86_400 };
}

/** The participant signed in on this phone, if their pass has not been reissued since. */
export async function readParticipant(cookie: string | undefined): Promise<{ registrationId: string; eventId: string } | null> {
	if (!cookie || !isPassConfigured) return null;
	const [id, version, exp, signature] = cookie.split('.');
	if (!id || !version || !exp || !signature || Number(exp) < Date.now()) return null;
	try {
		if (!bytesEqual(fromB64url(signature), fromB64url(await sign('session', id, Number(version), Number(exp))))) return null;
	} catch {
		return null;
	}
	const rows = await sql()`
		select event_id from participant_qr_tokens
		where registration_id = ${id} and version = ${Number(version)} and revoked_at is null`;
	return rows[0] ? { registrationId: id, eventId: rows[0].event_id } : null;
}
