import { dev } from '$app/env';
import {
	VOUCHER_MAX_QUANTITY,
	VOUCHER_SCOPES,
	isValidVoucherCode,
	normaliseVoucherCode,
	type Voucher,
	type VoucherScope
} from '#lib/voucher.ts';
import { CATALOG_MAX_PRICE } from './catalog.ts';
import { isDatabaseConfigured, sql } from './db.ts';

/*
 * The voucher list lives in the settings table as one JSON list ("vouchers"),
 * like stalls and memberships. Which registration used which voucher is a
 * column on the registration, so counting uses is a query, not a stored number.
 */

const useMemory = !isDatabaseConfigured && dev;
let memory: Voucher[] = [];

export async function listVouchers(): Promise<Voucher[]> {
	if (useMemory) return structuredClone(memory);
	const rows = await sql()`select value from settings where key = 'vouchers'`;
	return Array.isArray(rows[0]?.value) ? (rows[0].value as Voucher[]) : [];
}

async function write(list: Voucher[], by: string) {
	if (useMemory) {
		memory = structuredClone(list);
		return;
	}
	await sql()`
		insert into settings (key, value, updated_at, updated_by)
		values ('vouchers', ${JSON.stringify(list)}::jsonb, now(), ${by})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}

export async function findVoucher(code: string): Promise<Voucher | null> {
	const wanted = normaliseVoucherCode(code);
	return (await listVouchers()).find((v) => v.code === wanted) ?? null;
}

type Errors = Record<string, string>;
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export function readVoucher(form: FormData, existing: Voucher[]): { voucher: Voucher; errors: Errors } {
	const errors: Errors = {};
	const id = text(form, 'id') || null;
	const before = existing.find((v) => v.id === id);

	const code = normaliseVoucherCode(text(form, 'code'));
	if (!isValidVoucherCode(code)) errors.code = 'Use 3 to 20 letters, digits or dashes, e.g. EARLYBIRD.';
	else if (existing.some((v) => v.id !== id && v.code === code)) errors.code = `${code} already exists. Use a different code.`;

	const scopeText = text(form, 'scope');
	const scope = (VOUCHER_SCOPES as string[]).includes(scopeText) ? (scopeText as VoucherScope) : 'pass';
	const kind = text(form, 'kind') === 'amount' ? 'amount' : 'percent';

	const value = Number(text(form, 'value'));
	if (kind === 'percent') {
		if (!Number.isInteger(value) || value < 1 || value > 100) errors.value = 'Enter a whole percentage from 1 to 100.';
	} else if (!Number.isFinite(value) || value < 1 || value > CATALOG_MAX_PRICE || Math.round(value * 100) !== value * 100) {
		errors.value = `Enter an amount between ₹1 and ₹${CATALOG_MAX_PRICE.toLocaleString('en-IN')}.`;
	}

	const quantity = Number(text(form, 'quantity'));
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > VOUCHER_MAX_QUANTITY) {
		errors.quantity = `Enter how many times it can be used, 1 to ${VOUCHER_MAX_QUANTITY.toLocaleString('en-IN')}.`;
	}

	const note = text(form, 'note').replace(/\s+/g, ' ').slice(0, 120) || null;
	return {
		voucher: { id: before?.id ?? crypto.randomUUID(), code, scope, kind, value, quantity, note, active: before?.active ?? true },
		errors
	};
}

/** Adds the voucher, or replaces the one with the same id. Returns the replaced one, if any. */
export async function saveVoucher(voucher: Voucher, by: string): Promise<Voucher | null> {
	const list = await listVouchers();
	const i = list.findIndex((v) => v.id === voucher.id);
	await write(i === -1 ? [...list, voucher] : list.map((v, j) => (j === i ? voucher : v)), by);
	return i === -1 ? null : list[i];
}

export async function setVoucherActive(id: string, active: boolean, by: string) {
	await write((await listVouchers()).map((v) => (v.id === id ? { ...v, active } : v)), by);
}

/** Removes the voucher; returns it so its holders can be repriced. */
export async function removeVoucher(id: string, by: string): Promise<Voucher | null> {
	const list = await listVouchers();
	const gone = list.find((v) => v.id === id) ?? null;
	if (gone) await write(list.filter((v) => v.id !== id), by);
	return gone;
}
