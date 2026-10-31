import { formatRupees } from '#lib/payment.ts';
import type { Category, ScanParticipant, ScanResult } from '#lib/ops/categories.ts';
import { sql } from '../db.ts';
import { evaluate, issue, certificateFor } from './certificates.ts';
import { getDefaultEvent, getEvent, listMeals, listSessions, type ConferenceSession, type Meal, type OpsEvent } from './event.ts';
import type { Assignment, HandlerSession } from './handlers.ts';
import { introduce, publicProfile } from './networking.ts';
import { parseScanned, resolveToken } from './passes.ts';

export interface ScanRequest {
	category: Category;
	/** What the camera read, or a registration number from the manual lookup. */
	scanned: string;
	/** Generated on the phone per scan; a retry with the same id gets the first answer back. */
	clientScanId?: string;
	sessionId?: string;
	mealId?: string;
	/** certificate: 'check' (default) or 'issue'. networking: 'profile' (default) or 'introduce'. */
	action?: 'check' | 'issue' | 'profile' | 'introduce';
	/** networking 'introduce': the first participant's QR. */
	withScanned?: string;
	/** hall attendance saved while offline: when it was scanned. */
	scannedAt?: string;
}

interface Person {
	id: string;
	code: string;
	fullName: string;
	designation: string;
	companyName: string;
	status: 'pending_payment' | 'payment_submitted' | 'paid' | 'rejected';
	amountRupees: number;
	upiTxnId: string | null;
}

/** Desk context passed to each operation. */
interface Desk {
	event: OpsEvent;
	assignment: Assignment;
	handler: HandlerSession;
	req: ScanRequest;
	person: Person;
}

const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
export const clock = (iso: string | Date) => time.format(new Date(iso));
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const iso = (v: unknown) => new Date(v as string).toISOString();

const participantOf = (p: Person): ScanParticipant => ({
	name: p.fullName,
	code: p.code,
	designation: p.designation,
	company: p.companyName
});

const fail = (code: string, title: string, message: string, person?: Person): ScanResult => ({
	outcome: 'error',
	code,
	title,
	message,
	participant: person && participantOf(person)
});

/** Why a registration cannot use a desk that needs a confirmed ticket. */
function notConfirmed(p: Person): ScanResult {
	switch (p.status) {
		case 'pending_payment':
			return fail('PAYMENT_PENDING', 'PAYMENT PENDING', 'Registered but not paid. Send them to the help desk.', p);
		case 'payment_submitted':
			return fail('AWAITING_APPROVAL', 'AWAITING APPROVAL', 'Payment not verified yet. Send them to the help desk.', p);
		default:
			return fail('REGISTRATION_REJECTED', 'REGISTRATION REJECTED', 'This registration was not accepted.', p);
	}
}

async function loadPerson(id: string): Promise<Person | null> {
	const rows = await sql()`
		select id, code, full_name, designation, company_name, status, amount_rupees, upi_txn_id
		from registrations where id = ${id}`;
	const r = rows[0];
	return r
		? {
				id: r.id,
				code: r.code,
				fullName: r.full_name,
				designation: r.designation,
				companyName: r.company_name,
				status: r.status,
				amountRupees: Number(r.amount_rupees),
				upiTxnId: r.upi_txn_id
			}
		: null;
}

/** Turns scanned text into a participant of the desk's event, or the reason it cannot. */
async function identify(scanned: string, event: OpsEvent): Promise<Person | ScanResult> {
	const parsed = parseScanned(scanned);
	if (!parsed) return fail('INVALID_QR', 'INVALID QR', 'This is not a Midtown Business Conclave pass.');

	if ('code' in parsed) {
		// Manual lookup: registrations belong to the conclave.
		const def = await getDefaultEvent();
		if (def.id !== event.id) return fail('WRONG_EVENT', 'WRONG EVENT', 'This registration is for another event.');
		const rows = await sql()`select id from registrations where code = ${parsed.code}`;
		const person = rows[0] && (await loadPerson(rows[0].id));
		return person || fail('NOT_FOUND', 'NOT FOUND', `No registration ${parsed.code}.`);
	}

	const resolved = await resolveToken(parsed.token);
	if (resolved.status === 'unknown') return fail('INVALID_PASS', 'INVALID PASS', 'This pass was not issued by the organisers.');
	if (resolved.eventId !== event.id) return fail('WRONG_EVENT', 'WRONG EVENT', 'This pass is for another event.');
	const person = await loadPerson(resolved.registrationId);
	if (!person) return fail('INVALID_PASS', 'INVALID PASS', 'This registration no longer exists.');
	if (resolved.status === 'revoked') {
		return fail('PASS_REVOKED', 'PASS REVOKED', 'A newer pass was issued. Ask for the latest QR from their email.', person);
	}
	return person;
}

/* ---------- 1. ticket validation: reads only ---------- */

async function ticket({ event, person }: Desk): Promise<ScanResult> {
	const [entry] = await sql()`
		select checked_in_at from gate_checkins where event_id = ${event.id} and registration_id = ${person.id} and kind = 'entry'`;
	const payment =
		person.status === 'paid'
			? `Paid ${formatRupees(person.amountRupees)}`
			: person.status === 'payment_submitted'
				? `Submitted (UPI ${person.upiTxnId ?? '—'})`
				: person.status === 'pending_payment'
					? 'Not paid'
					: 'Rejected';
	const facts = [
		{ label: 'Participant ID', value: person.code },
		{ label: 'Ticket', value: 'Delegate' },
		{ label: 'Registration', value: person.status === 'rejected' ? 'Rejected' : 'Registered' },
		{ label: 'Payment', value: payment },
		{ label: 'Approval', value: person.status === 'paid' ? 'Approved' : person.status === 'rejected' ? 'Rejected' : 'Pending' }
	];
	if (entry) facts.push({ label: 'Checked in', value: clock(entry.checked_in_at) });
	if (person.status !== 'paid') return { ...notConfirmed(person), facts };
	return {
		outcome: 'success',
		code: 'VALID_TICKET',
		title: 'VALID TICKET',
		message: 'Confirmed delegate. They can go through.',
		participant: participantOf(person),
		facts
	};
}

/* ---------- 2. gate check-in: one entry per participant ---------- */

async function gate({ event, assignment, handler, person }: Desk): Promise<ScanResult> {
	if (person.status !== 'paid') return notConfirmed(person);
	const gateId = assignment.gateId;
	const gateName = assignment.gateName ?? 'Gate';

	// The insert carries its own eligibility check and the partial unique index decides
	// between two gates scanning the same pass at once.
	const inserted = await sql()`
		insert into gate_checkins (event_id, registration_id, gate_id, handler_id, kind)
		select ${event.id}, r.id, ${gateId}, ${handler.id}, 'entry' from registrations r
		where r.id = ${person.id} and r.status = 'paid'
		on conflict (event_id, registration_id) where kind = 'entry' do nothing
		returning checked_in_at`;
	if (inserted[0]) {
		const at = iso(inserted[0].checked_in_at);
		return {
			outcome: 'success',
			code: 'ENTRY_OK',
			title: 'ENTRY SUCCESSFUL',
			message: `Welcome, ${person.fullName}`,
			participant: participantOf(person),
			facts: [
				{ label: 'Entry time', value: clock(at) },
				{ label: 'Gate', value: gateName }
			],
			at
		};
	}

	const [first] = await sql()`
		select c.checked_in_at, g.name as gate_name from gate_checkins c left join event_gates g on g.id = c.gate_id
		where c.event_id = ${event.id} and c.registration_id = ${person.id} and c.kind = 'entry'`;
	if (!first) return notConfirmed(person);
	const firstAt = iso(first.checked_in_at);

	if (event.allowReentry) {
		const [re] = await sql()`
			insert into gate_checkins (event_id, registration_id, gate_id, handler_id, kind)
			values (${event.id}, ${person.id}, ${gateId}, ${handler.id}, 'reentry')
			returning checked_in_at`;
		const at = iso(re.checked_in_at);
		return {
			outcome: 'success',
			code: 'REENTRY_OK',
			title: 'RE-ENTRY RECORDED',
			message: `Welcome back, ${person.fullName}`,
			participant: participantOf(person),
			facts: [
				{ label: 'Re-entry time', value: clock(at) },
				{ label: 'First entry', value: `${clock(firstAt)}${first.gate_name ? ` · ${first.gate_name}` : ''}` }
			],
			at
		};
	}
	return {
		outcome: 'warning',
		code: 'ALREADY_CHECKED_IN',
		title: 'ALREADY CHECKED IN',
		message: `This participant entered at ${clock(firstAt)}${first.gate_name ? ` through ${first.gate_name}` : ''}.`,
		participant: participantOf(person),
		facts: [{ label: 'Entered', value: clock(firstAt) }],
		at: firstAt
	};
}

/* ---------- 3. hall / session attendance ---------- */

/** Sessions this desk may record: the assigned session, every session in the assigned hall, or all. */
export function sessionsFor(assignment: Assignment, sessions: ConferenceSession[]) {
	if (assignment.sessionId) return sessions.filter((s) => s.id === assignment.sessionId);
	if (assignment.hall) return sessions.filter((s) => s.hall.toLowerCase() === assignment.hall!.toLowerCase());
	return sessions;
}

/** The session on now (from 30 minutes before it starts), if exactly one is. */
export function currentSession(sessions: ConferenceSession[], now = Date.now()) {
	const on = sessions.filter((s) => Date.parse(s.startsAt) - 30 * 60_000 <= now && now <= Date.parse(s.endsAt));
	return on.length === 1 ? on[0] : null;
}

async function hall({ event, assignment, handler, req, person }: Desk): Promise<ScanResult> {
	if (person.status !== 'paid') return notConfirmed(person);
	const allowed = sessionsFor(assignment, await listSessions(event.id));
	const session = req.sessionId ? allowed.find((s) => s.id === req.sessionId) : (currentSession(allowed) ?? (allowed.length === 1 ? allowed[0] : null));
	if (!session) {
		return req.sessionId
			? fail('SESSION_NOT_ASSIGNED', 'NOT YOUR SESSION', 'You are not assigned to that session.', person)
			: fail('CHOOSE_SESSION', 'CHOOSE A SESSION', 'Pick the session on your screen, then scan again.', person);
	}

	const offline = Boolean(req.scannedAt);
	let at = new Date();
	if (offline) {
		const t = Date.parse(req.scannedAt!);
		if (Number.isFinite(t) && t <= Date.now() && Date.now() - t < 24 * 3600_000) at = new Date(t);
	}
	const inserted = await sql()`
		insert into session_attendance (event_id, session_id, registration_id, handler_id, source, recorded_at)
		select ${event.id}, ${session.id}, r.id, ${handler.id}, ${offline ? 'offline_sync' : 'scan'}, ${at.toISOString()}
		from registrations r where r.id = ${person.id} and r.status = 'paid'
		on conflict (session_id, registration_id) do nothing
		returning recorded_at`;

	const facts = [
		{ label: 'Hall', value: session.hall },
		{ label: 'Session', value: session.title }
	];
	if (!inserted[0]) {
		const [prev] = await sql()`
			select recorded_at from session_attendance where session_id = ${session.id} and registration_id = ${person.id}`;
		const prevAt = prev ? iso(prev.recorded_at) : undefined;
		return {
			outcome: 'warning',
			code: 'ALREADY_RECORDED',
			title: 'ALREADY RECORDED',
			message: prevAt ? `Attendance for this session was recorded at ${clock(prevAt)}.` : 'Already recorded for this session.',
			participant: participantOf(person),
			facts,
			at: prevAt
		};
	}
	const recorded = iso(inserted[0].recorded_at);
	return {
		outcome: 'success',
		code: 'ATTENDANCE_RECORDED',
		title: 'ATTENDANCE RECORDED',
		message: person.fullName,
		participant: participantOf(person),
		facts: [...facts, { label: 'Time', value: clock(recorded) }],
		at: recorded,
		extra: { sessionId: session.id }
	};
}

/* ---------- 4. food / lunch redemption ---------- */

export function mealsFor(assignment: Assignment, meals: Meal[]) {
	const active = meals.filter((m) => m.active);
	return assignment.mealId ? active.filter((m) => m.id === assignment.mealId) : active;
}

/** The meal being served now, if exactly one is; otherwise the only one this desk serves. */
export function currentMeal(meals: Meal[], now = Date.now()) {
	const on = meals.filter((m) => m.startsAt && m.endsAt && Date.parse(m.startsAt) <= now && now <= Date.parse(m.endsAt));
	if (on.length === 1) return on[0];
	return meals.length === 1 ? meals[0] : null;
}

async function food({ event, assignment, handler, req, person }: Desk): Promise<ScanResult> {
	const allowed = mealsFor(assignment, await listMeals(event.id));
	const meal = req.mealId ? allowed.find((m) => m.id === req.mealId) : currentMeal(allowed);
	if (!meal) {
		return req.mealId
			? fail('MEAL_NOT_ASSIGNED', 'NOT YOUR COUNTER', 'You are not assigned to that meal, or it is closed.', person)
			: fail('CHOOSE_MEAL', 'CHOOSE A MEAL', 'Pick the meal on your screen, then scan again.', person);
	}
	if (person.status !== 'paid') return notConfirmed(person);
	const now = Date.now();
	if ((meal.startsAt && now < Date.parse(meal.startsAt)) || (meal.endsAt && now > Date.parse(meal.endsAt))) {
		const window = meal.startsAt && meal.endsAt ? ` It is served ${clock(meal.startsAt)} – ${clock(meal.endsAt)}.` : '';
		return fail('MEAL_CLOSED', `${meal.name.toUpperCase()} NOT OPEN`, `Not serving ${meal.name.toLowerCase()} now.${window}`, person);
	}

	const facts = [{ label: 'Meal', value: meal.name }];
	if (assignment.counterName) facts.push({ label: 'Counter', value: assignment.counterName });

	// Eligibility, the per-person limit and the next serving number in one statement. When two
	// counters scan the same pass together, both compute the same seq and the unique index lets one in.
	for (let attempt = 0; attempt < 2; attempt++) {
		const inserted = await sql()`
			insert into meal_redemptions (event_id, meal_id, registration_id, handler_id, counter_name, seq)
			select ${event.id}, ${meal.id}, r.id, ${handler.id}, ${assignment.counterName},
				coalesce((select max(seq) from meal_redemptions m where m.meal_id = ${meal.id} and m.registration_id = r.id), 0) + 1
			from registrations r
			where r.id = ${person.id} and r.status = 'paid'
				and (select count(*) from meal_redemptions m where m.meal_id = ${meal.id} and m.registration_id = r.id) < ${meal.maxPerParticipant}
				and (${meal.eligibility} <> 'checked_in'
					or exists (select 1 from gate_checkins g where g.event_id = ${event.id} and g.registration_id = r.id))
			on conflict (meal_id, registration_id, seq) do nothing
			returning redeemed_at, seq`;
		if (inserted[0]) {
			const at = iso(inserted[0].redeemed_at);
			const servings = meal.maxPerParticipant > 1 ? ` (${inserted[0].seq} of ${meal.maxPerParticipant})` : '';
			return {
				outcome: 'success',
				code: 'MEAL_REDEEMED',
				title: `${meal.name.toUpperCase()} REDEEMED`,
				message: `${person.fullName}${servings}`,
				participant: participantOf(person),
				facts: [...facts, { label: 'Time', value: clock(at) }],
				at
			};
		}

		const taken = await sql()`
			select redeemed_at, counter_name from meal_redemptions
			where meal_id = ${meal.id} and registration_id = ${person.id} order by seq desc`;
		if (taken.length >= meal.maxPerParticipant) {
			const lastAt = iso(taken[0].redeemed_at);
			return {
				outcome: 'warning',
				code: 'ALREADY_COLLECTED',
				title: 'ALREADY COLLECTED',
				message: `${meal.name} collected at ${clock(lastAt)}${taken[0].counter_name ? ` (${taken[0].counter_name})` : ''}.`,
				participant: participantOf(person),
				facts: [...facts, { label: 'Collected', value: clock(lastAt) }],
				at: lastAt
			};
		}
		if (meal.eligibility === 'checked_in') {
			const [entry] = await sql()`select 1 from gate_checkins where event_id = ${event.id} and registration_id = ${person.id} limit 1`;
			if (!entry) return fail('NOT_CHECKED_IN', 'NOT CHECKED IN', `${meal.name} is for delegates who came in through a gate.`, person);
		}
		// Lost a race for the next serving number with another counter: try once more.
	}
	return fail('TRY_AGAIN', 'TRY AGAIN', 'Another counter scanned this pass at the same moment. Scan again.', person);
}

/* ---------- 5. certificates ---------- */

async function certificate({ event, assignment, handler, req, person }: Desk): Promise<ScanResult> {
	const existing = await certificateFor(event.id, person.id);
	if (existing && req.action !== 'issue') {
		return {
			outcome: existing.revokedAt ? 'error' : 'success',
			code: existing.revokedAt ? 'CERTIFICATE_REVOKED' : 'CERTIFICATE_ISSUED',
			title: existing.revokedAt ? 'CERTIFICATE REVOKED' : 'CERTIFICATE ISSUED',
			message: `Certificate ${existing.number}`,
			participant: participantOf(person),
			facts: [
				{ label: 'Certificate', value: existing.number },
				{ label: 'Issued', value: clock(existing.issuedAt) }
			],
			at: existing.issuedAt,
			extra: { certificateNumber: existing.number, canIssue: false }
		};
	}

	const eligibility = await evaluate(event.id, person.id, event.certificateRules);
	const extra = { checks: eligibility.checks, attendancePct: eligibility.attendancePct, canIssue: assignment.canIssueCertificates };
	if (!eligibility.eligible) {
		return {
			...fail('NOT_ELIGIBLE', 'NOT ELIGIBLE', 'This participant does not meet the certificate rules yet.', person),
			extra: { ...extra, canIssue: false }
		};
	}
	if (req.action !== 'issue') {
		return {
			outcome: 'success',
			code: 'ELIGIBLE',
			title: 'ELIGIBLE',
			message: assignment.canIssueCertificates ? 'Meets every rule. You can issue the certificate.' : 'Meets every rule.',
			participant: participantOf(person),
			extra
		};
	}
	if (!assignment.canIssueCertificates) {
		return fail('NOT_PERMITTED', 'NOT PERMITTED', 'Your account can check certificates but not issue them.', person);
	}

	const { certificate: cert, created } = await issue(event.id, person.id, { handlerId: handler.id });
	return {
		outcome: created ? 'success' : 'warning',
		code: created ? 'CERTIFICATE_CREATED' : 'ALREADY_ISSUED',
		title: created ? 'CERTIFICATE ISSUED' : 'ALREADY ISSUED',
		message: created ? `Certificate ${cert.number} is ready.` : `Issued earlier at ${clock(cert.issuedAt)}.`,
		participant: participantOf(person),
		facts: [
			{ label: 'Certificate', value: cert.number },
			{ label: 'Issued', value: clock(cert.issuedAt) }
		],
		at: cert.issuedAt,
		extra: { certificateNumber: cert.number, canIssue: false }
	};
}

/* ---------- 6. networking desk ---------- */

async function networking({ event, handler, req, person }: Desk): Promise<ScanResult> {
	if (person.status !== 'paid') return notConfirmed(person);
	const profile = await publicProfile(person.id);

	if (req.action === 'introduce') {
		const first = await identify(req.withScanned ?? '', event);
		if ('outcome' in first) return first;
		if (first.id === person.id) return fail('SAME_PERSON', 'SAME PERSON', 'Scan a different delegate to introduce.', person);
		if (first.status !== 'paid') return notConfirmed(first);
		const made = await introduce(event.id, first.id, person.id, handler.id);
		return {
			outcome: made === 'created' ? 'success' : 'warning',
			code: made === 'created' ? 'INTRODUCED' : 'ALREADY_INTRODUCED',
			title: made === 'created' ? 'INTRODUCTION SENT' : 'ALREADY CONNECTED',
			message:
				made === 'created'
					? `${first.fullName} and ${person.fullName} will each see it on their pass and choose to accept.`
					: `${first.fullName} and ${person.fullName} already have a connection or request.`,
			participant: participantOf(person)
		};
	}

	return {
		outcome: 'success',
		code: 'PROFILE',
		title: 'DELEGATE PROFILE',
		message: [person.designation, person.companyName].filter(Boolean).join(', '),
		participant: participantOf(person),
		facts: [
			{ label: 'Industry', value: profile?.industry ?? '' },
			{ label: 'City', value: profile?.city ?? '' },
			...(profile?.website ? [{ label: 'Website', value: profile.website }] : [])
		].filter((f) => f.value),
		extra: { about: profile?.about ?? null, scanned: req.scanned }
	};
}

const OPERATIONS: Record<Category, (desk: Desk) => Promise<ScanResult>> = {
	ticket,
	gate,
	hall,
	food,
	certificate,
	networking
};

const LOG_RESULT = { success: 'success', warning: 'duplicate', error: 'rejected' } as const;

/**
 * One scan at one desk: authorise, identify, act, record. The caller has
 * already checked that the handler holds `assignment`.
 */
export async function performScan(handler: HandlerSession, assignment: Assignment, req: ScanRequest): Promise<ScanResult & { replayed?: boolean }> {
	const clientScanId = isUuid(req.clientScanId) ? req.clientScanId : null;
	if (clientScanId) {
		const [prev] = await sql()`
			select response from scan_transactions where handler_id = ${handler.id} and client_scan_id = ${clientScanId}`;
		if (prev?.response) return { ...(prev.response as ScanResult), replayed: true };
	}

	const event = await getEvent(assignment.eventId);
	if (!event) return fail('NO_EVENT', 'EVENT NOT FOUND', 'Your assignment points to an event that no longer exists.');

	const found = await identify(req.scanned, event);
	const result = 'outcome' in found ? found : await OPERATIONS[req.category]({ event, assignment, handler, req, person: found });
	const registrationId = 'outcome' in found ? null : found.id;

	const context = {
		gate: assignment.gateName,
		sessionId: req.sessionId ?? (result.extra?.sessionId as string | undefined) ?? null,
		mealId: req.mealId ?? null,
		counter: assignment.counterName,
		action: req.action ?? null,
		offline: Boolean(req.scannedAt)
	};
	try {
		await sql()`
			insert into scan_transactions
				(event_id, handler_id, category, registration_id, result, code, message, context, response, client_scan_id)
			values (${event.id}, ${handler.id}, ${req.category}, ${registrationId}, ${LOG_RESULT[result.outcome]},
				${result.code}, ${result.title}, ${JSON.stringify(context)}::jsonb, ${JSON.stringify(result)}::jsonb, ${clientScanId})
			on conflict do nothing`;
	} catch (e) {
		// The desk action itself is already committed; losing a log line must not turn it into an error.
		console.error('[scan] could not log transaction', e);
	}
	return result;
}

/* ---------- manual lookup ---------- */

export interface LookupHit {
	code: string;
	name: string;
	company: string;
}

/**
 * Finds a delegate for a desk without a working QR: by exact registration
 * number, or by name with at least three letters. A handful of results with no
 * contact details, so the lookup cannot be used to browse the delegate list.
 */
export async function lookup(q: string): Promise<LookupHit[]> {
	const query = q.trim().slice(0, 60);
	if (/^MBC-[A-Z0-9]{6}$/i.test(query)) {
		const rows = await sql()`select code, full_name, company_name from registrations where code = ${query.toUpperCase()}`;
		return rows.map((r) => ({ code: r.code, name: r.full_name, company: r.company_name }));
	}
	if (query.replace(/\s/g, '').length < 3) return [];
	const like = `${query.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	const rows = await sql()`
		select code, full_name, company_name from registrations
		where full_name ilike ${like} or full_name ilike ${'% ' + like}
		order by full_name limit 6`;
	return rows.map((r) => ({ code: r.code, name: r.full_name, company: r.company_name }));
}
