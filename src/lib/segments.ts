/** Ways to slice the Participants table on the organiser dashboard. */
export type Segment = 'all' | 'delegate' | 'visitor' | 'online' | 'walk_in' | 'complimentary';

export const SEGMENTS: { value: Segment; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'delegate', label: 'Delegate' },
	{ value: 'visitor', label: 'Visitor' },
	{ value: 'online', label: 'Registered online' },
	{ value: 'walk_in', label: 'Walk-in' },
	{ value: 'complimentary', label: 'Complimentary' }
];

export const isSegment = (v: unknown): v is Segment => SEGMENTS.some((s) => s.value === v);

/** Same rule as the table's "Complimentary" label: a walk-in pass given for free. */
export function inSegment(r: { ticketType: string; walkIn: boolean; amountRupees: number }, segment: Segment): boolean {
	switch (segment) {
		case 'delegate':
		case 'visitor':
			return r.ticketType === segment;
		case 'online':
			return !r.walkIn;
		case 'walk_in':
			return r.walkIn;
		case 'complimentary':
			return r.walkIn && r.amountRupees === 0;
		default:
			return true;
	}
}

/** The Email column: an address on file, or none (walk-ins). */
export type ContactFilter = 'all' | 'has' | 'none';
export const CONTACT_FILTERS: { value: ContactFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'has', label: 'Has email' },
	{ value: 'none', label: 'No email' }
];

/** The UPI transaction ID column, as the table words it. */
export type UpiFilter = 'all' | 'upi' | 'voucher' | 'complimentary' | 'desk' | 'missing';
export const UPI_FILTERS: { value: UpiFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'upi', label: 'Has UPI ID' },
	{ value: 'missing', label: 'No UPI ID yet' },
	{ value: 'desk', label: 'Paid at the desk' },
	{ value: 'complimentary', label: 'Complimentary' },
	{ value: 'voucher', label: 'Free (voucher)' }
];

export const isContactFilter = (v: unknown): v is ContactFilter => CONTACT_FILTERS.some((f) => f.value === v);
export const isUpiFilter = (v: unknown): v is UpiFilter => UPI_FILTERS.some((f) => f.value === v);

interface ColumnRow {
	email: string;
	upiTxnId: string | null;
	voucherCode: string | null;
	walkIn: boolean;
	amountRupees: number;
}

/** Which UPI wording a row gets: the same order of checks as the table cell. */
export function upiStateOf(r: ColumnRow): Exclude<UpiFilter, 'all'> {
	if (r.upiTxnId) return 'upi';
	if (r.voucherCode && r.amountRupees === 0) return 'voucher';
	if (r.walkIn) return r.amountRupees === 0 ? 'complimentary' : 'desk';
	return 'missing';
}

export function matchesColumns(
	r: ColumnRow,
	f: { contact?: ContactFilter; upi?: UpiFilter; amount?: number | null }
): boolean {
	if (f.contact === 'has' && !r.email) return false;
	if (f.contact === 'none' && r.email) return false;
	if (f.upi && f.upi !== 'all' && upiStateOf(r) !== f.upi) return false;
	if (f.amount != null && r.amountRupees !== f.amount) return false;
	return true;
}
