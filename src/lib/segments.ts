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
