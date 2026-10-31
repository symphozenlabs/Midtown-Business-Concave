import { isCategory, type Category } from '#lib/ops/categories.ts';
import { sql } from '../db.ts';

export type ScanLogResult = 'success' | 'duplicate' | 'rejected';
export const SCAN_RESULTS: ScanLogResult[] = ['success', 'duplicate', 'rejected'];

export interface Tally {
	success: number;
	duplicate: number;
	rejected: number;
}

export interface Transaction {
	id: string;
	at: string;
	category: Category;
	result: ScanLogResult;
	code: string;
	title: string;
	handlerName: string | null;
	handlerUsername: string | null;
	participantName: string | null;
	participantCode: string | null;
	context: Record<string, unknown> | null;
}

const emptyTally = (): Tally => ({ success: 0, duplicate: 0, rejected: 0 });

/** Today's scans, from midnight in India. */
export async function handlerToday(handlerId: string, category: Category): Promise<Tally> {
	const rows = await sql()`
		select result, count(*)::int as n from scan_transactions
		where handler_id = ${handlerId} and category = ${category}
			and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
		group by result`;
	const tally = emptyTally();
	for (const r of rows) tally[r.result as ScanLogResult] = r.n;
	return tally;
}

function transactionFrom(r: Record<string, any>): Transaction {
	return {
		id: r.id,
		at: new Date(r.created_at).toISOString(),
		category: r.category,
		result: r.result,
		code: r.code,
		title: r.message,
		handlerName: r.handler_name ?? null,
		handlerUsername: r.handler_username ?? null,
		participantName: r.participant_name ?? null,
		participantCode: r.participant_code ?? null,
		context: r.context ?? null
	};
}

export async function handlerRecent(handlerId: string, category: Category, limit = 8): Promise<Transaction[]> {
	const rows = await sql()`
		select t.*, r.full_name as participant_name, r.code as participant_code
		from scan_transactions t left join registrations r on r.id = t.registration_id
		where t.handler_id = ${handlerId} and t.category = ${category}
		order by t.created_at desc limit ${limit}`;
	return rows.map(transactionFrom);
}

/* ---------- organiser monitoring ---------- */

export interface Overview {
	handlers: { total: number; active: number; onlineNow: number };
	scans: Tally & { total: number };
	byCategory: Record<Category, Tally>;
	byHandler: { id: string; name: string; username: string; tally: Tally; lastScanAt: string | null }[];
	desks: { checkedIn: number; reentries: number; certificates: number; connections: number };
	meals: { id: string; name: string; served: number }[];
	sessions: { id: string; hall: string; title: string; attended: number }[];
	registrationsPaid: number;
}

export async function overview(eventId: string): Promise<Overview> {
	const [handlers, scans, perHandler, desks, meals, sessions] = await Promise.all([
		sql()`
			select count(*) filter (where status <> 'archived')::int as total,
				count(*) filter (where status = 'active')::int as active,
				(select count(distinct handler_id) from handler_sessions
					where revoked_at is null and expires_at > now() and last_seen_at > now() - interval '15 minutes')::int as online
			from event_handlers`,
		sql()`
			select category, result, count(*)::int as n from scan_transactions
			where event_id = ${eventId} group by category, result`,
		sql()`
			select h.id, h.full_name, h.username,
				count(t.id) filter (where t.result = 'success')::int as success,
				count(t.id) filter (where t.result = 'duplicate')::int as duplicate,
				count(t.id) filter (where t.result = 'rejected')::int as rejected,
				max(t.created_at) as last_scan
			from event_handlers h left join scan_transactions t on t.handler_id = h.id and t.event_id = ${eventId}
			where h.status <> 'archived'
			group by h.id order by count(t.id) desc, lower(h.full_name)`,
		sql()`
			select
				(select count(*) from gate_checkins where event_id = ${eventId} and kind = 'entry')::int as checked_in,
				(select count(*) from gate_checkins where event_id = ${eventId} and kind = 'reentry')::int as reentries,
				(select count(*) from certificates where event_id = ${eventId} and revoked_at is null)::int as certificates,
				(select count(*) from participant_connections
					where event_id = ${eventId} and a_status = 'accepted' and b_status = 'accepted')::int as connections,
				(select count(*) from registrations where status = 'paid')::int as paid`,
		sql()`
			select m.id, m.name, count(r.id)::int as served from meal_categories m
			left join meal_redemptions r on r.meal_id = m.id
			where m.event_id = ${eventId} group by m.id order by m.starts_at nulls last, m.created_at`,
		sql()`
			select s.id, s.hall, s.title, count(a.id)::int as attended from conference_sessions s
			left join session_attendance a on a.session_id = s.id
			where s.event_id = ${eventId} group by s.id order by s.starts_at, s.hall`
	]);

	const byCategory = {} as Record<Category, Tally>;
	const total = emptyTally();
	for (const r of scans) {
		if (!isCategory(r.category)) continue;
		byCategory[r.category] ??= emptyTally();
		byCategory[r.category][r.result as ScanLogResult] = r.n;
		total[r.result as ScanLogResult] += r.n;
	}
	return {
		handlers: { total: handlers[0].total, active: handlers[0].active, onlineNow: handlers[0].online },
		scans: { ...total, total: total.success + total.duplicate + total.rejected },
		byCategory,
		byHandler: perHandler.map((r) => ({
			id: r.id,
			name: r.full_name,
			username: r.username,
			tally: { success: r.success, duplicate: r.duplicate, rejected: r.rejected },
			lastScanAt: r.last_scan ? new Date(r.last_scan).toISOString() : null
		})),
		desks: {
			checkedIn: desks[0].checked_in,
			reentries: desks[0].reentries,
			certificates: desks[0].certificates,
			connections: desks[0].connections
		},
		meals: meals.map((r) => ({ id: r.id, name: r.name, served: r.served })),
		sessions: sessions.map((r) => ({ id: r.id, hall: r.hall, title: r.title, attended: r.attended })),
		registrationsPaid: desks[0].paid
	};
}

export interface TransactionFilter {
	handlerId: string;
	category: Category | '';
	result: ScanLogResult | '';
	/** Participant name or registration number. */
	q: string;
	/** YYYY-MM-DD, Indian time. */
	date: string;
	/** HH:MM–HH:MM window on that date (or every day). */
	from: string;
	to: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readFilter(params: URLSearchParams): TransactionFilter {
	const handlerId = params.get('handler') ?? '';
	const category = params.get('category') ?? '';
	const result = params.get('result') ?? '';
	const date = params.get('date') ?? '';
	const from = params.get('from') ?? '';
	const to = params.get('to') ?? '';
	return {
		handlerId: /^[0-9a-f-]{36}$/i.test(handlerId) ? handlerId : '',
		category: isCategory(category) ? category : '',
		result: (SCAN_RESULTS as string[]).includes(result) ? (result as ScanLogResult) : '',
		q: (params.get('q') ?? '').trim().slice(0, 60),
		date: DATE.test(date) ? date : '',
		from: TIME.test(from) ? from : '',
		to: TIME.test(to) ? to : ''
	};
}

export async function listTransactions(eventId: string, f: TransactionFilter, limit = 200): Promise<Transaction[]> {
	const like = `%${f.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	const rows = await sql()`
		select t.*, h.full_name as handler_name, h.username as handler_username,
			r.full_name as participant_name, r.code as participant_code
		from scan_transactions t
		left join event_handlers h on h.id = t.handler_id
		left join registrations r on r.id = t.registration_id
		where t.event_id = ${eventId}
			and (${f.handlerId}::text = '' or t.handler_id::text = ${f.handlerId})
			and (${f.category}::text = '' or t.category = ${f.category})
			and (${f.result}::text = '' or t.result = ${f.result})
			and (${f.q}::text = '' or r.full_name ilike ${like} or r.code ilike ${like})
			and (${f.date}::text = '' or (t.created_at at time zone 'Asia/Kolkata')::date = ${f.date || null}::date)
			and (${f.from}::text = '' or (t.created_at at time zone 'Asia/Kolkata')::time >= ${f.from || null}::time)
			and (${f.to}::text = '' or (t.created_at at time zone 'Asia/Kolkata')::time <= ${f.to || null}::time)
		order by t.created_at desc
		limit ${limit}`;
	return rows.map(transactionFrom);
}

export interface AuditRow {
	id: string;
	at: string;
	actorType: string;
	actor: string;
	action: string;
	targetType: string | null;
	targetId: string | null;
	details: Record<string, unknown> | null;
}

/** Admin changes and sign-ins, newest first. Handler ids are shown as their usernames. */
export async function listAudit(limit = 150, handlerId = ''): Promise<AuditRow[]> {
	const rows = await sql()`
		select a.*, coalesce(h.username, a.actor) as actor_name
		from audit_logs a
		left join event_handlers h on a.actor_type = 'handler' and h.id::text = a.actor
		where a.actor_type <> 'participant'
			and (${handlerId}::text = '' or a.target_id = ${handlerId} or a.actor = ${handlerId})
		order by a.created_at desc limit ${limit}`;
	return rows.map((r) => ({
		id: r.id,
		at: new Date(r.created_at).toISOString(),
		actorType: r.actor_type,
		actor: r.actor_name,
		action: r.action,
		targetType: r.target_type,
		targetId: r.target_id,
		details: r.details ?? null
	}));
}
