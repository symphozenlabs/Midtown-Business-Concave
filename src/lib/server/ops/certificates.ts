import { sql, uniqueViolation } from '../db.ts';
import { audit, type CertificateRules } from './event.ts';

export interface Check {
	label: string;
	ok: boolean;
	detail?: string;
}

export interface Eligibility {
	eligible: boolean;
	checks: Check[];
	/** Attended share of the sessions that count for attendance, 0–100; null when there are none. */
	attendancePct: number | null;
}

export interface Certificate {
	number: string;
	issuedAt: string;
	revokedAt: string | null;
	registrationId: string;
	fullName: string;
	designation: string;
	companyName: string;
	eventName: string;
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

/** Measures a participant against the organiser's certificate rules. */
export async function evaluate(eventId: string, registrationId: string, rules: CertificateRules): Promise<Eligibility> {
	const [row] = await sql()`
		select r.status,
			exists (select 1 from gate_checkins g where g.event_id = ${eventId} and g.registration_id = r.id) as checked_in,
			(select count(*) from conference_sessions s where s.event_id = ${eventId} and s.counts_for_attendance)::int as counted,
			(select count(*) from session_attendance a join conference_sessions s on s.id = a.session_id
				where a.registration_id = r.id and s.event_id = ${eventId} and s.counts_for_attendance)::int as attended,
			coalesce((select array_agg(a.session_id::text) from session_attendance a
				where a.registration_id = r.id and a.event_id = ${eventId}), '{}') as attended_ids
		from registrations r where r.id = ${registrationId}`;
	if (!row) return { eligible: false, checks: [{ label: 'Registration found', ok: false }], attendancePct: null };

	const checks: Check[] = [];
	if (rules.requirePaid) checks.push({ label: 'Registration approved and paid', ok: row.status === 'paid' });
	if (rules.requireCheckin) checks.push({ label: 'Checked in at the gate', ok: row.checked_in });

	const pct = row.counted > 0 ? Math.round((row.attended / row.counted) * 100) : null;
	if (rules.minAttendancePct > 0) {
		checks.push({
			label: `Attended at least ${rules.minAttendancePct}% of sessions`,
			ok: pct !== null && pct >= rules.minAttendancePct,
			detail: pct === null ? 'No sessions are set up' : `${row.attended} of ${row.counted} (${pct}%)`
		});
	}
	if (rules.requiredSessionIds.length) {
		const attended = new Set<string>(row.attended_ids);
		const missing = rules.requiredSessionIds.filter((id) => !attended.has(id)).length;
		checks.push({
			label: 'Attended the required sessions',
			ok: missing === 0,
			detail: missing ? `${missing} of ${rules.requiredSessionIds.length} still to attend` : undefined
		});
	}
	return { eligible: checks.every((c) => c.ok), checks, attendancePct: pct };
}

function certificateFrom(r: Record<string, any>): Certificate {
	return {
		number: r.certificate_no,
		issuedAt: iso(r.issued_at)!,
		revokedAt: iso(r.revoked_at),
		registrationId: r.registration_id,
		fullName: r.full_name,
		designation: r.designation,
		companyName: r.company_name,
		eventName: r.event_name
	};
}

export async function certificateFor(eventId: string, registrationId: string): Promise<Certificate | null> {
	const rows = await sql()`
		select c.*, r.full_name, r.designation, r.company_name, e.name as event_name
		from certificates c join registrations r on r.id = c.registration_id join events e on e.id = c.event_id
		where c.event_id = ${eventId} and c.registration_id = ${registrationId}`;
	return rows[0] ? certificateFrom(rows[0]) : null;
}

const NUMBER = /^MBC26-[A-Z0-9]{8}$/;

export function normaliseCertificateNumber(raw: string) {
	const n = raw.trim().toUpperCase();
	return NUMBER.test(n) ? n : null;
}

export async function findCertificate(number: string): Promise<Certificate | null> {
	const n = normaliseCertificateNumber(number);
	if (!n) return null;
	const rows = await sql()`
		select c.*, r.full_name, r.designation, r.company_name, e.name as event_name
		from certificates c join registrations r on r.id = c.registration_id join events e on e.id = c.event_id
		where c.certificate_no = ${n}`;
	return rows[0] ? certificateFrom(rows[0]) : null;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newNumber() {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return 'MBC26-' + [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Issues the certificate once. The unique (event, participant) index means a second
 * desk issuing at the same moment gets the first certificate back, marked as existing.
 */
export async function issue(
	eventId: string,
	registrationId: string,
	by: { handlerId?: string; admin?: string }
): Promise<{ certificate: Certificate; created: boolean }> {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const rows = await sql()`
				insert into certificates (event_id, registration_id, certificate_no, issued_by_handler, issued_by_admin)
				values (${eventId}, ${registrationId}, ${newNumber()}, ${by.handlerId ?? null}, ${by.admin ?? null})
				on conflict (event_id, registration_id) do nothing
				returning id`;
			const certificate = (await certificateFor(eventId, registrationId))!;
			if (rows[0]) {
				await audit({
					eventId,
					actorType: by.admin ? 'admin' : 'handler',
					actor: by.admin ?? by.handlerId!,
					action: 'certificate.issue',
					targetType: 'registration',
					targetId: registrationId,
					details: { number: certificate.number }
				});
			}
			return { certificate, created: Boolean(rows[0]) };
		} catch (e) {
			if (uniqueViolation(e) === 'certificates_certificate_no_key') continue;
			throw e;
		}
	}
	throw new Error('Could not allocate a certificate number');
}
