/**
 * Stall booking and sponsor requests: the rules the browser and the server share.
 */

import { normalisePhone } from './registration.ts';

/**
 * Stall numbers as printed on the floor layout (static/floor/stall-layout.jpg).
 * The layout has no stalls 25 and 35.
 */
export const STALL_NUMBERS: number[] = Array.from({ length: 39 }, (_, i) => i + 1).filter((n) => n !== 25 && n !== 35);

/** Used when no stall type is set up under Admin → Payments → Stalls. */
export const DEFAULT_STALL_OFFER = {
	id: 'standard',
	name: 'Standard stall',
	sizeLabel: '6 ft × 6 ft',
	priceRupees: 7500
} as const;

/** What a stall includes, from the event poster. */
export const STALL_INCLUDES = [
	'6 ft × 6 ft stall',
	'LED wall logo branding',
	'Networking meet',
	'1-1 connect',
	'Workshops access',
	'Lunch and high tea'
] as const;

export type StallBookingStatus = 'pending_payment' | 'payment_submitted' | 'paid' | 'rejected';

export const STALL_STATUS_LABEL: Record<StallBookingStatus, string> = {
	pending_payment: 'Awaiting payment',
	payment_submitted: 'Needs review',
	paid: 'Confirmed',
	rejected: 'Rejected'
};

export interface StallBookingInput {
	fullName: string;
	businessName: string;
	email: string;
	phone: string;
	/** Null: no preference. */
	preferredStall: number | null;
	stallTypeId: string;
	promoCode: string;
}

export const STALL_LIMITS = { fullName: 60, businessName: 80, email: 120 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type StallField = 'fullName' | 'businessName' | 'email' | 'phone' | 'preferredStall';

export function validateStallBooking(input: StallBookingInput): Partial<Record<StallField, string>> {
	const errors: Partial<Record<StallField, string>> = {};
	const name = input.fullName.trim();
	if (name.length < 2) errors.fullName = 'Enter your name.';
	else if (name.length > STALL_LIMITS.fullName) errors.fullName = `Keep it under ${STALL_LIMITS.fullName} characters.`;
	const business = input.businessName.trim();
	if (business.length < 2) errors.businessName = 'Enter your business name.';
	else if (business.length > STALL_LIMITS.businessName) errors.businessName = `Keep it under ${STALL_LIMITS.businessName} characters.`;
	const email = input.email.trim();
	if (!EMAIL.test(email) || email.length > STALL_LIMITS.email) errors.email = 'Enter a valid email address.';
	if (!normalisePhone(input.phone)) errors.phone = 'Enter a 10-digit Indian mobile number.';
	if (input.preferredStall !== null && !STALL_NUMBERS.includes(input.preferredStall)) {
		errors.preferredStall = 'Choose a stall number from the layout.';
	}
	return errors;
}

/* ---------- sponsors ---------- */

export interface SponsorTier {
	id: 'title' | 'powered-by' | 'associate';
	name: string;
	priceRupees: number;
	benefits: string[];
}

/** From the event poster. */
export const SPONSOR_TIERS: SponsorTier[] = [
	{
		id: 'title',
		name: 'Title Sponsor',
		priceRupees: 100000,
		benefits: [
			'Logo branding in poster',
			'LED wall logo branding',
			'LED wall video branding',
			'Lunch and high tea',
			'Complimentary stall',
			'Logo branding at venue',
			'Full page ad in conclave magazine',
			'Access to all meetings and workshops',
			'Sponsor recognition on stage'
		]
	},
	{
		id: 'powered-by',
		name: 'Powered By',
		priceRupees: 50000,
		benefits: [
			'Logo branding in poster',
			'LED wall logo branding',
			'Lunch and high tea',
			'Complimentary stall',
			'Logo branding at venue',
			'Half page ad in conclave magazine',
			'Access to all meetings and workshops'
		]
	},
	{
		id: 'associate',
		name: 'Associate Sponsor',
		priceRupees: 25000,
		benefits: [
			'Logo branding in poster',
			'LED wall logo branding',
			'Lunch and high tea',
			'Logo branding at venue',
			'Quarter page ad in conclave magazine',
			'Access to all meetings and workshops'
		]
	}
];

export type SponsorStatus = 'new' | 'contacted' | 'confirmed' | 'declined';
export const SPONSOR_STATUSES: SponsorStatus[] = ['new', 'contacted', 'confirmed', 'declined'];
export const SPONSOR_STATUS_LABEL: Record<SponsorStatus, string> = {
	new: 'New',
	contacted: 'Contacted',
	confirmed: 'Confirmed',
	declined: 'Declined'
};

export interface SponsorRequestInput {
	contactName: string;
	companyName: string;
	email: string;
	phone: string;
	tier: SponsorTier['id'];
	message: string;
}

export const SPONSOR_LIMITS = { contactName: 60, companyName: 80, email: 120, message: 600 } as const;

export type SponsorField = 'contactName' | 'companyName' | 'email' | 'phone' | 'tier' | 'message';

export function validateSponsorRequest(input: SponsorRequestInput): Partial<Record<SponsorField, string>> {
	const errors: Partial<Record<SponsorField, string>> = {};
	const name = input.contactName.trim();
	if (name.length < 2) errors.contactName = 'Enter your name.';
	else if (name.length > SPONSOR_LIMITS.contactName) errors.contactName = `Keep it under ${SPONSOR_LIMITS.contactName} characters.`;
	const company = input.companyName.trim();
	if (company.length < 2) errors.companyName = 'Enter your company name.';
	else if (company.length > SPONSOR_LIMITS.companyName) errors.companyName = `Keep it under ${SPONSOR_LIMITS.companyName} characters.`;
	const email = input.email.trim();
	if (!EMAIL.test(email) || email.length > SPONSOR_LIMITS.email) errors.email = 'Enter a valid email address.';
	if (!normalisePhone(input.phone)) errors.phone = 'Enter a 10-digit Indian mobile number.';
	if (!SPONSOR_TIERS.some((t) => t.id === input.tier)) errors.tier = 'Choose a sponsorship level.';
	if (input.message.trim().length > SPONSOR_LIMITS.message) errors.message = `Keep it under ${SPONSOR_LIMITS.message} characters.`;
	return errors;
}
