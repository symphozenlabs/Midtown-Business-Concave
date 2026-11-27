import { isTicketType, type TicketType } from './payment.ts';

/*
 * Walk-ins: passes the organisers make at the help desk for someone who registers on
 * the day. Only what the name-and-QR label prints is asked: no email, phone, photo or
 * "I am attending" poster, and no ticket email.
 */

/** The longest each field may be: the registrations table's own limits. */
export const WALK_IN_LIMITS = { fullName: 40, designation: 40, companyName: 44 } as const;

export interface WalkInInput {
	fullName: string;
	designation: string;
	companyName: string;
	ticketType: TicketType;
}

export type WalkInErrors = Partial<Record<keyof WalkInInput, string>>;

const LABEL = { fullName: 'Name', designation: 'Designation', companyName: 'Company' } as const;

/** Spaces tidied: no leading or trailing ones, and runs of them made single. */
const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Reads the walk-in form and checks every field fits the registrations table. */
export function readWalkIn(raw: Record<keyof WalkInInput, unknown>): { ok: true; input: WalkInInput } | { ok: false; errors: WalkInErrors } {
	const errors: WalkInErrors = {};
	const text = {} as Record<keyof typeof WALK_IN_LIMITS, string>;
	for (const field of Object.keys(WALK_IN_LIMITS) as (keyof typeof WALK_IN_LIMITS)[]) {
		const value = tidy(raw[field]);
		const max = WALK_IN_LIMITS[field];
		if (value.length < 2) errors[field] = `Enter the ${LABEL[field].toLowerCase()}.`;
		else if (value.length > max) errors[field] = `${LABEL[field]} can be at most ${max} characters.`;
		text[field] = value;
	}
	if (!isTicketType(raw.ticketType)) errors.ticketType = 'Choose Delegate or Visitor.';
	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, input: { ...text, ticketType: raw.ticketType as TicketType } };
}
