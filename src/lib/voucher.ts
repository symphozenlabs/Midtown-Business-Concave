import { formatRupees } from './payment.ts';

/**
 * Discount vouchers the organisers hand out. Each one belongs to one thing that
 * is sold (delegate pass, stalls or memberships), takes either a percentage or a
 * fixed amount off, and can be used a set number of times.
 */

export type VoucherScope = 'pass' | 'stall' | 'membership';
export type VoucherKind = 'percent' | 'amount';

export interface Voucher {
	id: string;
	/** What people type, stored in capitals: EARLYBIRD, SPONSOR-50. */
	code: string;
	scope: VoucherScope;
	kind: VoucherKind;
	/** Percent off (1–100) or rupees off. */
	value: number;
	/** How many times it can be used in all. */
	quantity: number;
	/** Organisers' own note: who it was given to, why. */
	note: string | null;
	active: boolean;
}

export const VOUCHER_SCOPES: VoucherScope[] = ['pass', 'stall', 'membership'];
export const VOUCHER_MAX_QUANTITY = 10_000;

const CODE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

/** Codes compare without case or surrounding spaces. */
export const normaliseVoucherCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');
export const isValidVoucherCode = (code: string) => CODE.test(code);

/** Rupees the voucher takes off this price; never more than the price. */
export function discountFor(v: Pick<Voucher, 'kind' | 'value'>, priceRupees: number) {
	const raw = v.kind === 'percent' ? (priceRupees * v.value) / 100 : v.value;
	return Math.min(priceRupees, Math.round(raw * 100) / 100);
}

export function voucherLabel(v: Pick<Voucher, 'kind' | 'value'>) {
	return v.kind === 'percent' ? `${v.value}% off` : `${formatRupees(v.value)} off`;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A random code that is easy to read out: no 0/O or 1/I/L. Not "MBC-…", which is
 * what registration numbers look like.
 */
export function randomVoucherCode(prefix = 'OFFER') {
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return `${prefix}-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}
