import { dev } from '$app/env';
import { PASS_SECRET } from '$app/env/private';
import type { Category } from '#lib/ops/categories.ts';
import { ensureColumn, sql, uniqueViolation } from '../db.ts';
import { DUMMY_HASH, hashPassword, randomToken, seal, sha256Hex, temporaryPassword, unseal, verifyPassword } from '../crypto.ts';
import { audit } from './event.ts';

export type HandlerStatus = 'active' | 'inactive' | 'archived';

/** One desk a handler may work, with the names of its context for display. */
export interface Assignment {
	id: string;
	eventId: string;
	eventName: string;
	category: Category;
	gateId: string | null;
	gateName: string | null;
	/** Any session in this hall, unless sessionId pins one. */
	hall: string | null;
	sessionId: string | null;
	sessionTitle: string | null;
	mealId: string | null;
	mealName: string | null;
	counterName: string | null;
	canIssueCertificates: boolean;
}

export interface Handler {
	id: string;
	fullName: string;
	username: string;
	email: string | null;
	mobile: string | null;
	status: HandlerStatus;
	mustChangePassword: boolean;
	lockedUntil: string | null;
	lastLoginAt: string | null;
	createdAt: string;
	createdBy: string;
	activeSessions: number;
	assignments: Assignment[];
}

/** What the server knows about the handler behind a request. */
export interface HandlerSession {
	sessionId: string;
	id: string;
	fullName: string;
	username: string;
	mustChangePassword: boolean;
	assignments: Assignment[];
}

/** Assignment as written by the admin form. */
export interface AssignmentInput {
	category: Category;
	gateId?: string | null;
	hall?: string | null;
	sessionId?: string | null;
	mealId?: string | null;
	counterName?: string | null;
	canIssueCertificates?: boolean;
}

export interface HandlerInput {
	fullName: string;
	username: string;
	email: string | null;
	mobile: string | null;
}

export class DuplicateHandlerError extends Error {}

export const SESSION_COOKIE = 'mbc_handler';
const SESSION_HOURS = 14;
const REMEMBER_DAYS = 30;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_MINUTES = 30;

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

function assignmentFrom(d: Record<string, any>): Assignment {
	return {
		id: d.id,
		eventId: d.event_id,
		eventName: d.event_name,
		category: d.category,
		gateId: d.gate_id ?? null,
		gateName: d.gate_name ?? null,
		hall: d.hall ?? d.session_hall ?? null,
		sessionId: d.session_id ?? null,
		sessionTitle: d.session_title ?? null,
		mealId: d.meal_id ?? null,
		mealName: d.meal_name ?? null,
		counterName: d.counter_name ?? null,
		canIssueCertificates: Boolean(d.can_issue_certificates)
	};
}

function handlerFrom(r: Record<string, any>): Handler {
	return {
		id: r.id,
		fullName: r.full_name,
		username: r.username,
		email: r.email,
		mobile: r.mobile,
		status: r.status,
		mustChangePassword: r.must_change_password,
		lockedUntil: r.locked_until && new Date(r.locked_until) > new Date() ? iso(r.locked_until) : null,
		lastLoginAt: iso(r.last_login_at),
		createdAt: iso(r.created_at)!,
		createdBy: r.created_by,
		activeSessions: Number(r.active_sessions ?? 0),
		assignments: ((r.assignments ?? []) as Record<string, any>[]).map(assignmentFrom)
	};
}

/* ---------- password look-up for organisers ---------- */

/*
 * Organisers asked to see each handler's current password. Besides the one-way
 * hash used for sign-in, the password is kept encrypted (AES-GCM, key from
 * PASS_SECRET) and only decrypted on the organiser's pages.
 */
const vaultSecret = PASS_SECRET ?? (dev ? 'mbc-development-pass-secret' : undefined);
export const isPasswordLookupAvailable = Boolean(vaultSecret);
const VAULT = 'handler-password';

async function rememberPassword(handlerId: string, password: string) {
	if (!vaultSecret) return;
	try {
		await ensureColumn('event_handlers', 'password_vault');
		await sql()`update event_handlers set password_vault = ${await seal(password, vaultSecret, VAULT)} where id = ${handlerId}`;
	} catch (e) {
		// Sign-in does not depend on this copy, so a failure here must not block the change.
		console.error('[handlers] could not store the password for organisers', e);
	}
}

/** Current passwords by handler id; null where none is stored (set before this existed). */
export async function handlerPasswords(ids?: string[]): Promise<Record<string, string | null>> {
	if (!vaultSecret) return {};
	await ensureColumn('event_handlers', 'password_vault');
	const rows = ids
		? await sql()`select id, password_vault from event_handlers where id = any(${ids}::uuid[])`
		: await sql()`select id, password_vault from event_handlers`;
	const out: Record<string, string | null> = {};
	for (const r of rows) out[r.id] = r.password_vault ? await unseal(r.password_vault, vaultSecret, VAULT) : null;
	return out;
}

/* ---------- admin: accounts ---------- */

export async function listHandlers(includeArchived = false): Promise<Handler[]> {
	const rows = await sql()`
		select h.*,
			(select count(*) from handler_sessions s
				where s.handler_id = h.id and s.revoked_at is null and s.expires_at > now())::int as active_sessions,
			coalesce((select json_agg(d order by d.category_sort) from handler_assignment_details d where d.handler_id = h.id), '[]'::json) as assignments
		from event_handlers h
		where ${includeArchived} or h.status <> 'archived'
		order by h.status = 'active' desc, lower(h.full_name)`;
	return rows.map(handlerFrom);
}

export async function getHandler(id: string): Promise<Handler | null> {
	if (!isUuid(id)) return null;
	const rows = await sql()`
		select h.*,
			(select count(*) from handler_sessions s
				where s.handler_id = h.id and s.revoked_at is null and s.expires_at > now())::int as active_sessions,
			coalesce((select json_agg(d order by d.category_sort) from handler_assignment_details d where d.handler_id = h.id), '[]'::json) as assignments
		from event_handlers h where h.id = ${id}`;
	return rows[0] ? handlerFrom(rows[0]) : null;
}

function assignmentInserts(handlerId: string, eventId: string, list: AssignmentInput[]) {
	return list.map(
		(a) => sql()`
			insert into handler_assignments
				(handler_id, event_id, category, gate_id, hall, session_id, meal_id, counter_name, can_issue_certificates)
			values (${handlerId}, ${eventId}, ${a.category}, ${a.gateId ?? null}, ${a.hall ?? null}, ${a.sessionId ?? null},
				${a.mealId ?? null}, ${a.counterName ?? null}, ${a.canIssueCertificates ?? false})`
	);
}

/** Creates the account and its desks in one transaction; returns the temporary password once. */
export async function createHandler(
	input: HandlerInput,
	eventId: string,
	assignments: AssignmentInput[],
	by: string
): Promise<{ handler: Handler; temporaryPassword: string }> {
	const id = crypto.randomUUID();
	const password = temporaryPassword();
	const hash = await hashPassword(password);
	try {
		await sql().transaction([
			sql()`
				insert into event_handlers (id, full_name, username, email, mobile, password_hash, must_change_password, created_by)
				values (${id}, ${input.fullName}, ${input.username}, ${input.email}, ${input.mobile}, ${hash}, true, ${by})`,
			...assignmentInserts(id, eventId, assignments)
		]);
	} catch (e) {
		const c = uniqueViolation(e);
		if (c === 'event_handlers_username_key') throw new DuplicateHandlerError('That username is taken.');
		if (c === 'event_handlers_email_key') throw new DuplicateHandlerError('Another handler uses that email address.');
		throw e;
	}
	await audit({
		eventId,
		actorType: 'admin',
		actor: by,
		action: 'handler.create',
		targetType: 'handler',
		targetId: id,
		details: { username: input.username, categories: assignments.map((a) => a.category) }
	});
	await rememberPassword(id, password);
	return { handler: (await getHandler(id))!, temporaryPassword: password };
}

export async function updateHandler(id: string, input: HandlerInput, by: string) {
	try {
		await sql()`
			update event_handlers set full_name = ${input.fullName}, username = ${input.username},
				email = ${input.email}, mobile = ${input.mobile}, updated_at = now()
			where id = ${id}`;
	} catch (e) {
		const c = uniqueViolation(e);
		if (c === 'event_handlers_username_key') throw new DuplicateHandlerError('That username is taken.');
		if (c === 'event_handlers_email_key') throw new DuplicateHandlerError('Another handler uses that email address.');
		throw e;
	}
	await audit({ actorType: 'admin', actor: by, action: 'handler.update', targetType: 'handler', targetId: id, details: { ...input } });
}

/** Replaces the handler's desks for one event. Sessions stay signed in and see the change on their next request. */
export async function setAssignments(handlerId: string, eventId: string, list: AssignmentInput[], by: string) {
	const before = await getHandler(handlerId);
	await sql().transaction([
		sql()`delete from handler_assignments where handler_id = ${handlerId} and event_id = ${eventId}`,
		...assignmentInserts(handlerId, eventId, list)
	]);
	await audit({
		eventId,
		actorType: 'admin',
		actor: by,
		action: 'handler.assignments',
		targetType: 'handler',
		targetId: handlerId,
		details: {
			before: before?.assignments.filter((a) => a.eventId === eventId).map((a) => a.category) ?? [],
			after: list
		}
	});
}

export async function revokeSessions(handlerId: string, by: string, exceptSessionId: string | null = null) {
	await sql()`
		update handler_sessions set revoked_at = now()
		where handler_id = ${handlerId} and revoked_at is null and (${exceptSessionId}::uuid is null or id <> ${exceptSessionId}::uuid)`;
	if (by) await audit({ actorType: 'admin', actor: by, action: 'handler.revoke_sessions', targetType: 'handler', targetId: handlerId });
}

export async function setStatus(handlerId: string, status: HandlerStatus, by: string) {
	await sql()`update event_handlers set status = ${status}, updated_at = now() where id = ${handlerId}`;
	if (status !== 'active') await revokeSessions(handlerId, '');
	await audit({ actorType: 'admin', actor: by, action: `handler.${status}`, targetType: 'handler', targetId: handlerId });
}

/** New temporary password; the handler must change it at next sign-in. Signs out every device. */
export async function resetPassword(handlerId: string, by: string): Promise<string> {
	const password = temporaryPassword();
	const hash = await hashPassword(password);
	await sql()`
		update event_handlers set password_hash = ${hash}, must_change_password = true, failed_logins = 0,
			locked_until = null, updated_at = now()
		where id = ${handlerId}`;
	await revokeSessions(handlerId, '');
	await rememberPassword(handlerId, password);
	await audit({ actorType: 'admin', actor: by, action: 'handler.reset_password', targetType: 'handler', targetId: handlerId });
	return password;
}

/** Deletes an account that never scanned anything; otherwise archives it to keep the history. */
export async function deleteOrArchive(handlerId: string, by: string): Promise<'deleted' | 'archived'> {
	const used = await sql()`select 1 from scan_transactions where handler_id = ${handlerId} limit 1`;
	if (used.length) {
		await setStatus(handlerId, 'archived', by);
		return 'archived';
	}
	await sql()`delete from event_handlers where id = ${handlerId}`;
	await audit({ actorType: 'admin', actor: by, action: 'handler.delete', targetType: 'handler', targetId: handlerId });
	return 'deleted';
}

/* ---------- sign-in ---------- */

export type LoginResult =
	| { ok: true; token: string; maxAge: number | undefined; mustChangePassword: boolean }
	| { ok: false; reason: 'invalid' | 'locked' | 'inactive' };

export async function login(identifier: string, password: string, remember: boolean, userAgent: string): Promise<LoginResult> {
	const name = identifier.trim().toLowerCase();
	const rows = await sql()`
		select id, password_hash, status, locked_until, must_change_password from event_handlers
		where lower(username) = ${name} or lower(email) = ${name}
		limit 1`;
	const h = rows[0];
	if (!h) {
		await verifyPassword(password, DUMMY_HASH);
		return { ok: false, reason: 'invalid' };
	}
	if (h.locked_until && new Date(h.locked_until) > new Date()) return { ok: false, reason: 'locked' };

	if (!(await verifyPassword(password, h.password_hash))) {
		await sql()`
			update event_handlers set
				failed_logins = case when failed_logins + 1 >= ${MAX_FAILED_LOGINS} then 0 else failed_logins + 1 end,
				locked_until = case when failed_logins + 1 >= ${MAX_FAILED_LOGINS}
					then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end
			where id = ${h.id}`;
		return { ok: false, reason: 'invalid' };
	}
	if (h.status !== 'active') return { ok: false, reason: 'inactive' };

	const token = randomToken();
	const hours = remember ? REMEMBER_DAYS * 24 : SESSION_HOURS;
	await sql().transaction([
		sql()`update event_handlers set failed_logins = 0, locked_until = null, last_login_at = now() where id = ${h.id}`,
		sql()`
			insert into handler_sessions (handler_id, token_hash, remember, user_agent, expires_at)
			values (${h.id}, ${await sha256Hex(token)}, ${remember}, ${userAgent.slice(0, 300)}, now() + make_interval(hours => ${hours}))`
	]);
	await audit({ actorType: 'handler', actor: h.id, action: 'handler.login', targetType: 'handler', targetId: h.id });
	// Without "remember me" the cookie ends with the browser session (or after SESSION_HOURS).
	return { ok: true, token, maxAge: remember ? hours * 3600 : undefined, mustChangePassword: h.must_change_password };
}

/** Looks up the session behind a cookie; null when expired, revoked or the account is not active. */
export async function readHandlerSession(token: string | undefined): Promise<HandlerSession | null> {
	if (!token || token.length > 100) return null;
	const rows = await sql()`
		select s.id as session_id, s.last_seen_at, h.id, h.full_name, h.username, h.must_change_password,
			coalesce((select json_agg(d order by d.category_sort) from handler_assignment_details d where d.handler_id = h.id), '[]'::json) as assignments
		from handler_sessions s join event_handlers h on h.id = s.handler_id
		where s.token_hash = ${await sha256Hex(token)} and s.revoked_at is null and s.expires_at > now() and h.status = 'active'`;
	const r = rows[0];
	if (!r) return null;
	if (Date.now() - new Date(r.last_seen_at).getTime() > 5 * 60_000) {
		await sql()`update handler_sessions set last_seen_at = now() where id = ${r.session_id}`;
	}
	return {
		sessionId: r.session_id,
		id: r.id,
		fullName: r.full_name,
		username: r.username,
		mustChangePassword: r.must_change_password,
		assignments: (r.assignments as Record<string, any>[]).map(assignmentFrom)
	};
}

export async function logout(sessionId: string) {
	await sql()`update handler_sessions set revoked_at = now() where id = ${sessionId}`;
}

/** The handler sets their own password; other devices are signed out. */
export async function changePassword(session: HandlerSession, current: string, next: string): Promise<boolean> {
	const rows = await sql()`select password_hash from event_handlers where id = ${session.id}`;
	if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) return false;
	const hash = await hashPassword(next);
	await sql()`
		update event_handlers set password_hash = ${hash}, must_change_password = false,
			password_changed_at = now(), updated_at = now()
		where id = ${session.id}`;
	await revokeSessions(session.id, '', session.sessionId);
	await rememberPassword(session.id, next);
	await audit({ actorType: 'handler', actor: session.id, action: 'handler.change_password', targetType: 'handler', targetId: session.id });
	return true;
}

/* ---------- forgotten passwords ---------- */

/** For an active handler with an email address: a one-time reset token, valid for 30 minutes. */
export async function createPasswordReset(identifier: string): Promise<{ email: string; fullName: string; token: string } | null> {
	const name = identifier.trim().toLowerCase();
	const rows = await sql()`
		select id, email, full_name from event_handlers
		where (lower(username) = ${name} or lower(email) = ${name}) and status = 'active' and email is not null
		limit 1`;
	const h = rows[0];
	if (!h) return null;
	const token = randomToken();
	await sql()`
		insert into handler_password_resets (handler_id, token_hash, expires_at)
		values (${h.id}, ${await sha256Hex(token)}, now() + make_interval(mins => ${RESET_MINUTES}))`;
	await audit({ actorType: 'handler', actor: h.id, action: 'handler.request_reset', targetType: 'handler', targetId: h.id });
	return { email: h.email, fullName: h.full_name, token };
}

export async function isResetValid(token: string) {
	const rows = await sql()`
		select 1 from handler_password_resets
		where token_hash = ${await sha256Hex(token)} and used_at is null and expires_at > now()`;
	return rows.length > 0;
}

/** Uses the token once: sets the password and signs out every device. */
export async function completePasswordReset(token: string, password: string): Promise<boolean> {
	const rows = await sql()`
		update handler_password_resets set used_at = now()
		where token_hash = ${await sha256Hex(token)} and used_at is null and expires_at > now()
		returning handler_id`;
	if (!rows[0]) return false;
	const id = rows[0].handler_id;
	const hash = await hashPassword(password);
	await sql()`
		update event_handlers set password_hash = ${hash}, must_change_password = false, failed_logins = 0,
			locked_until = null, password_changed_at = now(), updated_at = now()
		where id = ${id}`;
	await revokeSessions(id, '');
	await rememberPassword(id, password);
	await audit({ actorType: 'handler', actor: id, action: 'handler.reset_password_self', targetType: 'handler', targetId: id });
	return true;
}

/* ---------- authorisation ---------- */

/**
 * The handler's assignment for a desk, or null. Every handler page and every
 * desk API calls this: hiding a button is not access control.
 */
export function assignmentFor(session: HandlerSession, category: Category, eventId?: string): Assignment | null {
	return session.assignments.find((a) => a.category === category && (!eventId || a.eventId === eventId)) ?? null;
}

export const SESSION_COOKIE_OPTIONS = { path: '/', httpOnly: true, sameSite: 'lax' as const };
