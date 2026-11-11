/**
 * What the organisers sell besides delegate passes: exhibition stalls (by size)
 * and memberships. Each item has its own price and, optionally, its own UPI
 * account; otherwise it is paid to the delegate-pass payee.
 */

export interface PayeeOverride {
	/** Null: paid to the same UPI ID as delegate passes. */
	vpa: string | null;
	payeeName: string | null;
}

export interface StallType extends PayeeOverride {
	id: string;
	name: string;
	/** Stall footprint in feet. */
	widthFt: number;
	depthFt: number;
	priceRupees: number;
	/** How many stalls of this type can be sold. */
	quantity: number;
	description: string | null;
	active: boolean;
}

export interface MembershipPlan extends PayeeOverride {
	id: string;
	name: string;
	priceRupees: number;
	/** Null for a lifetime membership. */
	validityMonths: number | null;
	benefits: string[];
	active: boolean;
}

export type CatalogKind = 'stall' | 'membership';

export const VALIDITY_OPTIONS: { value: number | null; label: string }[] = [
	{ value: 1, label: '1 month' },
	{ value: 3, label: '3 months' },
	{ value: 6, label: '6 months' },
	{ value: 12, label: '1 year' },
	{ value: 24, label: '2 years' },
	{ value: null, label: 'Lifetime' }
];

/** Common stall footprints in feet, offered as a starting point. */
export const STALL_SIZES: { widthFt: number; depthFt: number }[] = [
	{ widthFt: 6, depthFt: 6 },
	{ widthFt: 8, depthFt: 8 },
	{ widthFt: 10, depthFt: 8 },
	{ widthFt: 10, depthFt: 10 },
	{ widthFt: 12, depthFt: 10 },
	{ widthFt: 20, depthFt: 10 }
];

export const STALL_MAX_FEET = 300;

/** Feet to the nearest half foot. */
export const roundFeet = (n: number) => Math.round(n * 2) / 2;

/**
 * A stall type as stored. Sizes used to be saved in metres (widthM, depthM);
 * those are converted to feet when read, so older saved stall types keep working.
 */
export function stallFromStored(raw: StallType & { widthM?: number; depthM?: number }): StallType {
	const { widthM, depthM, ...rest } = raw;
	const toFeet = (ft: unknown, m: unknown) =>
		typeof ft === 'number' ? ft : typeof m === 'number' ? roundFeet(m * 3.28084) : 6;
	return { ...rest, widthFt: toFeet(raw.widthFt, widthM), depthFt: toFeet(raw.depthFt, depthM) };
}

const feet = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

export function sizeLabel(s: Pick<StallType, 'widthFt' | 'depthFt'>) {
	return `${feet(s.widthFt)} ft × ${feet(s.depthFt)} ft`;
}

export function areaLabel(s: Pick<StallType, 'widthFt' | 'depthFt'>) {
	return `${feet(s.widthFt * s.depthFt)} sq ft`;
}

export function validityLabel(months: number | null) {
	return VALIDITY_OPTIONS.find((o) => o.value === months)?.label ?? `${months} months`;
}

/** The note on the UPI payment, so the organisers can tell payments apart. */
export function paymentNote(kind: CatalogKind, name: string) {
	return `${kind === 'stall' ? 'Stall' : 'Membership'}: ${name}`;
}

/** Names compare without case or extra spaces, so "Main Gate" and "main  gate" clash. */
export const sameName = (a: string, b: string) =>
	a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
