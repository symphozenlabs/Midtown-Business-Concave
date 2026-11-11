import { dev } from '$app/env';
import { sizeLabel } from '#lib/catalog.ts';
import { normalisePhone } from '#lib/registration.ts';
import {
	DEFAULT_STALL_OFFER,
	type SponsorRequestInput,
	type SponsorStatus,
	type SponsorTier,
	type StallBookingInput,
	type StallBookingStatus
} from '#lib/stall-booking.ts';
import { discountFor, normaliseVoucherCode, type Voucher } from '#lib/voucher.ts';
import { listStalls } from './catalog.ts';
import { isDatabaseConfigured, sql, uniqueViolation } from './db.ts';
import { getPaymentSettings } from './store.ts';
import { findVoucher, saveVoucher } from './vouchers.ts';

/*
 * Stall bookings and sponsor requests. Each has its own table, created here on
 * first use (same statements as db/schema.sql), so the live site works before
 * the schema is rerun. A stall booking follows the delegate flow: booked
 * (awaiting payment) → payment submitted (UPI transaction ID) → paid or rejected
 * by an organiser, who also allots the final stall number.
 */

const useMemory = !isDatabaseConfigured && dev;
export const isBookingStoreAvailable = isDatabaseConfigured || useMemory;

/** The members' promo code the organisers asked for: 25% off stalls. */
export const SEF_MEMBER_VOUCHER: Voucher = {
	id: 'sef-member-stall-25',
	code: 'SEFMEMBER',
	scope: 'stall',
	kind: 'percent',
	value: 25,
	quantity: 1000,
	note: 'Salem Entrepreneurs Forum members: 25% off stalls',
	active: true
};

const TABLES = [
	`create table if not exists stall_bookings (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  full_name        text not null check (char_length(full_name) between 2 and 60),
  business_name    text not null check (char_length(business_name) between 2 and 80),
  email            text not null check (char_length(email) <= 120),
  phone            text not null check (phone ~ '^\\+91[6-9][0-9]{9}$'),
  preferred_stall  int check (preferred_stall between 1 and 39),
  allotted_stall   int check (allotted_stall between 1 and 39),
  stall_type       text not null,
  price_rupees     numeric(10, 2) not null,
  voucher_code     text,
  discount_rupees  numeric(10, 2) not null default 0,
  amount_rupees    numeric(10, 2) not null,
  payee_vpa        text not null,
  payee_name       text not null,
  status           text not null default 'pending_payment'
                   check (status in ('pending_payment', 'payment_submitted', 'paid', 'rejected')),
  upi_txn_id       text check (upi_txn_id is null or upi_txn_id ~ '^[0-9]{12}$'),
  payment_submitted_at timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      text,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
)`,
	`create unique index if not exists stall_bookings_upi_txn_id_key on stall_bookings (upi_txn_id) where upi_txn_id is not null`,
	`create index if not exists stall_bookings_voucher_idx on stall_bookings (voucher_code) where voucher_code is not null`,
	`create table if not exists sponsor_requests (
  id            uuid primary key default gen_random_uuid(),
  contact_name  text not null check (char_length(contact_name) between 2 and 60),
  company_name  text not null check (char_length(company_name) between 2 and 80),
  email         text not null check (char_length(email) <= 120),
  phone         text not null check (phone ~ '^\\+91[6-9][0-9]{9}$'),
  tier          text not null,
  message       text check (char_length(message) <= 600),
  status        text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'declined')),
  admin_note    text check (char_length(admin_note) <= 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text
)`
];

let ready: Promise<void> | null = null;

/** Creates the tables (once per server instance) and adds SEFMEMBER once. */
function ensureReady(): Promise<void> {
	if (useMemory) return Promise.resolve();
	ready ??= (async () => {
		for (const statement of TABLES) await sql().query(statement);
		await seedSefMember();
	})().catch((e) => {
		ready = null;
		throw e;
	});
	return ready;
}

/**
 * Adds SEFMEMBER to the voucher list the first time only (a settings flag
 * remembers it), so an organiser who later edits or deletes it is not overridden.
 * One statement: the flag and the voucher are written together or not at all,
 * and an existing SEFMEMBER is never duplicated.
 */
async function seedSefMember() {
	await sql()`
		with flag as (
			insert into settings (key, value, updated_by) values ('seeded_sefmember', 'true'::jsonb, 'system')
			on conflict (key) do nothing returning key
		)
		insert into settings (key, value, updated_at, updated_by)
		select 'vouchers', jsonb_build_array(${JSON.stringify(SEF_MEMBER_VOUCHER)}::jsonb), now(), 'system' from flag
		on conflict (key) do update set value = settings.value || excluded.value, updated_at = now(), updated_by = 'system'
		where not exists (
			select 1 from jsonb_array_elements(settings.value) as v where v ->> 'code' = ${SEF_MEMBER_VOUCHER.code}
		)`;
}

if (useMemory) {
	// Development without Neon: the same starting point as the live site.
	findVoucher(SEF_MEMBER_VOUCHER.code).then((v) => (v ? null : saveVoucher(SEF_MEMBER_VOUCHER, 'system')));
}

/* ---------- what is for sale ---------- */

export interface StallOffer {
	id: string;
	name: string;
	sizeLabel: string;
	priceRupees: number;
	vpa: string;
	payeeName: string;
}

/**
 * Stall types open for sale under Admin → Payments → Stalls, or the standard
 * ₹7,500 stall when none is set up. Paid to the type's own UPI ID if it has one.
 */
export async function listStallOffers(): Promise<StallOffer[]> {
	const [types, payment] = await Promise.all([listStalls(), getPaymentSettings()]);
	const open = types.filter((t) => t.active);
	if (!open.length) return [{ ...DEFAULT_STALL_OFFER, vpa: payment.vpa, payeeName: payment.payeeName }];
	return open.map((t) => ({
		id: t.id,
		name: t.name,
		sizeLabel: sizeLabel(t),
		priceRupees: t.priceRupees,
		vpa: t.vpa ?? payment.vpa,
		payeeName: t.payeeName ?? payment.payeeName
	}));
}

/* ---------- promo codes ---------- */

export type PromoResult =
	| { ok: true; voucher: Voucher | null; discount: number }
	| { ok: false; reason: 'invalid' | 'closed' | 'used_up' };

/** How many stall bookings (not rejected) hold each voucher code, and how many are paid. */
export async function stallVoucherUsage(): Promise<Record<string, { used: number; paid: number }>> {
	if (!isBookingStoreAvailable) return {};
	const usage: Record<string, { used: number; paid: number }> = {};
	if (useMemory) {
		for (const b of memory.bookings) {
			if (!b.voucherCode || b.status === 'rejected') continue;
			const u = (usage[b.voucherCode] ??= { used: 0, paid: 0 });
			u.used++;
			if (b.status === 'paid') u.paid++;
		}
		return usage;
	}
	await ensureReady();
	const rows = await sql()`
		select voucher_code, count(*)::int as used, count(*) filter (where status = 'paid')::int as paid
		from stall_bookings where voucher_code is not null and status <> 'rejected' group by voucher_code`;
	for (const r of rows) usage[r.voucher_code] = { used: r.used, paid: r.paid };
	return usage;
}

/** Checks a promo code against a stall price. An empty code is fine (no discount). */
export async function checkStallPromo(raw: string, priceRupees: number): Promise<PromoResult> {
	const code = normaliseVoucherCode(raw);
	if (!code) return { ok: true, voucher: null, discount: 0 };
	const voucher = await findVoucher(code);
	if (!voucher || voucher.scope !== 'stall') return { ok: false, reason: 'invalid' };
	if (!voucher.active) return { ok: false, reason: 'closed' };
	const used = (await stallVoucherUsage())[voucher.code]?.used ?? 0;
	if (used >= voucher.quantity) return { ok: false, reason: 'used_up' };
	return { ok: true, voucher, discount: discountFor(voucher, priceRupees) };
}

/* ---------- stall bookings ---------- */

export interface StallBooking {
	id: string;
	code: string;
	fullName: string;
	businessName: string;
	email: string;
	phone: string;
	preferredStall: number | null;
	allottedStall: number | null;
	stallType: string;
	priceRupees: number;
	voucherCode: string | null;
	discountRupees: number;
	amountRupees: number;
	payeeVpa: string;
	payeeName: string;
	status: StallBookingStatus;
	upiTxnId: string | null;
	paymentSubmittedAt: string | null;
	reviewedAt: string | null;
	reviewedBy: string | null;
	rejectionReason: string | null;
	createdAt: string;
}

/** What the booking page needs to show the payment step. */
export interface StallPayment {
	code: string;
	email: string;
	fullName: string;
	businessName: string;
	stallType: string;
	preferredStall: number | null;
	priceRupees: number;
	voucherCode: string | null;
	discountRupees: number;
	amountRupees: number;
	vpa: string;
	payeeName: string;
	status: StallBookingStatus;
}

export const paymentOf = (b: StallBooking): StallPayment => ({
	code: b.code,
	email: b.email,
	fullName: b.fullName,
	businessName: b.businessName,
	stallType: b.stallType,
	preferredStall: b.preferredStall,
	priceRupees: b.priceRupees,
	voucherCode: b.voucherCode,
	discountRupees: b.discountRupees,
	amountRupees: b.amountRupees,
	vpa: b.payeeVpa,
	payeeName: b.payeeName,
	status: b.status
});

const memory = { bookings: [] as StallBooking[], sponsors: [] as SponsorRequest[] };

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
function newCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return 'STL-' + [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

function bookingFrom(r: Record<string, any>): StallBooking {
	return {
		id: r.id,
		code: r.code,
		fullName: r.full_name,
		businessName: r.business_name,
		email: r.email,
		phone: r.phone,
		preferredStall: r.preferred_stall ?? null,
		allottedStall: r.allotted_stall ?? null,
		stallType: r.stall_type,
		priceRupees: Number(r.price_rupees),
		voucherCode: r.voucher_code ?? null,
		discountRupees: Number(r.discount_rupees),
		amountRupees: Number(r.amount_rupees),
		payeeVpa: r.payee_vpa,
		payeeName: r.payee_name,
		status: r.status,
		upiTxnId: r.upi_txn_id ?? null,
		paymentSubmittedAt: iso(r.payment_submitted_at),
		reviewedAt: iso(r.reviewed_at),
		reviewedBy: r.reviewed_by ?? null,
		rejectionReason: r.rejection_reason ?? null,
		createdAt: iso(r.created_at)!
	};
}

export type CreateBookingResult =
	| { ok: true; booking: StallBooking }
	| { ok: false; reason: 'invalid' | 'closed' | 'used_up' | 'no_offer' };

export async function createStallBooking(input: StallBookingInput): Promise<CreateBookingResult> {
	await ensureReady();
	const offers = await listStallOffers();
	const offer = offers.find((o) => o.id === input.stallTypeId) ?? (offers.length === 1 ? offers[0] : null);
	if (!offer) return { ok: false, reason: 'no_offer' };

	const promo = await checkStallPromo(input.promoCode, offer.priceRupees);
	if (!promo.ok) return promo;
	const discount = promo.discount;

	const base = {
		fullName: input.fullName.trim().replace(/\s+/g, ' '),
		businessName: input.businessName.trim().replace(/\s+/g, ' '),
		email: input.email.trim().toLowerCase(),
		phone: normalisePhone(input.phone)!,
		preferredStall: input.preferredStall,
		stallType: `${offer.name} (${offer.sizeLabel})`,
		priceRupees: offer.priceRupees,
		voucherCode: promo.voucher?.code ?? null,
		discountRupees: discount,
		amountRupees: offer.priceRupees - discount,
		payeeVpa: offer.vpa,
		payeeName: offer.payeeName
	};

	if (useMemory) {
		const booking: StallBooking = {
			...base,
			id: crypto.randomUUID(),
			code: newCode(),
			allottedStall: null,
			status: 'pending_payment',
			upiTxnId: null,
			paymentSubmittedAt: null,
			reviewedAt: null,
			reviewedBy: null,
			rejectionReason: null,
			createdAt: new Date().toISOString()
		};
		memory.bookings.push(booking);
		return { ok: true, booking };
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		const code = newCode();
		const insert = (limit: number | null) => sql()`
			insert into stall_bookings (code, full_name, business_name, email, phone, preferred_stall, stall_type,
				price_rupees, voucher_code, discount_rupees, amount_rupees, payee_vpa, payee_name)
			select ${code}, ${base.fullName}, ${base.businessName}, ${base.email}, ${base.phone}, ${base.preferredStall},
				${base.stallType}, ${base.priceRupees}, ${base.voucherCode}, ${base.discountRupees}, ${base.amountRupees},
				${base.payeeVpa}, ${base.payeeName}
			where ${limit}::int is null
				or (select count(*) from stall_bookings where voucher_code = ${base.voucherCode} and status <> 'rejected') < ${limit}::int
			returning *`;
		try {
			let rows: Record<string, any>[];
			if (promo.voucher) {
				// One booking at a time per code, so the last use cannot be taken twice.
				const [, inserted] = await sql().transaction([
					sql()`select pg_advisory_xact_lock(hashtext(${'stall-voucher:' + promo.voucher.code}))::text as locked`,
					insert(promo.voucher.quantity)
				]);
				rows = inserted as Record<string, any>[];
			} else {
				rows = await insert(null);
			}
			if (!rows[0]) return { ok: false, reason: 'used_up' };
			return { ok: true, booking: bookingFrom(rows[0]) };
		} catch (e) {
			if (uniqueViolation(e) && attempt < 2) continue; // code collision: try another
			throw e;
		}
	}
	throw new Error('Could not create a booking code.');
}

export async function findStallBooking(code: string, email: string): Promise<StallBooking | null> {
	const wantedEmail = email.trim().toLowerCase();
	if (useMemory) return memory.bookings.find((b) => b.code === code && b.email === wantedEmail) ?? null;
	await ensureReady();
	const rows = await sql()`select * from stall_bookings where code = ${code} and email = ${wantedEmail} limit 1`;
	return rows[0] ? bookingFrom(rows[0]) : null;
}

export type StallPayResult =
	| { ok: true; booking: StallBooking }
	| { ok: false; reason: 'not_found' | 'utr_used' | 'utr_required' | 'paid' | 'rejected' };

/** The exhibitor reports their UPI transaction ID (or, when the promo covers it all, nothing). */
export async function submitStallPayment(code: string, email: string, utr: string | null): Promise<StallPayResult> {
	const booking = await findStallBooking(code, email);
	if (!booking) return { ok: false, reason: 'not_found' };
	if (booking.status === 'paid') return { ok: false, reason: 'paid' };
	if (booking.status === 'rejected') return { ok: false, reason: 'rejected' };
	if (!utr && booking.amountRupees > 0) return { ok: false, reason: 'utr_required' };

	if (useMemory) {
		if (utr && memory.bookings.some((b) => b.upiTxnId === utr && b.id !== booking.id)) return { ok: false, reason: 'utr_used' };
		Object.assign(booking, { upiTxnId: utr, status: 'payment_submitted', paymentSubmittedAt: new Date().toISOString() });
		return { ok: true, booking };
	}

	try {
		const rows = await sql()`
			update stall_bookings set upi_txn_id = ${utr}, status = 'payment_submitted',
				payment_submitted_at = now(), updated_at = now()
			where id = ${booking.id} and status in ('pending_payment', 'payment_submitted')
				and (${utr}::text is null or not exists (select 1 from registrations where upi_txn_id = ${utr}))
			returning *`;
		if (!rows[0]) return { ok: false, reason: utr ? 'utr_used' : 'not_found' };
		return { ok: true, booking: bookingFrom(rows[0]) };
	} catch (e) {
		if (uniqueViolation(e)) return { ok: false, reason: 'utr_used' };
		throw e;
	}
}

/* ---------- organisers ---------- */

export async function listStallBookings(): Promise<StallBooking[]> {
	if (!isBookingStoreAvailable) return [];
	if (useMemory) return structuredClone(memory.bookings).reverse();
	await ensureReady();
	const rows = await sql()`select * from stall_bookings order by created_at desc limit 1000`;
	return rows.map(bookingFrom);
}

export async function getStallBooking(id: string): Promise<StallBooking | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	if (useMemory) return memory.bookings.find((b) => b.id === id) ?? null;
	await ensureReady();
	const rows = await sql()`select * from stall_bookings where id = ${id}`;
	return rows[0] ? bookingFrom(rows[0]) : null;
}

/** Confirms the payment and allots the final stall number (it can be left empty and set later). */
export async function markStallPaid(id: string, allotted: number | null, by: string): Promise<StallBooking | null> {
	if (useMemory) {
		const b = memory.bookings.find((x) => x.id === id && x.status !== 'paid');
		if (!b) return null;
		Object.assign(b, { status: 'paid', allottedStall: allotted, reviewedAt: new Date().toISOString(), reviewedBy: by, rejectionReason: null });
		return b;
	}
	await ensureReady();
	const rows = await sql()`
		update stall_bookings set status = 'paid', allotted_stall = ${allotted}, reviewed_at = now(), reviewed_by = ${by},
			rejection_reason = null, updated_at = now()
		where id = ${id} and status <> 'paid' returning *`;
	return rows[0] ? bookingFrom(rows[0]) : null;
}

export async function rejectStallBooking(id: string, reason: string, by: string): Promise<StallBooking | null> {
	if (useMemory) {
		const b = memory.bookings.find((x) => x.id === id && x.status !== 'rejected');
		if (!b) return null;
		Object.assign(b, { status: 'rejected', rejectionReason: reason || null, reviewedAt: new Date().toISOString(), reviewedBy: by });
		return b;
	}
	await ensureReady();
	const rows = await sql()`
		update stall_bookings set status = 'rejected', rejection_reason = ${reason || null}, reviewed_at = now(),
			reviewed_by = ${by}, updated_at = now()
		where id = ${id} and status <> 'rejected' returning *`;
	return rows[0] ? bookingFrom(rows[0]) : null;
}

/** Changes the allotted stall of a booking; null clears it. */
export async function allotStall(id: string, allotted: number | null, by: string): Promise<StallBooking | null> {
	if (useMemory) {
		const b = memory.bookings.find((x) => x.id === id);
		if (!b) return null;
		Object.assign(b, { allottedStall: allotted, reviewedBy: by });
		return b;
	}
	await ensureReady();
	const rows = await sql()`
		update stall_bookings set allotted_stall = ${allotted}, reviewed_by = ${by}, updated_at = now()
		where id = ${id} returning *`;
	return rows[0] ? bookingFrom(rows[0]) : null;
}

/* ---------- sponsor requests ---------- */

export interface SponsorRequest {
	id: string;
	contactName: string;
	companyName: string;
	email: string;
	phone: string;
	tier: SponsorTier['id'];
	message: string | null;
	status: SponsorStatus;
	adminNote: string | null;
	createdAt: string;
	updatedAt: string;
	updatedBy: string | null;
}

function sponsorFrom(r: Record<string, any>): SponsorRequest {
	return {
		id: r.id,
		contactName: r.contact_name,
		companyName: r.company_name,
		email: r.email,
		phone: r.phone,
		tier: r.tier,
		message: r.message ?? null,
		status: r.status,
		adminNote: r.admin_note ?? null,
		createdAt: iso(r.created_at)!,
		updatedAt: iso(r.updated_at)!,
		updatedBy: r.updated_by ?? null
	};
}

export async function createSponsorRequest(input: SponsorRequestInput): Promise<SponsorRequest> {
	const row = {
		contactName: input.contactName.trim().replace(/\s+/g, ' '),
		companyName: input.companyName.trim().replace(/\s+/g, ' '),
		email: input.email.trim().toLowerCase(),
		phone: normalisePhone(input.phone)!,
		tier: input.tier,
		message: input.message.trim() || null
	};
	if (useMemory) {
		const now = new Date().toISOString();
		const request: SponsorRequest = { ...row, id: crypto.randomUUID(), status: 'new', adminNote: null, createdAt: now, updatedAt: now, updatedBy: null };
		memory.sponsors.push(request);
		return request;
	}
	await ensureReady();
	const rows = await sql()`
		insert into sponsor_requests (contact_name, company_name, email, phone, tier, message)
		values (${row.contactName}, ${row.companyName}, ${row.email}, ${row.phone}, ${row.tier}, ${row.message})
		returning *`;
	return sponsorFrom(rows[0]);
}

export async function listSponsorRequests(): Promise<SponsorRequest[]> {
	if (!isBookingStoreAvailable) return [];
	if (useMemory) return structuredClone(memory.sponsors).reverse();
	await ensureReady();
	const rows = await sql()`select * from sponsor_requests order by created_at desc limit 1000`;
	return rows.map(sponsorFrom);
}

export async function updateSponsorRequest(id: string, status: SponsorStatus, note: string | null, by: string): Promise<boolean> {
	if (useMemory) {
		const r = memory.sponsors.find((x) => x.id === id);
		if (!r) return false;
		Object.assign(r, { status, adminNote: note, updatedAt: new Date().toISOString(), updatedBy: by });
		return true;
	}
	if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
	await ensureReady();
	const rows = await sql()`
		update sponsor_requests set status = ${status}, admin_note = ${note}, updated_at = now(), updated_by = ${by}
		where id = ${id} returning id`;
	return rows.length > 0;
}

/** Makes sure the tables and SEFMEMBER exist; the admin pages call it so the promo shows up there. */
export const prepareBookings = () => (isBookingStoreAvailable ? ensureReady() : Promise.resolve());

