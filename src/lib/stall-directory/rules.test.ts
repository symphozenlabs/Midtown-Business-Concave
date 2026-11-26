import { describe, expect, it } from 'vitest';
import { STALL_NUMBERS } from '../stall-booking.ts';
import {
	FLOOR, STALL_SPOTS, byStall, canonicalStallDirectoryPath, delegateBlocker, movedStallDirectoryPath, exhibitorBlocker, matchesStall, stallSide,
	type DelegateFacts, type Exhibitor
} from './rules.ts';

describe('floor map', () => {
	it('places every stall on the layout, and nothing else', () => {
		expect(Object.keys(STALL_SPOTS).map(Number).sort((a, b) => a - b)).toEqual(STALL_NUMBERS);
	});
	it('keeps every spot inside the image', () => {
		for (const s of Object.values(STALL_SPOTS)) {
			expect(s.x).toBeGreaterThanOrEqual(0);
			expect(s.y).toBeGreaterThanOrEqual(0);
			expect(s.x + s.w).toBeLessThanOrEqual(FLOOR.width);
			expect(s.y + s.h).toBeLessThanOrEqual(FLOOR.height);
		}
	});
	it('never overlaps two stalls', () => {
		const spots = Object.entries(STALL_SPOTS);
		for (const [i, [n, a]] of spots.entries()) {
			for (const [m, b] of spots.slice(i + 1)) {
				const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
				expect(apart, `stalls ${n} and ${m}`).toBe(true);
			}
		}
	});
	it('knows which wall a stall is on', () => {
		expect(stallSide(1)).toBe('front');
		expect(stallSide(18)).toBe('left');
		expect(stallSide(39)).toBe('back');
		expect(stallSide(25)).toBeNull();
	});
});

const ex = (patch: Partial<Exhibitor>): Exhibitor => ({
	id: 'x',
	businessName: 'Salem Silks',
	contactName: 'Priya Raman',
	stall: 12,
	stallType: 'Standard stall',
	...patch
});

describe('search and order', () => {
	it('matches business or contact name, any case', () => {
		expect(matchesStall(ex({}), 'silk')).toBe(true);
		expect(matchesStall(ex({}), 'PRIYA')).toBe(true);
		expect(matchesStall(ex({}), 'cotton')).toBe(false);
		expect(matchesStall(ex({}), '  ')).toBe(true);
	});
	it('matches a stall number exactly', () => {
		expect(matchesStall(ex({}), '12')).toBe(true);
		expect(matchesStall(ex({}), 'Stall 12')).toBe(true);
		expect(matchesStall(ex({}), '#12')).toBe(true);
		expect(matchesStall(ex({}), '1')).toBe(false);
		expect(matchesStall(ex({ stall: null }), '12')).toBe(false);
	});
	it('lists by stall number, unallotted last, then by name', () => {
		const list = [ex({ id: 'c', stall: null, businessName: 'A' }), ex({ id: 'b', stall: 3 }), ex({ id: 'a', stall: 1 })];
		expect(list.sort(byStall).map((e) => e.id)).toEqual(['a', 'b', 'c']);
	});
});

const me = { messagesOff: false, adminMessagesOff: false, startedToday: 0 };
const base: DelegateFacts = { closed: false, me, stall: { blockedMe: false }, conversation: null };
const f = (patch: Partial<DelegateFacts>): DelegateFacts => ({ ...base, ...patch });

describe('delegateBlocker', () => {
	it('lets a delegate write to a stall', () => expect(delegateBlocker(base)).toBeNull());
	it('stops once closed', () => expect(delegateBlocker(f({ closed: true }))).toBe('closed'));
	it('honours the organiser and own switches', () => {
		expect(delegateBlocker(f({ me: { ...me, adminMessagesOff: true, messagesOff: true } }))).toBe('admin-off');
		expect(delegateBlocker(f({ me: { ...me, messagesOff: true } }))).toBe('self-off');
	});
	it('shows a block as not taking messages', () => {
		expect(delegateBlocker(f({ stall: { blockedMe: true } }))).toBe('unavailable');
		expect(delegateBlocker(f({ stall: null }))).toBe('unavailable');
	});
	it('limits new conversations per day', () =>
		expect(delegateBlocker(f({ me: { ...me, startedToday: 30 } }))).toBe('daily-limit'));
	it('waits for a reply after three unanswered messages', () => {
		expect(delegateBlocker(f({ conversation: { mySent: 3, theirSent: 0 } }))).toBe('wait-for-reply');
		expect(delegateBlocker(f({ conversation: { mySent: 3, theirSent: 1 } }))).toBeNull();
		expect(delegateBlocker(f({ me: { ...me, startedToday: 30 }, conversation: { mySent: 1, theirSent: 0 } }))).toBeNull();
	});
});

describe('exhibitorBlocker', () => {
	const ok = { closed: false, iBlocked: false, delegate: { messagesOff: false, adminMessagesOff: false } };
	it('lets the exhibitor reply', () => expect(exhibitorBlocker(ok)).toBeNull());
	it('stops after closing, when blocked, or when the delegate is gone or off', () => {
		expect(exhibitorBlocker({ ...ok, closed: true })).toBe('closed');
		expect(exhibitorBlocker({ ...ok, iBlocked: true })).toBe('you-blocked');
		expect(exhibitorBlocker({ ...ok, delegate: null })).toBe('unavailable');
		expect(exhibitorBlocker({ ...ok, delegate: { messagesOff: true, adminMessagesOff: false } })).toBe('unavailable');
	});
});

describe('canonicalStallDirectoryPath', () => {
	it('fixes the casing', () => {
		expect(canonicalStallDirectoryPath('/stalldirectory')).toBe('/stallDirectory');
		expect(canonicalStallDirectoryPath('/STALLDIRECTORY/exhibitor')).toBe('/stallDirectory/exhibitor');
	});
	it('leaves the right path and others alone', () => {
		expect(canonicalStallDirectoryPath('/stallDirectory')).toBeNull();
		expect(canonicalStallDirectoryPath('/stallDirectoryX')).toBeNull();
		expect(canonicalStallDirectoryPath('/stalls')).toBeNull();
	});
});

describe('movedStallDirectoryPath', () => {
	const id = '0b6c3c7e-2f4a-4d8e-9a51-6f1e2d3c4b5a';
	it('sends the old directory to the stalls tab', () => {
		expect(movedStallDirectoryPath('/stallDirectory')).toBe('/visitorDirectory?tab=stalls');
		expect(movedStallDirectoryPath('/stallDirectory/')).toBe('/visitorDirectory?tab=stalls');
	});
	it('sends a stall page to its new place', () => {
		expect(movedStallDirectoryPath(`/stallDirectory/${id}`)).toBe(`/visitorDirectory/stalls/${id}`);
	});
	it('leaves the exhibitor area and the cards alone', () => {
		expect(movedStallDirectoryPath('/stallDirectory/exhibitor')).toBeNull();
		expect(movedStallDirectoryPath('/stallDirectory/exhibitor/stalls')).toBeNull();
		expect(movedStallDirectoryPath('/stallDirectory/card/abc.def')).toBeNull();
	});
});
