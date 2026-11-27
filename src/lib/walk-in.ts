import { formatRupees, isTicketType, normaliseUtr, type TicketType } from './payment.ts';

/*
 * Walk-ins: passes the organisers make at the help desk for someone who registers on
 * the day. Only what the name-and-QR label prints is asked, plus what they paid: no
 * email, phone, photo or "I am attending" poster, and no ticket email.
 */

/** The longest each field may be: the registrations table's own limits. */
export const WALK_IN_LIMITS = { fullName: 40, designation: 40, companyName: 44 } as const;

export interface WalkInInput {
	fullName: string;
	designation: string;
	companyName: string;
	ticketType: TicketType;
	/** What the desk received: from 0 (complimentary) up to the ticket's price. */
	amountRupees: number;
	/** The 12-digit UPI reference of the payment, or null for cash or a complimentary pass. */
	upiTxnId: string | null;
}

export type WalkInErrors = Partial<Record<keyof WalkInInput, string>>;

const LABEL = { fullName: 'Name', designation: 'Designation', companyName: 'Company' } as const;

/** Spaces tidied: no leading or trailing ones, and runs of them made single. */
const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Reads the walk-in form and checks every field: the text fits the registrations table,
 * the amount is between 0 and the chosen ticket's price, and a UPI reference is 12 digits.
 */
export function readWalkIn(
	raw: Record<keyof WalkInInput, unknown>,
	prices: Record<TicketType, number>
): { ok: true; input: WalkInInput } | { ok: false; errors: WalkInErrors } {
	const errors: WalkInErrors = {};
	const text = {} as Record<keyof typeof WALK_IN_LIMITS, string>;
	for (const field of Object.keys(WALK_IN_LIMITS) as (keyof typeof WALK_IN_LIMITS)[]) {
		const value = tidy(raw[field]);
		const max = WALK_IN_LIMITS[field];
		if (value.length < 2) errors[field] = `Enter the ${LABEL[field].toLowerCase()}.`;
		else if (value.length > max) errors[field] = `${LABEL[field]} can be at most ${max} characters.`;
		text[field] = value;
	}

	const ticketType = raw.ticketType;
	if (!isTicketType(ticketType)) errors.ticketType = 'Choose Delegate or Visitor.';

	const amountText = tidy(raw.amountRupees).replace(/[₹,\s]/g, '');
	const amount = amountText ? Number(amountText) : Number.NaN;
	if (!Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100) {
		errors.amountRupees = 'Enter the amount received in rupees, or 0 for a complimentary pass.';
	} else if (isTicketType(ticketType) && amount > prices[ticketType]) {
		errors.amountRupees = `The ${ticketType} ticket costs ${formatRupees(prices[ticketType])}. Enter that or less.`;
	}

	const upiText = tidy(raw.upiTxnId);
	const upiTxnId = upiText ? normaliseUtr(upiText) : null;
	if (upiText && !upiTxnId) errors.upiTxnId = 'A UPI reference ID is 12 digits. Leave it empty for cash.';

	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, input: { ...text, ticketType: ticketType as TicketType, amountRupees: amount, upiTxnId } };
}
