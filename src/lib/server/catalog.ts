import { dev } from '$app/env';
import { sameName, type MembershipPlan, type StallType } from '#lib/catalog.ts';
import { isValidVpa } from '#lib/payment.ts';
import { isDatabaseConfigured, sql } from './db.ts';

/*
 * Stall types and membership plans live in the settings table as two JSON
 * lists ("stalls", "memberships"), so no schema change is needed. Only the
 * organisers write them, one save at a time.
 */

const useMemory = !isDatabaseConfigured && dev;
const memory = { stalls: [] as StallType[], memberships: [] as MembershipPlan[] };

export const CATALOG_MAX_PRICE = 1_000_000;

async function read<T>(key: 'stalls' | 'memberships'): Promise<T[]> {
	if (useMemory) return structuredClone(memory[key]) as T[];
	const rows = await sql()`select value from settings where key = ${key}`;
	return Array.isArray(rows[0]?.value) ? (rows[0].value as T[]) : [];
}

async function write<T>(key: 'stalls' | 'memberships', list: T[], by: string) {
	if (useMemory) {
		(memory[key] as T[]) = structuredClone(list);
		return;
	}
	await sql()`
		insert into settings (key, value, updated_at, updated_by)
		values (${key}, ${JSON.stringify(list)}::jsonb, now(), ${by})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}

export const listStalls = () => read<StallType>('stalls');
export const listMemberships = () => read<MembershipPlan>('memberships');

/* ---------- reading the forms ---------- */

type Errors = Record<string, string>;
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const clean = (s: string) => s.replace(/\s+/g, ' ');

function readPrice(form: FormData, errors: Errors) {
	const price = Number(text(form, 'priceRupees'));
	if (!Number.isFinite(price) || price < 1 || price > CATALOG_MAX_PRICE || Math.round(price * 100) !== price * 100) {
		errors.priceRupees = `Enter an amount between ₹1 and ₹${CATALOG_MAX_PRICE.toLocaleString('en-IN')}.`;
	}
	return price;
}

/** Optional own UPI account: both fields or neither. */
function readPayee(form: FormData, errors: Errors) {
	if (form.get('ownPayee') !== 'on') return { vpa: null, payeeName: null };
	const vpa = text(form, 'vpa');
	const payeeName = clean(text(form, 'payeeName'));
	if (!isValidVpa(vpa)) errors.vpa = 'Enter a UPI ID like name@okbank.';
	if (payeeName.length < 2 || payeeName.length > 60) errors.payeeName = 'Enter the name shown on the UPI account.';
	return { vpa, payeeName };
}

function readName(form: FormData, errors: Errors, taken: { id: string; name: string }[], id: string | null) {
	const name = clean(text(form, 'name')).slice(0, 60);
	if (name.length < 2) errors.name = 'Enter a name.';
	else if (taken.some((t) => t.id !== id && sameName(t.name, name))) errors.name = `“${name}” already exists. Use a different name.`;
	return name;
}

export function readStall(form: FormData, existing: StallType[]): { stall: StallType; errors: Errors } {
	const errors: Errors = {};
	const id = text(form, 'id') || null;
	const name = readName(form, errors, existing, id);
	const widthM = Number(text(form, 'widthM'));
	const depthM = Number(text(form, 'depthM'));
	if (!(widthM > 0 && widthM <= 100) || !(depthM > 0 && depthM <= 100)) errors.size = 'Enter the width and depth in metres (up to 100).';
	const priceRupees = readPrice(form, errors);
	const quantity = Number(text(form, 'quantity'));
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) errors.quantity = 'Enter how many stalls, 1 to 1000.';
	const description = clean(text(form, 'description')).slice(0, 200) || null;
	const payee = readPayee(form, errors);
	const before = existing.find((s) => s.id === id);
	return {
		stall: {
			id: before?.id ?? crypto.randomUUID(),
			name,
			widthM: Math.round(widthM * 10) / 10,
			depthM: Math.round(depthM * 10) / 10,
			priceRupees,
			quantity,
			description,
			active: before?.active ?? true,
			...payee
		},
		errors
	};
}

export function readMembership(form: FormData, existing: MembershipPlan[]): { plan: MembershipPlan; errors: Errors } {
	const errors: Errors = {};
	const id = text(form, 'id') || null;
	const name = readName(form, errors, existing, id);
	const priceRupees = readPrice(form, errors);
	const validity = text(form, 'validityMonths');
	const validityMonths = validity === 'lifetime' ? null : Number(validity);
	if (validityMonths !== null && !(Number.isInteger(validityMonths) && validityMonths >= 1 && validityMonths <= 120)) {
		errors.validityMonths = 'Choose how long the membership lasts.';
	}
	const benefits = text(form, 'benefits')
		.split(/\r?\n/)
		.map((b) => clean(b).slice(0, 120))
		.filter(Boolean)
		.slice(0, 12);
	const payee = readPayee(form, errors);
	const before = existing.find((m) => m.id === id);
	return {
		plan: { id: before?.id ?? crypto.randomUUID(), name, priceRupees, validityMonths, benefits, active: before?.active ?? true, ...payee },
		errors
	};
}

/* ---------- saving ---------- */

/** Adds the item, or replaces the one with the same id. */
function upsert<T extends { id: string }>(list: T[], item: T) {
	const i = list.findIndex((x) => x.id === item.id);
	if (i === -1) return [...list, item];
	return list.map((x, j) => (j === i ? item : x));
}

export async function saveStall(stall: StallType, by: string) {
	await write('stalls', upsert(await listStalls(), stall), by);
}

export async function saveMembership(plan: MembershipPlan, by: string) {
	await write('memberships', upsert(await listMemberships(), plan), by);
}

export async function setActive(kind: 'stall' | 'membership', id: string, active: boolean, by: string) {
	if (kind === 'stall') await write('stalls', (await listStalls()).map((s) => (s.id === id ? { ...s, active } : s)), by);
	else await write('memberships', (await listMemberships()).map((m) => (m.id === id ? { ...m, active } : m)), by);
}

export async function removeItem(kind: 'stall' | 'membership', id: string, by: string) {
	if (kind === 'stall') await write('stalls', (await listStalls()).filter((s) => s.id !== id), by);
	else await write('memberships', (await listMemberships()).filter((m) => m.id !== id), by);
}
