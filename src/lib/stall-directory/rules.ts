/**
 * Stall directory: the floor map and who may message whom. Plain functions with no
 * server or SvelteKit imports, so they run in unit tests and in the browser alike.
 *
 * The stalls are a tab of the visitors directory, so only signed-in delegates (the
 * "Open my pass" cookie) see them and can message a confirmed stall. The exhibitor
 * answers from their area under /stallDirectory/exhibitor after signing in with the
 * email they booked with and their mobile number. Exhibitors only reply: they can't
 * start conversations.
 */

import { DIRECTORY_PATH, NEW_CONVERSATIONS_PER_DAY, UNANSWERED_LIMIT } from '../directory/rules.ts';

/** The exhibitor area and the stall QR cards live under this path. There is no public page at it. */
export const STALL_DIRECTORY_PATH = '/stallDirectory';

/** The stalls tab of the visitors directory. */
export const STALLS_TAB_PATH = `${DIRECTORY_PATH}?tab=stalls`;

/** A stall's page in the visitors directory, where a delegate messages it. */
export const stallPagePath = (bookingId: string) => `${DIRECTORY_PATH}/stalls/${bookingId}`;

/* ---------- floor map ---------- */

/** static/floor/stall-layout.jpg, in pixels. */
export const FLOOR = { src: '/floor/stall-layout.jpg', width: 1491, height: 1055 } as const;

export interface Spot {
	x: number;
	y: number;
	w: number;
	h: number;
}

const TOP: Record<number, number> = {
	22: 165, 23: 237, 24: 310, 26: 384, 27: 458, 28: 532, 29: 606, 30: 680,
	31: 755, 32: 829, 33: 903, 34: 978, 36: 1052, 37: 1128, 38: 1204, 39: 1279
};
const LEFT: Record<number, [number, number]> = {
	21: [100, 246], 20: [91, 330], 19: [83, 414], 18: [74, 500], 17: [66, 588], 16: [58, 678]
};
const BOTTOM: Record<number, number> = {
	15: 80, 14: 157, 13: 233, 12: 312, 11: 389, 10: 466, 9: 545, 8: 624, 7: 703,
	6: 996, 5: 1080, 4: 1163, 3: 1247, 2: 1335, 1: 1419
};

/** Where each stall sits on the floor image, measured from the number printed on it. */
export const STALL_SPOTS: Record<number, Spot> = Object.fromEntries([
	...Object.entries(TOP).map(([n, x]) => [Number(n), { x: x - 36, y: 88, w: 72, h: 106 }]),
	...Object.entries(LEFT).map(([n, [x, y]]) => [Number(n), { x: x - 44, y: y - 18, w: 86, h: 84 }]),
	...Object.entries(BOTTOM).map(([n, x]) => [Number(n), { x: x - 37, y: 795, w: 74, h: 118 }])
]);

/** The three walls, for "Top wall, facing the entry" style directions. */
export function stallSide(n: number): 'back' | 'left' | 'front' | null {
	if (n in TOP) return 'back';
	if (n in LEFT) return 'left';
	if (n in BOTTOM) return 'front';
	return null;
}

export const SIDE_LABEL = {
	back: 'Back wall, opposite the entry',
	left: 'Left wall, by the one-to-one meeting zone',
	front: 'Front wall, beside the entry'
} as const;

/* ---------- what the directory shows ---------- */

/** A confirmed stall as anyone may see it: never the exhibitor's phone or email. */
export interface Exhibitor {
	/** The stall booking id. */
	id: string;
	businessName: string;
	contactName: string;
	/** null until the organisers allot one. */
	stall: number | null;
	stallType: string;
}

/** Stall number first (unallotted last), then business name. */
export function byStall(a: Exhibitor, b: Exhibitor): number {
	if (a.stall !== b.stall) return (a.stall ?? Infinity) - (b.stall ?? Infinity);
	return a.businessName.localeCompare(b.businessName, 'en', { sensitivity: 'base' });
}

/** Matches business, contact name or stall number ("12", "stall 12", "no. 12"). */
export function matchesStall(e: Exhibitor, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const number = q.match(/^(?:stall\s*|no\.?\s*|#)?(\d{1,2})$/);
	if (number) return e.stall === Number(number[1]);
	return e.businessName.toLowerCase().includes(q) || e.contactName.toLowerCase().includes(q);
}

/* ---------- who may message whom ---------- */

export type StallBlocker = 'closed' | 'admin-off' | 'self-off' | 'you-blocked' | 'unavailable' | 'daily-limit' | 'wait-for-reply';

/** A delegate writing to a stall. */
export interface DelegateFacts {
	closed: boolean;
	me: { messagesOff: boolean; adminMessagesOff: boolean; startedToday: number };
	/** null: no such confirmed stall. */
	stall: { blockedMe: boolean } | null;
	/** null: no conversation yet. */
	conversation: { mySent: number; theirSent: number } | null;
}

/** Why the delegate can't write to this stall now, or null. Being blocked reads as "not taking messages". */
export function delegateBlocker(f: DelegateFacts): StallBlocker | null {
	if (f.closed) return 'closed';
	if (f.me.adminMessagesOff) return 'admin-off';
	if (f.me.messagesOff) return 'self-off';
	if (!f.stall || f.stall.blockedMe) return 'unavailable';
	if (!f.conversation) return f.me.startedToday >= NEW_CONVERSATIONS_PER_DAY ? 'daily-limit' : null;
	if (f.conversation.theirSent === 0 && f.conversation.mySent >= UNANSWERED_LIMIT) return 'wait-for-reply';
	return null;
}

/** An exhibitor replying to a delegate who wrote to their stall. */
export interface ExhibitorFacts {
	closed: boolean;
	iBlocked: boolean;
	/** null: the delegate is no longer a paid registration. */
	delegate: { messagesOff: boolean; adminMessagesOff: boolean } | null;
}

export function exhibitorBlocker(f: ExhibitorFacts): StallBlocker | null {
	if (f.closed) return 'closed';
	if (f.iBlocked) return 'you-blocked';
	if (!f.delegate || f.delegate.messagesOff || f.delegate.adminMessagesOff) return 'unavailable';
	return null;
}

export const STALL_BLOCKER_TEXT: Record<StallBlocker, string> = {
	closed: 'Messaging has closed. Thank you for joining us.',
	'admin-off': 'Messaging has been turned off for your pass. Speak to the registration desk.',
	'self-off': 'You’ve turned messages off. Turn them back on in My pass to send and receive messages.',
	'you-blocked': 'You blocked this delegate. Unblock them to reply.',
	unavailable: 'Not taking messages.',
	'daily-limit': `You’ve started ${NEW_CONVERSATIONS_PER_DAY} conversations today. You can start more tomorrow.`,
	'wait-for-reply': 'You can send more once they reply.'
};

/** The printed path with the right casing, when someone typed it differently. */
export function canonicalStallDirectoryPath(pathname: string): string | null {
	const match = pathname.match(/^\/stalldirectory(\/.*)?$/i);
	if (!match || pathname.startsWith(STALL_DIRECTORY_PATH)) return null;
	return STALL_DIRECTORY_PATH + (match[1] ?? '');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The old public stall directory moved into the visitors directory. Links already sent
 * (emails, pushes, bookmarks) to /stallDirectory or a stall's page land on the new place.
 * The exhibitor area and the stall cards stay where they are.
 */
export function movedStallDirectoryPath(pathname: string): string | null {
	if (pathname === STALL_DIRECTORY_PATH || pathname === `${STALL_DIRECTORY_PATH}/`) return STALLS_TAB_PATH;
	const id = pathname.slice(STALL_DIRECTORY_PATH.length + 1);
	if (pathname.startsWith(`${STALL_DIRECTORY_PATH}/`) && UUID.test(id)) return stallPagePath(id);
	return null;
}
