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
	widthM: number;
	depthM: number;
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

/** Common stall footprints in metres, offered as a starting point. */
export const STALL_SIZES: { widthM: number; depthM: number }[] = [
	{ widthM: 2, depthM: 2 },
	{ widthM: 3, depthM: 2 },
	{ widthM: 3, depthM: 3 },
	{ widthM: 4, depthM: 3 },
	{ widthM: 6, depthM: 3 },
	{ widthM: 6, depthM: 6 }
];

const metres = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

export function sizeLabel(s: Pick<StallType, 'widthM' | 'depthM'>) {
	return `${metres(s.widthM)} m × ${metres(s.depthM)} m`;
}

export function areaLabel(s: Pick<StallType, 'widthM' | 'depthM'>) {
	return `${metres(s.widthM * s.depthM)} m²`;
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
