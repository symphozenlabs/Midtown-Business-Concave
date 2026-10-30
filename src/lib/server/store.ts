import { dev } from '$app/env';
import { DEFAULT_PAYMENT, type PaymentSettings } from '#lib/payment.ts';
import { isDatabaseConfigured, sql, uniqueViolation } from './db.ts';

export type Status = 'pending_payment' | 'payment_submitted' | 'paid' | 'rejected';
export const STATUSES: Status[] = ['payment_submitted', 'pending_payment', 'paid', 'rejected'];

export interface PosterFraming {
	zoom: number;
	dx: number;
	dy: number;
}

export interface RegistrationInput {
	fullName: string;
	email: string;
	phone: string;
	photoKey: string;
	posterKey: string;
	companyName: string;
	designation: string;
	organisation: string | null;
	industry: string;
	companySize: string;
	website: string | null;
	city: string;
	interests: string[];
	lookingFor: string | null;
	heardFrom: string | null;
	whatsappUpdates: boolean;
	posterFraming: PosterFraming;
	amountRupees: number;
}

export interface Registration extends RegistrationInput {
	id: string;
	code: string;
	status: Status;
	upiTxnId: string | null;
	paymentSubmittedAt: string | null;
	reviewedAt: string | null;
	reviewedBy: string | null;
	rejectionReason: string | null;
	ticketEmailedAt: string | null;
	createdAt: string;
}

export type PaymentResult =
	| { ok: true; registration: Registration }
	| { ok: false; reason: 'not_found' | 'paid' | 'utr_used' };

export interface Stats {
	counts: Record<Status, number>;
	collectedRupees: number;
}

export class DuplicateEmailError extends Error {}

/** In development without Neon, data lives in memory until the dev server restarts. */
const useMemory = !isDatabaseConfigured && dev;
export const isStoreAvailable = isDatabaseConfigured || useMemory;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

function newCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return 'MBC-' + [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

function fromRow(r: Record<string, any>): Registration {
	return {
		id: r.id,
		code: r.code,
		fullName: r.full_name,
		email: r.email,
		phone: r.phone,
		photoKey: r.photo_key,
		posterKey: r.poster_key,
		companyName: r.company_name,
		designation: r.designation,
		organisation: r.organisation,
		industry: r.industry,
		companySize: r.company_size,
		website: r.website,
		city: r.city,
		interests: r.interests ?? [],
		lookingFor: r.looking_for,
		heardFrom: r.heard_from,
		whatsappUpdates: r.whatsapp_updates,
		posterFraming: r.poster_framing ?? { zoom: 1, dx: 0, dy: 0 },
		amountRupees: Number(r.amount_rupees),
		status: r.status,
		upiTxnId: r.upi_txn_id,
		paymentSubmittedAt: iso(r.payment_submitted_at),
		reviewedAt: iso(r.reviewed_at),
		reviewedBy: r.reviewed_by,
		rejectionReason: r.rejection_reason,
		ticketEmailedAt: iso(r.ticket_emailed_at),
		createdAt: iso(r.created_at)!
	};
}

/* ---------- in-memory store (development only) ---------- */

const mem = {
	rows: new Map<string, Registration>(),
	settings: { ...DEFAULT_PAYMENT } as PaymentSettings
};

const now = () => new Date().toISOString();
const byEmail = (email: string) => [...mem.rows.values()].find((r) => r.email.toLowerCase() === email.toLowerCase());

/* ---------- settings ---------- */

export async function getPaymentSettings(): Promise<PaymentSettings> {
	if (useMemory) return { ...mem.settings };
	const rows = await sql()`select value from settings where key = 'payment'`;
	return { ...DEFAULT_PAYMENT, ...(rows[0]?.value ?? {}) };
}

export async function savePaymentSettings(settings: PaymentSettings, by: string) {
	if (useMemory) {
		mem.settings = { ...settings };
		return;
	}
	await sql()`
		insert into settings (key, value, updated_at, updated_by)
		values ('payment', ${JSON.stringify(settings)}::jsonb, now(), ${by})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}

/* ---------- registrations ---------- */

export async function findByEmail(email: string): Promise<Registration | null> {
	if (useMemory) return byEmail(email) ?? null;
	const rows = await sql()`select * from registrations where lower(email) = lower(${email}) limit 1`;
	return rows[0] ? fromRow(rows[0]) : null;
}

export async function getRegistration(id: string): Promise<Registration | null> {
	if (useMemory) return mem.rows.get(id) ?? null;
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const rows = await sql()`select * from registrations where id = ${id}`;
	return rows[0] ? fromRow(rows[0]) : null;
}

export async function createRegistration(input: RegistrationInput): Promise<Registration> {
	if (useMemory) {
		if (byEmail(input.email)) throw new DuplicateEmailError();
		const row: Registration = {
			...input,
			id: crypto.randomUUID(),
			code: newCode(),
			status: 'pending_payment',
			upiTxnId: null,
			paymentSubmittedAt: null,
			reviewedAt: null,
			reviewedBy: null,
			rejectionReason: null,
			ticketEmailedAt: null,
			createdAt: now()
		};
		mem.rows.set(row.id, row);
		return row;
	}

	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const rows = await sql()`
				insert into registrations (
					code, full_name, email, phone, photo_key, poster_key,
					company_name, designation, organisation, industry, company_size, website,
					city, interests, looking_for, heard_from, consent, whatsapp_updates, poster_framing,
					status, amount_rupees
				) values (
					${newCode()}, ${input.fullName}, ${input.email}, ${input.phone}, ${input.photoKey}, ${input.posterKey},
					${input.companyName}, ${input.designation}, ${input.organisation}, ${input.industry}, ${input.companySize},
					${input.website}, ${input.city}, ${input.interests}, ${input.lookingFor}, ${input.heardFrom},
					true, ${input.whatsappUpdates}, ${JSON.stringify(input.posterFraming)}::jsonb,
					'pending_payment', ${input.amountRupees}
				)
				returning *`;
			return fromRow(rows[0]);
		} catch (e) {
			const constraint = uniqueViolation(e);
			if (constraint === 'registrations_code_key') continue;
			if (constraint === 'registrations_email_key') throw new DuplicateEmailError();
			throw e;
		}
	}
	throw new Error('Could not allocate a registration code');
}

/** A delegate who has not paid yet registers again: replace their details, keep their code. */
export async function replaceRegistration(id: string, input: RegistrationInput): Promise<Registration> {
	if (useMemory) {
		const prev = mem.rows.get(id)!;
		const row: Registration = {
			...prev,
			...input,
			status: 'pending_payment',
			upiTxnId: null,
			paymentSubmittedAt: null,
			reviewedAt: null,
			reviewedBy: null,
			rejectionReason: null
		};
		mem.rows.set(id, row);
		return row;
	}
	const rows = await sql()`
		update registrations set
			full_name = ${input.fullName}, email = ${input.email}, phone = ${input.phone},
			photo_key = ${input.photoKey}, poster_key = ${input.posterKey},
			company_name = ${input.companyName}, designation = ${input.designation}, organisation = ${input.organisation},
			industry = ${input.industry}, company_size = ${input.companySize}, website = ${input.website},
			city = ${input.city}, interests = ${input.interests}, looking_for = ${input.lookingFor},
			heard_from = ${input.heardFrom}, whatsapp_updates = ${input.whatsappUpdates},
			poster_framing = ${JSON.stringify(input.posterFraming)}::jsonb, amount_rupees = ${input.amountRupees},
			status = 'pending_payment', upi_txn_id = null, payment_submitted_at = null,
			reviewed_at = null, reviewed_by = null, rejection_reason = null, updated_at = now()
		where id = ${id}
		returning *`;
	return fromRow(rows[0]);
}

/** The delegate reports their UPI transaction ID. They can correct it until the admin has reviewed it. */
export async function submitPayment(code: string, email: string, utr: string): Promise<PaymentResult> {
	if (useMemory) {
		const row = [...mem.rows.values()].find((r) => r.code === code && r.email.toLowerCase() === email.toLowerCase());
		if (!row) return { ok: false, reason: 'not_found' };
		if (row.status === 'paid') return { ok: false, reason: 'paid' };
		if ([...mem.rows.values()].some((r) => r.upiTxnId === utr && r.id !== row.id)) return { ok: false, reason: 'utr_used' };
		Object.assign(row, { status: 'payment_submitted', upiTxnId: utr, paymentSubmittedAt: now(), rejectionReason: null });
		return { ok: true, registration: row };
	}

	const existing = await sql()`select id, status from registrations where code = ${code} and lower(email) = lower(${email})`;
	if (!existing[0]) return { ok: false, reason: 'not_found' };
	if (existing[0].status === 'paid') return { ok: false, reason: 'paid' };
	try {
		const rows = await sql()`
			update registrations set
				status = 'payment_submitted', upi_txn_id = ${utr}, payment_submitted_at = now(),
				rejection_reason = null, updated_at = now()
			where id = ${existing[0].id} and status <> 'paid'
			returning *`;
		if (!rows[0]) return { ok: false, reason: 'paid' };
		return { ok: true, registration: fromRow(rows[0]) };
	} catch (e) {
		if (uniqueViolation(e) === 'registrations_upi_txn_id_key') return { ok: false, reason: 'utr_used' };
		throw e;
	}
}

export async function listRegistrations(filter: { status: Status | 'all'; q: string }): Promise<Registration[]> {
	const q = filter.q.trim();
	if (useMemory) {
		const needle = q.toLowerCase();
		return [...mem.rows.values()]
			.filter((r) => filter.status === 'all' || r.status === filter.status)
			.filter(
				(r) =>
					!needle ||
					[r.fullName, r.email, r.code, r.companyName, r.phone, r.upiTxnId ?? ''].some((v) =>
						v.toLowerCase().includes(needle)
					)
			)
			.sort(
				(a, b) =>
					STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
					(b.paymentSubmittedAt ?? b.createdAt).localeCompare(a.paymentSubmittedAt ?? a.createdAt)
			);
	}
	const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	const rows = await sql()`
		select * from registrations
		where (${filter.status}::text = 'all' or status = ${filter.status})
			and (${q}::text = '' or full_name ilike ${like} or email ilike ${like} or code ilike ${like}
				or company_name ilike ${like} or phone ilike ${like} or coalesce(upi_txn_id, '') ilike ${like})
		order by
			case status when 'payment_submitted' then 0 when 'pending_payment' then 1 when 'paid' then 2 else 3 end,
			coalesce(payment_submitted_at, created_at) desc
		limit 500`;
	return rows.map(fromRow);
}

export async function getStats(): Promise<Stats> {
	const counts: Record<Status, number> = { pending_payment: 0, payment_submitted: 0, paid: 0, rejected: 0 };
	let collectedRupees = 0;
	if (useMemory) {
		for (const r of mem.rows.values()) {
			counts[r.status]++;
			if (r.status === 'paid') collectedRupees += r.amountRupees;
		}
		return { counts, collectedRupees };
	}
	const rows = await sql()`
		select status, count(*)::int as n, coalesce(sum(amount_rupees), 0)::float8 as total
		from registrations group by status`;
	for (const r of rows) {
		counts[r.status as Status] = r.n;
		if (r.status === 'paid') collectedRupees = r.total;
	}
	return { counts, collectedRupees };
}

export async function markPaid(id: string, by: string): Promise<Registration | null> {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (!row || row.status === 'paid') return null;
		Object.assign(row, { status: 'paid', reviewedAt: now(), reviewedBy: by, rejectionReason: null });
		return row;
	}
	const rows = await sql()`
		update registrations set status = 'paid', reviewed_at = now(), reviewed_by = ${by},
			rejection_reason = null, updated_at = now()
		where id = ${id} and status <> 'paid'
		returning *`;
	return rows[0] ? fromRow(rows[0]) : null;
}

export async function markRejected(id: string, by: string, reason: string): Promise<Registration | null> {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (!row || row.status === 'paid') return null;
		Object.assign(row, { status: 'rejected', reviewedAt: now(), reviewedBy: by, rejectionReason: reason });
		return row;
	}
	const rows = await sql()`
		update registrations set status = 'rejected', reviewed_at = now(), reviewed_by = ${by},
			rejection_reason = ${reason}, updated_at = now()
		where id = ${id} and status <> 'paid'
		returning *`;
	return rows[0] ? fromRow(rows[0]) : null;
}

export async function markTicketEmailed(id: string) {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (row) row.ticketEmailedAt = now();
		return;
	}
	await sql()`update registrations set ticket_emailed_at = now(), updated_at = now() where id = ${id}`;
}
