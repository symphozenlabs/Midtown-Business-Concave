import { dev } from '$app/env';
import { AWARD_LIMITS, awardCategoryLabel, normaliseWebsite, type AwardApplicationInput, type AwardStatus } from '#lib/awards.ts';
import { normalisePhone } from '#lib/registration.ts';
import { isDatabaseConfigured, sql, uniqueViolation } from './db.ts';
import { readSetting, writeSetting } from './store.ts';

/*
 * Business award applications from awards.midtownevents.in. The table is created
 * on first use (same statements as db/schema.sql), so the live site works before
 * the schema is rerun. Organisers open and close applications from Admin → Awards.
 */

const useMemory = !isDatabaseConfigured && dev;
export const isAwardsStoreAvailable = isDatabaseConfigured || useMemory;

const TABLES = [
	`create table if not exists award_applications (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  full_name       text not null check (char_length(full_name) between 2 and ${AWARD_LIMITS.fullName}),
  designation     text not null check (char_length(designation) between 2 and ${AWARD_LIMITS.designation}),
  email           text not null check (char_length(email) <= ${AWARD_LIMITS.email}),
  phone           text not null check (phone ~ '^\\+91[6-9][0-9]{9}$'),
  city            text not null check (char_length(city) between 2 and ${AWARD_LIMITS.city}),
  business_name   text not null check (char_length(business_name) between 2 and ${AWARD_LIMITS.businessName}),
  category_id     text not null,
  other_category  text check (char_length(other_category) <= ${AWARD_LIMITS.otherCategory}),
  year_started    int not null check (year_started between 1850 and 2100),
  team_size       text not null,
  website         text check (char_length(website) <= 260),
  about           text not null check (char_length(about) <= ${AWARD_LIMITS.about}),
  achievements    text not null check (char_length(achievements) <= ${AWARD_LIMITS.achievements}),
  logo_key        text,
  status          text not null default 'new' check (status in ('new', 'shortlisted', 'winner', 'rejected')),
  admin_note      text check (char_length(admin_note) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text
)`,
	`create unique index if not exists award_applications_once_key
  on award_applications (phone, lower(business_name), category_id, lower(coalesce(other_category, '')))`,
	`create index if not exists award_applications_created_idx on award_applications (created_at desc)`
];

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
	if (useMemory) return Promise.resolve();
	ready ??= (async () => {
		for (const statement of TABLES) await sql().query(statement);
	})().catch((e) => {
		ready = null;
		throw e;
	});
	return ready;
}

export interface AwardApplication {
	id: string;
	code: string;
	fullName: string;
	designation: string;
	email: string;
	phone: string;
	city: string;
	businessName: string;
	categoryId: string;
	otherCategory: string | null;
	categoryLabel: string;
	yearStarted: number;
	teamSize: string;
	website: string | null;
	about: string;
	achievements: string;
	logoKey: string | null;
	status: AwardStatus;
	adminNote: string | null;
	createdAt: string;
	updatedAt: string;
	updatedBy: string | null;
}

export class DuplicateAwardError extends Error {}

const memory = { rows: [] as AwardApplication[], open: true, closesAt: null as string | null };

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
function newCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return 'AWD-' + [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const iso = (v: unknown) => new Date(v as string).toISOString();
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

function fromRow(r: Record<string, any>): AwardApplication {
	return {
		id: r.id,
		code: r.code,
		fullName: r.full_name,
		designation: r.designation,
		email: r.email,
		phone: r.phone,
		city: r.city,
		businessName: r.business_name,
		categoryId: r.category_id,
		otherCategory: r.other_category ?? null,
		categoryLabel: awardCategoryLabel(r.category_id, r.other_category),
		yearStarted: Number(r.year_started),
		teamSize: r.team_size,
		website: r.website ?? null,
		about: r.about,
		achievements: r.achievements,
		logoKey: r.logo_key ?? null,
		status: r.status,
		adminNote: r.admin_note ?? null,
		createdAt: iso(r.created_at),
		updatedAt: iso(r.updated_at),
		updatedBy: r.updated_by ?? null
	};
}

/* ---------- open / closed ---------- */

export interface AwardsWindow {
	/** Taking applications right now. */
	open: boolean;
	/** The organisers' Open/Close switch, before the closing time is applied. */
	switchedOn: boolean;
	/** When applications close by themselves (ISO), or null for no closing time. */
	closesAt: string | null;
}

async function readAwardsSetting(): Promise<{ switchedOn: boolean; closesAt: string | null }> {
	if (useMemory) return { switchedOn: memory.open, closesAt: memory.closesAt };
	const value = ((await readSetting('awards')) ?? {}) as { open?: boolean; closesAt?: unknown };
	const closesAt = typeof value.closesAt === 'string' && !Number.isNaN(Date.parse(value.closesAt)) ? value.closesAt : null;
	return { switchedOn: value.open !== false, closesAt };
}

async function writeAwardsSetting(switchedOn: boolean, closesAt: string | null, by: string) {
	if (useMemory) {
		memory.open = switchedOn;
		memory.closesAt = closesAt;
		return;
	}
	await writeSetting('awards', { open: switchedOn, closesAt }, by);
}

/** Open while the switch is on and the closing time, if any, has not passed. */
export async function getAwardsWindow(now = Date.now()): Promise<AwardsWindow> {
	if (!isAwardsStoreAvailable) return { open: false, switchedOn: false, closesAt: null };
	const { switchedOn, closesAt } = await readAwardsSetting();
	return { open: switchedOn && (!closesAt || now < Date.parse(closesAt)), switchedOn, closesAt };
}

export async function areAwardsOpen(): Promise<boolean> {
	return (await getAwardsWindow()).open;
}

/** Opening again after the closing time has passed removes that closing time, so it really reopens. */
export async function setAwardsOpen(open: boolean, by: string) {
	const { closesAt } = await readAwardsSetting();
	const passed = closesAt !== null && Date.parse(closesAt) <= Date.now();
	await writeAwardsSetting(open, open && passed ? null : closesAt, by);
}

/** Sets or clears the automatic closing time; the Open/Close switch is left as it is. */
export async function setAwardsClosingTime(closesAt: string | null, by: string) {
	const { switchedOn } = await readAwardsSetting();
	await writeAwardsSetting(switchedOn, closesAt, by);
}

/* ---------- applications ---------- */

export async function createAwardApplication(input: AwardApplicationInput, logoKey: string | null): Promise<AwardApplication> {
	const other = input.categoryId === 'others' ? tidy(input.otherCategory) : null;
	const row = {
		code: newCode(),
		fullName: tidy(input.fullName),
		designation: tidy(input.designation),
		email: input.email.trim().toLowerCase(),
		phone: normalisePhone(input.phone)!,
		city: tidy(input.city),
		businessName: tidy(input.businessName),
		categoryId: input.categoryId,
		otherCategory: other,
		yearStarted: Number(input.yearStarted.trim()),
		teamSize: input.teamSize,
		website: normaliseWebsite(input.website),
		about: input.about.trim(),
		achievements: input.achievements.trim(),
		logoKey
	};
	if (useMemory) {
		const same = memory.rows.some(
			(r) =>
				r.phone === row.phone &&
				r.businessName.toLowerCase() === row.businessName.toLowerCase() &&
				r.categoryId === row.categoryId &&
				(r.otherCategory ?? '').toLowerCase() === (row.otherCategory ?? '').toLowerCase()
		);
		if (same) throw new DuplicateAwardError();
		const now = new Date().toISOString();
		const saved: AwardApplication = {
			...row,
			id: crypto.randomUUID(),
			categoryLabel: awardCategoryLabel(row.categoryId, row.otherCategory),
			status: 'new',
			adminNote: null,
			createdAt: now,
			updatedAt: now,
			updatedBy: null
		};
		memory.rows.push(saved);
		return saved;
	}
	await ensureReady();
	try {
		const rows = await sql()`
			insert into award_applications (code, full_name, designation, email, phone, city, business_name, category_id,
				other_category, year_started, team_size, website, about, achievements, logo_key)
			values (${row.code}, ${row.fullName}, ${row.designation}, ${row.email}, ${row.phone}, ${row.city}, ${row.businessName},
				${row.categoryId}, ${row.otherCategory}, ${row.yearStarted}, ${row.teamSize}, ${row.website}, ${row.about},
				${row.achievements}, ${row.logoKey})
			returning *`;
		return fromRow(rows[0]);
	} catch (e) {
		if (uniqueViolation(e) === 'award_applications_once_key') throw new DuplicateAwardError();
		throw e;
	}
}

export async function listAwardApplications(): Promise<AwardApplication[]> {
	if (!isAwardsStoreAvailable) return [];
	if (useMemory) return structuredClone(memory.rows).reverse();
	await ensureReady();
	const rows = await sql()`select * from award_applications order by created_at desc limit 5000`;
	return rows.map(fromRow);
}

export async function updateAwardApplication(id: string, status: AwardStatus, note: string | null, by: string): Promise<boolean> {
	if (useMemory) {
		const r = memory.rows.find((x) => x.id === id);
		if (!r) return false;
		Object.assign(r, { status, adminNote: note, updatedAt: new Date().toISOString(), updatedBy: by });
		return true;
	}
	if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
	await ensureReady();
	const rows = await sql()`
		update award_applications set status = ${status}, admin_note = ${note}, updated_at = now(), updated_by = ${by}
		where id = ${id} returning id`;
	return rows.length > 0;
}
