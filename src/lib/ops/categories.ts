/**
 * The six desks a handler can be assigned to. The code is the URL segment
 * (/handler/gate) and the value stored in handler_assignments.category.
 */
export type Category = 'ticket' | 'gate' | 'hall' | 'food' | 'certificate' | 'networking';

export interface CategoryInfo {
	code: Category;
	label: string;
	/** Upper-case heading on the handler's dashboard. */
	title: string;
	description: string;
}

export const CATEGORIES: CategoryInfo[] = [
	{
		code: 'ticket',
		label: 'Ticket validation',
		title: 'TICKET VALIDATION',
		description: 'Check registration, payment and approval. Changes nothing.'
	},
	{ code: 'gate', label: 'Gate check-in', title: 'GATE CHECK-IN', description: 'Record each delegate’s entry once.' },
	{
		code: 'hall',
		label: 'Hall attendance',
		title: 'HALL ATTENDANCE',
		description: 'Record attendance for a hall or session.'
	},
	{
		code: 'food',
		label: 'Food redemption',
		title: 'FOOD REDEMPTION',
		description: 'Serve each meal once per delegate.'
	},
	{
		code: 'certificate',
		label: 'Certificates',
		title: 'CERTIFICATES',
		description: 'Check eligibility, issue and verify certificates.'
	},
	{
		code: 'networking',
		label: 'Networking',
		title: 'NETWORKING',
		description: 'Show professional profiles and introduce delegates.'
	}
];

export const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

export function isCategory(value: unknown): value is Category {
	return typeof value === 'string' && (CATEGORY_CODES as string[]).includes(value);
}

export function categoryInfo(code: Category): CategoryInfo {
	return CATEGORIES.find((c) => c.code === code)!;
}

/** What one scan comes back as, on every desk. */
export type Outcome = 'success' | 'warning' | 'error';

export interface ScanParticipant {
	name: string;
	code: string;
	designation: string;
	company: string;
}

export interface ScanResult {
	outcome: Outcome;
	/** Machine code, e.g. ENTRY_OK, ALREADY_CHECKED_IN, INVALID_PASS. */
	code: string;
	/** Large heading: ENTRY SUCCESSFUL. */
	title: string;
	/** One short line under it. */
	message: string;
	participant?: ScanParticipant;
	/** Label/value pairs for the result card (Entry time, Hall, Meal…). */
	facts?: { label: string; value: string }[];
	/** ISO time of the transaction this result describes. */
	at?: string;
	/** Desk-specific extras (certificate number, eligibility checklist, profile). */
	extra?: Record<string, unknown>;
}
