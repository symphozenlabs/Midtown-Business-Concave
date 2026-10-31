import { isDatabaseConfigured, sql } from '../db.ts';

/**
 * Event operations need Neon: unlike registrations there is no in-memory stand-in,
 * because duplicate protection lives in the database's unique indexes.
 * For local development, point DATABASE_URL at a local Neon HTTP proxy.
 */
export const isOpsAvailable = isDatabaseConfigured;

let schemaReady = false;

/**
 * True once db/schema.sql has added the event-operations tables. Until then the
 * new features stay switched off instead of failing, so registrations and the
 * organiser dashboard keep working on a database that has not been migrated.
 * Only a positive answer is cached: running the schema switches them on.
 */
export async function opsReady(): Promise<boolean> {
	if (!isOpsAvailable) return false;
	if (schemaReady) return true;
	try {
		const [r] = await sql()`
			select to_regclass('public.handler_assignment_details') is not null
				and exists (select 1 from information_schema.columns
					where table_schema = 'public' and table_name = 'registrations' and column_name = 'pass_emailed_at') as ready`;
		schemaReady = Boolean(r?.ready);
	} catch (e) {
		console.error('[ops] could not check the database schema', e);
	}
	return schemaReady;
}

export const EVENT_SLUG = 'mbc-2026';

export interface CertificateRules {
	requirePaid: boolean;
	requireCheckin: boolean;
	/** 0–100: share of attendance-counted sessions the delegate attended. */
	minAttendancePct: number;
	requiredSessionIds: string[];
}

export interface OpsEvent {
	id: string;
	slug: string;
	name: string;
	allowReentry: boolean;
	certificateRules: CertificateRules;
}

export interface Gate {
	id: string;
	name: string;
}

export interface ConferenceSession {
	id: string;
	hall: string;
	title: string;
	startsAt: string;
	endsAt: string;
	countsForAttendance: boolean;
}

export type MealEligibility = 'paid' | 'checked_in';

export interface Meal {
	id: string;
	name: string;
	startsAt: string | null;
	endsAt: string | null;
	maxPerParticipant: number;
	eligibility: MealEligibility;
	active: boolean;
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

export const DEFAULT_RULES: CertificateRules = {
	requirePaid: true,
	requireCheckin: true,
	minAttendancePct: 0,
	requiredSessionIds: []
};

function rulesFrom(v: unknown): CertificateRules {
	const r = (v ?? {}) as Partial<CertificateRules>;
	return {
		requirePaid: r.requirePaid !== false,
		requireCheckin: r.requireCheckin !== false,
		minAttendancePct: Math.min(100, Math.max(0, Number(r.minAttendancePct) || 0)),
		requiredSessionIds: Array.isArray(r.requiredSessionIds) ? r.requiredSessionIds.map(String) : []
	};
}

function eventFrom(r: Record<string, any>): OpsEvent {
	return {
		id: r.id,
		slug: r.slug,
		name: r.name,
		allowReentry: r.allow_reentry,
		certificateRules: rulesFrom(r.certificate_rules)
	};
}

export async function listEvents(): Promise<OpsEvent[]> {
	const rows = await sql()`select * from events order by created_at`;
	return rows.map(eventFrom);
}

export async function getEvent(id: string): Promise<OpsEvent | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const rows = await sql()`select * from events where id = ${id}`;
	return rows[0] ? eventFrom(rows[0]) : null;
}

/** The conclave itself. Registrations belong to it. */
export async function getDefaultEvent(): Promise<OpsEvent> {
	const rows = await sql()`select * from events where slug = ${EVENT_SLUG}`;
	if (!rows[0]) throw new Error('The events table has no mbc-2026 row. Run db/schema.sql.');
	return eventFrom(rows[0]);
}

export async function saveEventRules(eventId: string, allowReentry: boolean, rules: CertificateRules) {
	await sql()`
		update events set allow_reentry = ${allowReentry}, certificate_rules = ${JSON.stringify(rules)}::jsonb, updated_at = now()
		where id = ${eventId}`;
}

/* ---------- gates ---------- */

export async function listGates(eventId: string): Promise<Gate[]> {
	const rows = await sql()`select id, name from event_gates where event_id = ${eventId} order by lower(name)`;
	return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function addGate(eventId: string, name: string) {
	await sql()`insert into event_gates (event_id, name) values (${eventId}, ${name})`;
}

export async function deleteGate(eventId: string, id: string) {
	await sql()`delete from event_gates where event_id = ${eventId} and id = ${id}`;
}

/* ---------- halls and sessions ---------- */

function sessionFrom(r: Record<string, any>): ConferenceSession {
	return {
		id: r.id,
		hall: r.hall,
		title: r.title,
		startsAt: iso(r.starts_at)!,
		endsAt: iso(r.ends_at)!,
		countsForAttendance: r.counts_for_attendance
	};
}

export async function listSessions(eventId: string): Promise<ConferenceSession[]> {
	const rows = await sql()`select * from conference_sessions where event_id = ${eventId} order by starts_at, hall`;
	return rows.map(sessionFrom);
}

export async function addSession(eventId: string, s: Omit<ConferenceSession, 'id'>) {
	await sql()`
		insert into conference_sessions (event_id, hall, title, starts_at, ends_at, counts_for_attendance)
		values (${eventId}, ${s.hall}, ${s.title}, ${s.startsAt}, ${s.endsAt}, ${s.countsForAttendance})`;
}

export async function deleteSession(eventId: string, id: string) {
	await sql()`delete from conference_sessions where event_id = ${eventId} and id = ${id}`;
}

/* ---------- meals ---------- */

function mealFrom(r: Record<string, any>): Meal {
	return {
		id: r.id,
		name: r.name,
		startsAt: iso(r.starts_at),
		endsAt: iso(r.ends_at),
		maxPerParticipant: r.max_per_participant,
		eligibility: r.eligibility,
		active: r.active
	};
}

export async function listMeals(eventId: string): Promise<Meal[]> {
	const rows = await sql()`select * from meal_categories where event_id = ${eventId} order by starts_at nulls last, created_at`;
	return rows.map(mealFrom);
}

export async function addMeal(eventId: string, m: Omit<Meal, 'id' | 'active'>) {
	await sql()`
		insert into meal_categories (event_id, name, starts_at, ends_at, max_per_participant, eligibility)
		values (${eventId}, ${m.name}, ${m.startsAt}, ${m.endsAt}, ${m.maxPerParticipant}, ${m.eligibility})`;
}

export async function setMealActive(eventId: string, id: string, active: boolean) {
	await sql()`update meal_categories set active = ${active} where event_id = ${eventId} and id = ${id}`;
}

export async function deleteMeal(eventId: string, id: string) {
	await sql()`delete from meal_categories where event_id = ${eventId} and id = ${id}`;
}

/* ---------- audit log ---------- */

export type ActorType = 'admin' | 'handler' | 'participant' | 'system';

export interface AuditEntry {
	eventId?: string | null;
	actorType: ActorType;
	actor: string;
	action: string;
	targetType?: string;
	targetId?: string;
	details?: Record<string, unknown>;
}

/** Records who changed what. Never throws: a failed log line must not undo the change. */
export async function audit(entry: AuditEntry) {
	try {
		await sql()`
			insert into audit_logs (event_id, actor_type, actor, action, target_type, target_id, details)
			values (${entry.eventId ?? null}, ${entry.actorType}, ${entry.actor}, ${entry.action},
				${entry.targetType ?? null}, ${entry.targetId ?? null}, ${entry.details ? JSON.stringify(entry.details) : null}::jsonb)`;
	} catch (e) {
		console.error('[audit] could not record', entry.action, e);
	}
}
