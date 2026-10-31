import { dev } from '$app/env';
import { DEFAULT_EVENT, isValidEventSettings, type EventSettings } from '#lib/event-settings.ts';
import { DEFAULT_PAYMENT, type PaymentSettings } from '#lib/payment.ts';
import { discountFor, normaliseVoucherCode, type Voucher } from '#lib/voucher.ts';
import { ensureColumn, isDatabaseConfigured, sql, uniqueViolation } from './db.ts';
import { findVoucher, listVouchers } from './vouchers.ts';

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
	industry: string;
	about: string | null;
	website: string | null;
	linkedin: string | null;
	city: string;
	interests: string[];
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
	/** Resend's id for the last ticket email, used to ask whether it arrived. */
	ticketEmailId: string | null;
	/** Reduced from Resend's last event; null until a ticket has been sent. */
	ticketEmailStatus: EmailStatus | null;
	/** Resend's own word for what last happened: delivered, bounced, delivery_delayed… */
	ticketEmailEvent: string | null;
	ticketEmailCheckedAt: string | null;
	/** Storage key of the ID card back (QR and details); made once the payment is confirmed. */
	ticketBackKey: string | null;
	/** Delegate-pass voucher applied on the payment step; amountRupees is already reduced by it. */
	voucherCode: string | null;
	discountRupees: number;
	createdAt: string;
}

/** Where a ticket email stands. "Not sent" is a paid row with no ticket email yet. */
export type EmailStatus = 'sent' | 'delivered' | 'failed';
export type EmailFilter = 'all' | 'not_sent' | EmailStatus;
export const EMAIL_FILTERS: EmailFilter[] = ['all', 'failed', 'not_sent', 'sent', 'delivered'];

/** Email state of a paid registration, for filters and counts. */
export function emailStateOf(r: Pick<Registration, 'ticketEmailedAt' | 'ticketEmailStatus'>): Exclude<EmailFilter, 'all'> {
	if (!r.ticketEmailedAt) return 'not_sent';
	return r.ticketEmailStatus ?? 'sent';
}

export type PaymentResult =
	| { ok: true; registration: Registration }
	| { ok: false; reason: 'not_found' | 'paid' | 'utr_used' | 'utr_required' };

/** What an unpaid delegate should pay now. */
export interface PaymentDetails {
	status: Status;
	amountRupees: number;
	vpa: string;
	payeeName: string;
	/** The fee before any voucher. */
	priceRupees: number;
	voucherCode: string | null;
	discountRupees: number;
}

export type VoucherResult =
	| { ok: true; details: PaymentDetails }
	| { ok: false; reason: 'not_found' | 'not_pending' | 'invalid' | 'closed' | 'used_up' };

export interface Stats {
	counts: Record<Status, number>;
	collectedRupees: number;
	/** Paid, but the ticket email has not gone out yet. */
	ticketsToSend: number;
	/** Ticket emails of paid registrations, by delivery state. */
	email: Record<Exclude<EmailFilter, 'all'>, number>;
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
		industry: r.industry,
		about: r.about,
		website: r.website,
		linkedin: r.linkedin ?? null,
		city: r.city,
		interests: r.interests ?? [],
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
		ticketEmailId: r.ticket_email_id ?? null,
		ticketEmailStatus: r.ticket_email_status ?? null,
		ticketEmailEvent: r.ticket_email_event ?? null,
		ticketEmailCheckedAt: iso(r.ticket_email_checked_at),
		ticketBackKey: r.ticket_back_key ?? null,
		voucherCode: r.voucher_code ?? null,
		discountRupees: Number(r.discount_rupees ?? 0),
		createdAt: iso(r.created_at)!
	};
}

/* ---------- in-memory store (development only) ---------- */

const mem = {
	rows: new Map<string, Registration>(),
	payment: { ...DEFAULT_PAYMENT } as PaymentSettings,
	event: { ...DEFAULT_EVENT } as EventSettings,
	frontsOutdated: null as FrontsOutdated | null
};

const now = () => new Date().toISOString();
const byEmail = (email: string) => [...mem.rows.values()].find((r) => r.email.toLowerCase() === email.toLowerCase());

/* ---------- settings ---------- */

async function readSetting(key: string): Promise<unknown> {
	const rows = await sql()`select value from settings where key = ${key}`;
	return rows[0]?.value;
}

async function writeSetting(key: string, value: unknown, by: string) {
	await sql()`
		insert into settings (key, value, updated_at, updated_by)
		values (${key}, ${JSON.stringify(value)}::jsonb, now(), ${by})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
	if (useMemory) return { ...mem.payment };
	const value = (await readSetting('payment')) as Partial<PaymentSettings> | undefined;
	return { ...DEFAULT_PAYMENT, ...(value ?? {}) };
}

/**
 * Saves the fee and UPI details. Delegates who have not paid yet move to the new
 * fee (their payment page picks it up); anyone who already reported a payment
 * keeps the amount they were shown. Returns how many registrations were repriced.
 */
export async function savePaymentSettings(settings: PaymentSettings, by: string): Promise<number> {
	if (useMemory) {
		mem.payment = { ...settings };
		let repriced = 0;
		for (const row of mem.rows.values()) {
			if (row.status !== 'pending_payment' || row.voucherCode || row.amountRupees === settings.priceRupees) continue;
			row.amountRupees = settings.priceRupees;
			repriced++;
		}
		return repriced + (await syncVoucherHolders());
	}
	await writeSetting('payment', settings, by);
	await ensureVoucherColumns();
	const rows = await sql()`
		update registrations set amount_rupees = ${settings.priceRupees}, updated_at = now()
		where status = 'pending_payment' and voucher_code is null and amount_rupees <> ${settings.priceRupees}
		returning id`;
	return rows.length + (await syncVoucherHolders());
}

/* ---------- vouchers ---------- */

/** Added on first use when db/schema.sql has not been rerun. */
async function ensureVoucherColumns() {
	await Promise.all([
		ensureColumn('registrations', 'voucher_code'),
		ensureColumn('registrations', 'discount_rupees', 'numeric(10, 2) not null default 0')
	]);
}

/**
 * Unpaid delegates holding a voucher pay the current fee less the voucher's
 * current discount. Run after the fee or a voucher changes. A voucher that no
 * longer exists (or no longer covers the delegate pass) is taken off. Returns
 * how many registrations changed.
 */
export async function syncVoucherHolders(): Promise<number> {
	const [{ priceRupees: price }, vouchers] = await Promise.all([getPaymentSettings(), listVouchers()]);
	const byCode = new Map(vouchers.filter((v) => v.scope === 'pass').map((v) => [v.code, v]));
	const target = (code: string) => {
		const v = byCode.get(code);
		const discount = v ? discountFor(v, price) : 0;
		return { code: v ? code : null, discount, amount: price - discount };
	};

	if (useMemory) {
		let changed = 0;
		for (const row of mem.rows.values()) {
			if (row.status !== 'pending_payment' || !row.voucherCode) continue;
			const t = target(row.voucherCode);
			if (t.code === row.voucherCode && t.discount === row.discountRupees && t.amount === row.amountRupees) continue;
			Object.assign(row, { voucherCode: t.code, discountRupees: t.discount, amountRupees: t.amount });
			changed++;
		}
		return changed;
	}

	await ensureVoucherColumns();
	const held = await sql()`
		select distinct voucher_code from registrations where status = 'pending_payment' and voucher_code is not null`;
	let changed = 0;
	for (const { voucher_code: code } of held) {
		const t = target(code);
		const rows = await sql()`
			update registrations set voucher_code = ${t.code}, discount_rupees = ${t.discount},
				amount_rupees = ${t.amount}, updated_at = now()
			where status = 'pending_payment' and voucher_code = ${code}
				and (${t.code}::text is null or discount_rupees <> ${t.discount} or amount_rupees <> ${t.amount})
			returning id`;
		changed += rows.length;
	}
	return changed;
}

/** How many registrations hold each voucher code (any status), and how many of those are paid. */
export async function voucherUsage(): Promise<Record<string, { used: number; paid: number }>> {
	const usage: Record<string, { used: number; paid: number }> = {};
	if (useMemory) {
		for (const r of mem.rows.values()) {
			if (!r.voucherCode) continue;
			const u = (usage[r.voucherCode] ??= { used: 0, paid: 0 });
			u.used++;
			if (r.status === 'paid') u.paid++;
		}
		return usage;
	}
	await ensureVoucherColumns();
	const rows = await sql()`
		select voucher_code, count(*)::int as used, count(*) filter (where status = 'paid')::int as paid
		from registrations where voucher_code is not null group by voucher_code`;
	for (const r of rows) usage[r.voucher_code] = { used: r.used, paid: r.paid };
	return usage;
}

/**
 * Applies a delegate-pass voucher to an unpaid registration, or with null takes
 * it off. The voucher is claimed here, not when the payment is reported, so the
 * delegate pays the amount they were shown. Claims of one code take turns behind
 * a lock, so the last use cannot go to two delegates at once.
 */
export async function applyVoucher(code: string, email: string, rawVoucher: string | null): Promise<VoucherResult> {
	const settings = await getPaymentSettings();
	const price = settings.priceRupees;
	const wanted = rawVoucher ? normaliseVoucherCode(rawVoucher) : null;
	const voucher: Voucher | null = wanted ? await findVoucher(wanted) : null;
	if (wanted && (!voucher || voucher.scope !== 'pass')) return { ok: false, reason: 'invalid' };

	const reg = await findForPayment(code, email);
	if (!reg) return { ok: false, reason: 'not_found' };
	if (reg.status !== 'pending_payment') return { ok: false, reason: 'not_pending' };
	// Already holding this code: it stays theirs even if the voucher has since closed or filled up.
	const already = !!voucher && reg.voucherCode === voucher.code;
	if (voucher && !already && !voucher.active) return { ok: false, reason: 'closed' };

	const discount = voucher ? discountFor(voucher, price) : 0;
	const next = { voucherCode: voucher?.code ?? null, discountRupees: discount, amountRupees: price - discount };

	if (useMemory) {
		const row = mem.rows.get(reg.id)!;
		if (voucher && !already) {
			const holders = [...mem.rows.values()].filter((r) => r.voucherCode === voucher.code && r.id !== row.id).length;
			if (holders >= voucher.quantity) return { ok: false, reason: 'used_up' };
		}
		Object.assign(row, next);
		return { ok: true, details: detailsOf(row, settings) };
	}

	await ensureVoucherColumns();
	let rows: Record<string, any>[];
	if (voucher && !already) {
		const [, updated] = await sql().transaction([
			sql()`select pg_advisory_xact_lock(hashtext(${'voucher:' + voucher.code}))::text as locked`,
			sql()`
				update registrations set voucher_code = ${next.voucherCode}, discount_rupees = ${next.discountRupees},
					amount_rupees = ${next.amountRupees}, updated_at = now()
				where id = ${reg.id} and status = 'pending_payment'
					and (select count(*) from registrations where voucher_code = ${voucher.code} and id <> ${reg.id}) < ${voucher.quantity}
				returning *`
		]);
		rows = updated as Record<string, any>[];
	} else {
		rows = await sql()`
			update registrations set voucher_code = ${next.voucherCode}, discount_rupees = ${next.discountRupees},
				amount_rupees = ${next.amountRupees}, updated_at = now()
			where id = ${reg.id} and status = 'pending_payment'
			returning *`;
	}
	if (rows[0]) return { ok: true, details: detailsOf(fromRow(rows[0]), settings) };
	// Nothing changed: either the payment was reported meanwhile, or the voucher filled up.
	const latest = await findForPayment(code, email);
	return { ok: false, reason: latest?.status === 'pending_payment' ? 'used_up' : 'not_pending' };
}

async function findForPayment(code: string, email: string): Promise<Registration | null> {
	if (useMemory) {
		return [...mem.rows.values()].find((r) => r.code === code && r.email.toLowerCase() === email.toLowerCase()) ?? null;
	}
	const rows = await sql()`select * from registrations where code = ${code} and lower(email) = lower(${email})`;
	return rows[0] ? fromRow(rows[0]) : null;
}

function detailsOf(r: Registration, settings: PaymentSettings): PaymentDetails {
	return {
		status: r.status,
		amountRupees: r.amountRupees,
		vpa: settings.vpa,
		payeeName: settings.payeeName,
		priceRupees: r.amountRupees + r.discountRupees,
		voucherCode: r.voucherCode,
		discountRupees: r.discountRupees
	};
}

/**
 * What an unpaid delegate should pay right now: their amount and the current UPI
 * payee. Null when the code and email do not match a registration.
 */
export async function getPaymentDetails(code: string, email: string): Promise<PaymentDetails | null> {
	const [settings, found] = await Promise.all([getPaymentSettings(), findForPayment(code, email)]);
	return found ? detailsOf(found, settings) : null;
}

/** When the event happens; shown on the public page and in ticket emails. */
export async function getEventSettings(): Promise<EventSettings> {
	if (useMemory) return { ...mem.event };
	const value = await readSetting('event');
	return isValidEventSettings(value) ? { startsAt: value.startsAt, endsAt: value.endsAt } : { ...DEFAULT_EVENT };
}

export async function saveEventSettings(settings: EventSettings, by: string) {
	if (useMemory) {
		mem.event = { ...settings };
		return;
	}
	await writeSetting('event', settings, by);
}

/*
 * ID card fronts are drawn once, with the date and time of the moment. After the
 * schedule changes, the dashboard offers to redraw them all; this records that.
 */
export interface FrontsOutdated {
	since: string;
	by: string;
}

export async function getFrontsOutdated(): Promise<FrontsOutdated | null> {
	if (useMemory) return mem.frontsOutdated;
	const value = (await readSetting('frontsOutdated')) as Partial<FrontsOutdated> | null | undefined;
	return value && typeof value.since === 'string' ? { since: value.since, by: String(value.by ?? '') } : null;
}

export async function setFrontsOutdated(value: FrontsOutdated | null, by: string) {
	if (useMemory) {
		mem.frontsOutdated = value;
		return;
	}
	await writeSetting('frontsOutdated', value, by);
}

/** What the browser needs to redraw every delegate's ID card front. */
export async function listFrontJobs(): Promise<
	Pick<Registration, 'id' | 'code' | 'fullName' | 'designation' | 'companyName' | 'industry' | 'photoKey' | 'posterFraming'>[]
> {
	const pick = (r: Registration) => ({
		id: r.id,
		code: r.code,
		fullName: r.fullName,
		designation: r.designation,
		companyName: r.companyName,
		industry: r.industry,
		photoKey: r.photoKey,
		posterFraming: r.posterFraming
	});
	if (useMemory) return [...mem.rows.values()].filter((r) => r.photoKey).map(pick);
	const rows = await sql()`
		select * from registrations where photo_key is not null and photo_key <> '' order by created_at`;
	return rows.map(fromRow).map(pick);
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
			ticketEmailId: null,
			ticketEmailStatus: null,
			ticketEmailEvent: null,
			ticketEmailCheckedAt: null,
			ticketBackKey: null,
			voucherCode: null,
			discountRupees: 0,
			createdAt: now()
		};
		mem.rows.set(row.id, row);
		return row;
	}

	await ensureColumn('registrations', 'linkedin');
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const rows = await sql()`
				insert into registrations (
					code, full_name, email, phone, photo_key, poster_key,
					company_name, designation, industry, about, website, linkedin,
					city, interests, heard_from, consent, whatsapp_updates, poster_framing,
					status, amount_rupees
				) values (
					${newCode()}, ${input.fullName}, ${input.email}, ${input.phone}, ${input.photoKey}, ${input.posterKey},
					${input.companyName}, ${input.designation}, ${input.industry}, ${input.about},
					${input.website}, ${input.linkedin}, ${input.city}, ${input.interests}, ${input.heardFrom},
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
	await ensureColumn('registrations', 'linkedin');
	const rows = await sql()`
		update registrations set
			full_name = ${input.fullName}, email = ${input.email}, phone = ${input.phone},
			photo_key = ${input.photoKey}, poster_key = ${input.posterKey},
			company_name = ${input.companyName}, designation = ${input.designation},
			industry = ${input.industry}, about = ${input.about}, website = ${input.website}, linkedin = ${input.linkedin},
			city = ${input.city}, interests = ${input.interests},
			heard_from = ${input.heardFrom}, whatsapp_updates = ${input.whatsappUpdates},
			poster_framing = ${JSON.stringify(input.posterFraming)}::jsonb, amount_rupees = ${input.amountRupees},
			status = 'pending_payment', upi_txn_id = null, payment_submitted_at = null,
			reviewed_at = null, reviewed_by = null, rejection_reason = null, updated_at = now()
		where id = ${id}
		returning *`;
	return fromRow(rows[0]);
}

/**
 * The delegate reports their UPI transaction ID. They can correct it until the admin has reviewed it.
 * Without one (null), only a registration whose voucher covers the whole fee goes through.
 */
export async function submitPayment(code: string, email: string, utr: string | null): Promise<PaymentResult> {
	if (useMemory) {
		const row = [...mem.rows.values()].find((r) => r.code === code && r.email.toLowerCase() === email.toLowerCase());
		if (!row) return { ok: false, reason: 'not_found' };
		if (row.status === 'paid') return { ok: false, reason: 'paid' };
		if (!utr && row.amountRupees > 0) return { ok: false, reason: 'utr_required' };
		if (utr && [...mem.rows.values()].some((r) => r.upiTxnId === utr && r.id !== row.id)) return { ok: false, reason: 'utr_used' };
		Object.assign(row, { status: 'payment_submitted', upiTxnId: utr, paymentSubmittedAt: now(), rejectionReason: null });
		return { ok: true, registration: row };
	}

	const existing = await sql()`
		select id, status, amount_rupees from registrations where code = ${code} and lower(email) = lower(${email})`;
	if (!existing[0]) return { ok: false, reason: 'not_found' };
	if (existing[0].status === 'paid') return { ok: false, reason: 'paid' };
	if (!utr && Number(existing[0].amount_rupees) > 0) return { ok: false, reason: 'utr_required' };
	try {
		// A free registration only goes through while it is still free: the fee may have changed meanwhile.
		const rows = await sql()`
			update registrations set
				status = 'payment_submitted', upi_txn_id = ${utr}, payment_submitted_at = now(),
				rejection_reason = null, updated_at = now()
			where id = ${existing[0].id} and status <> 'paid' and (${utr}::text is not null or amount_rupees = 0)
			returning *`;
		if (!rows[0]) return { ok: false, reason: utr ? 'paid' : 'utr_required' };
		return { ok: true, registration: fromRow(rows[0]) };
	} catch (e) {
		if (uniqueViolation(e) === 'registrations_upi_txn_id_key') return { ok: false, reason: 'utr_used' };
		throw e;
	}
}

export async function listRegistrations(filter: {
	status: Status | 'all';
	q: string;
	email?: EmailFilter;
}): Promise<Registration[]> {
	const q = filter.q.trim();
	const email = filter.email ?? 'all';
	if (useMemory) {
		const needle = q.toLowerCase();
		return [...mem.rows.values()]
			.filter((r) => filter.status === 'all' || r.status === filter.status)
			.filter((r) => email === 'all' || (r.status === 'paid' && emailStateOf(r) === email))
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
			and (${email}::text = 'all' or (status = 'paid' and (
				case when ticket_emailed_at is null then 'not_sent' else coalesce(ticket_email_status, 'sent') end
			) = ${email}))
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
	const email: Stats['email'] = { not_sent: 0, sent: 0, delivered: 0, failed: 0 };
	let collectedRupees = 0;
	if (useMemory) {
		for (const r of mem.rows.values()) {
			counts[r.status]++;
			if (r.status === 'paid') {
				collectedRupees += r.amountRupees;
				email[emailStateOf(r)]++;
			}
		}
		return { counts, collectedRupees, ticketsToSend: email.not_sent, email };
	}
	const [rows, mail] = await Promise.all([
		sql()`
			select status, count(*)::int as n, coalesce(sum(amount_rupees), 0)::float8 as total
			from registrations group by status`,
		sql()`
			select case when ticket_emailed_at is null then 'not_sent' else coalesce(ticket_email_status, 'sent') end as state,
				count(*)::int as n
			from registrations where status = 'paid' group by 1`
	]);
	for (const r of rows) {
		counts[r.status as Status] = r.n;
		if (r.status === 'paid') collectedRupees = r.total;
	}
	for (const r of mail) if (r.state in email) email[r.state as keyof typeof email] = r.n;
	return { counts, collectedRupees, ticketsToSend: email.not_sent, email };
}

/** Sent ticket emails still waiting for a final word from Resend, least recently checked first. */
export async function listEmailsToCheck(limit: number): Promise<Registration[]> {
	if (useMemory) {
		return [...mem.rows.values()]
			.filter((r) => r.status === 'paid' && r.ticketEmailId && emailStateOf(r) === 'sent')
			.sort((a, b) => (a.ticketEmailCheckedAt ?? '').localeCompare(b.ticketEmailCheckedAt ?? ''))
			.slice(0, limit);
	}
	const rows = await sql()`
		select * from registrations
		where status = 'paid' and ticket_email_id is not null and coalesce(ticket_email_status, 'sent') = 'sent'
		order by ticket_email_checked_at asc nulls first
		limit ${limit}`;
	return rows.map(fromRow);
}

/** Paid registrations whose ticket email bounced or failed. */
export async function listFailedTickets(limit: number): Promise<Registration[]> {
	if (useMemory) {
		return [...mem.rows.values()].filter((r) => r.status === 'paid' && r.ticketEmailStatus === 'failed').slice(0, limit);
	}
	const rows = await sql()`
		select * from registrations
		where status = 'paid' and ticket_email_status = 'failed'
		order by ticket_emailed_at asc
		limit ${limit}`;
	return rows.map(fromRow);
}

/** Stores what Resend last reported for a registration's ticket email. */
export async function recordEmailEvent(id: string, event: string, status: EmailStatus) {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (row) Object.assign(row, { ticketEmailEvent: event, ticketEmailStatus: status, ticketEmailCheckedAt: now() });
		return;
	}
	await sql()`
		update registrations set ticket_email_event = ${event}, ticket_email_status = ${status},
			ticket_email_checked_at = now(), updated_at = now()
		where id = ${id}`;
}

/** Marks several registrations as paid at once; returns the ones that changed. */
export async function markManyPaid(ids: string[], by: string): Promise<Registration[]> {
	const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
	if (!unique.length) return [];
	if (useMemory) {
		const changed: Registration[] = [];
		for (const id of unique) {
			const row = mem.rows.get(id);
			if (!row || row.status === 'paid') continue;
			Object.assign(row, { status: 'paid', reviewedAt: now(), reviewedBy: by, rejectionReason: null });
			changed.push(row);
		}
		return changed;
	}
	const rows = await sql()`
		update registrations set status = 'paid', reviewed_at = now(), reviewed_by = ${by},
			rejection_reason = null, updated_at = now()
		where id = any(${unique}::uuid[]) and status <> 'paid'
		returning *`;
	return rows.map(fromRow);
}

/** Paid registrations whose ticket has not been emailed, oldest approval first. */
export async function listUnsentTickets(limit: number): Promise<Registration[]> {
	if (useMemory) {
		return [...mem.rows.values()]
			.filter((r) => r.status === 'paid' && !r.ticketEmailedAt)
			.sort((a, b) => (a.reviewedAt ?? '').localeCompare(b.reviewedAt ?? ''))
			.slice(0, limit);
	}
	const rows = await sql()`
		select * from registrations
		where status = 'paid' and ticket_emailed_at is null
		order by reviewed_at asc nulls first
		limit ${limit}`;
	return rows.map(fromRow);
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

/**
 * Deletes a registration for good. Its desk records (pass tokens, check-ins, meals,
 * certificates, connections) go with it; the scan log keeps its rows, unlinked.
 * Returns the deleted row so the caller can remove its stored images.
 */
export async function deleteRegistration(id: string): Promise<Registration | null> {
	if (useMemory) {
		const row = mem.rows.get(id) ?? null;
		mem.rows.delete(id);
		return row;
	}
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const rows = await sql()`delete from registrations where id = ${id} returning *`;
	return rows[0] ? fromRow(rows[0]) : null;
}

/** Records where the ID card front (poster) is stored, after the organiser redraws it. */
export async function setPosterKey(id: string, key: string) {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (row) row.posterKey = key;
		return;
	}
	await sql()`update registrations set poster_key = ${key}, updated_at = now() where id = ${id}`;
}

/** Records (or, with null, forgets) the ID card back, e.g. after the QR is reissued. */
export async function setTicketBack(id: string, key: string | null) {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (row) row.ticketBackKey = key;
		return;
	}
	await ensureColumn('registrations', 'ticket_back_key');
	await sql()`update registrations set ticket_back_key = ${key}, updated_at = now() where id = ${id}`;
}

/** A ticket email left: remember Resend's id and start tracking it as "sent". */
export async function markTicketEmailed(id: string, emailId: string) {
	if (useMemory) {
		const row = mem.rows.get(id);
		if (row) {
			Object.assign(row, {
				ticketEmailedAt: now(),
				ticketEmailId: emailId,
				ticketEmailStatus: 'sent',
				ticketEmailEvent: 'sent',
				ticketEmailCheckedAt: null
			});
		}
		return;
	}
	await sql()`
		update registrations set ticket_emailed_at = now(), ticket_email_id = ${emailId},
			ticket_email_status = 'sent', ticket_email_event = 'sent', ticket_email_checked_at = null, updated_at = now()
		where id = ${id}`;
}
