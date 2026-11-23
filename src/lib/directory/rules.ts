/**
 * Visitors directory: who may message whom, and the limits around it.
 * Plain functions with no server or SvelteKit imports, so they run in unit tests
 * and in the browser alike.
 */

/** Printed on the visitor card's QR; it must never change. */
export const DIRECTORY_PATH = '/visitorDirectory';
export const MESSAGE_MAX = 1000;
/** Messages a delegate may send before the other person replies. */
export const UNANSWERED_LIMIT = 3;
export const NEW_CONVERSATIONS_PER_DAY = 30;
export const PURGE_AFTER_DAYS = 30;

/* ---------- settings (the "directory" row in settings) ---------- */

export interface DirectorySettings {
	/** ISO 8601 instant; the directory and messaging close after it. */
	closesAt: string;
	/** Backup emails per India day; 0 turns them off. */
	emailCapPerDay: number;
	/** Shows "Turn on notifications" and sends pushes. Off until proven on real phones. */
	pushEnabled: boolean;
}

export const DEFAULT_DIRECTORY_SETTINGS: DirectorySettings = {
	closesAt: '2026-12-12T23:59:59+05:30',
	emailCapPerDay: 50,
	pushEnabled: false
};

const EMAIL_CAP_MAX = 1000;

/** Keeps each valid field and defaults the rest, so a bad edit can't break the page. */
export function parseDirectorySettings(value: unknown): DirectorySettings {
	const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof DirectorySettings, unknown>>;
	const d = DEFAULT_DIRECTORY_SETTINGS;
	const closesAt = typeof v.closesAt === 'string' && !Number.isNaN(Date.parse(v.closesAt)) ? v.closesAt : d.closesAt;
	const cap = typeof v.emailCapPerDay === 'number' && Number.isFinite(v.emailCapPerDay)
		? Math.min(EMAIL_CAP_MAX, Math.max(0, Math.round(v.emailCapPerDay)))
		: d.emailCapPerDay;
	const pushEnabled = typeof v.pushEnabled === 'boolean' ? v.pushEnabled : d.pushEnabled;
	return { closesAt, emailCapPerDay: cap, pushEnabled };
}

/* ---------- who may message whom ---------- */

export type Blocker = 'closed' | 'admin-off' | 'self-off' | 'you-blocked' | 'unavailable' | 'daily-limit' | 'wait-for-reply';

export interface PersonFacts {
	paid: boolean;
	hidden: boolean;
	adminHidden: boolean;
	messagesOff: boolean;
	adminMessagesOff: boolean;
}

export interface MessageFacts {
	closed: boolean;
	me: { messagesOff: boolean; adminMessagesOff: boolean; startedToday: number };
	/** null: no such registration. */
	other: PersonFacts | null;
	iBlocked: boolean;
	theyBlocked: boolean;
	/** null: no conversation yet. */
	conversation: { mySent: number; theirSent: number } | null;
}

/**
 * Why I can't send to this person right now, or null when I can. Being blocked
 * reads exactly like the other person having turned messages off.
 */
export function messageBlocker(f: MessageFacts): Blocker | null {
	if (f.closed) return 'closed';
	if (f.me.adminMessagesOff) return 'admin-off';
	if (f.me.messagesOff) return 'self-off';
	const other = f.other;
	if (!other || !other.paid) return 'unavailable';
	if (f.iBlocked) return 'you-blocked';
	if (f.theyBlocked || other.messagesOff || other.adminMessagesOff) return 'unavailable';
	if (!f.conversation) {
		if (other.hidden || other.adminHidden) return 'unavailable';
		if (f.me.startedToday >= NEW_CONVERSATIONS_PER_DAY) return 'daily-limit';
		return null;
	}
	if (f.conversation.theirSent === 0 && f.conversation.mySent >= UNANSWERED_LIMIT) return 'wait-for-reply';
	return null;
}

export const BLOCKER_TEXT: Record<Blocker, string> = {
	closed: 'The visitors directory has closed. Thank you for joining us.',
	'admin-off': 'Messaging has been turned off for your pass. Speak to the registration desk.',
	'self-off': 'You’ve turned messages off. Turn them back on in My pass to send and receive messages.',
	'you-blocked': 'You blocked this person. Unblock them to send a message.',
	unavailable: 'Not taking messages.',
	'daily-limit': `You’ve started ${NEW_CONVERSATIONS_PER_DAY} conversations today. You can start more tomorrow.`,
	'wait-for-reply': 'You can send more once they reply.'
};

/* ---------- messages ---------- */

/** The text to store, or null when it is empty or too long. */
export function cleanBody(raw: string): string | null {
	const body = raw.replace(/\r\n?/g, '\n').trim();
	return body.length >= 1 && body.length <= MESSAGE_MAX ? body : null;
}

const DUPLICATE_WINDOW_MS = 10_000;

/** A double tap or a retried post on patchy Wi-Fi: the same text again within 10 seconds. */
export function isDuplicateSend(last: { body: string; at: string } | null, body: string, now: Date): boolean {
	if (!last || last.body !== body) return false;
	return now.getTime() - Date.parse(last.at) <= DUPLICATE_WINDOW_MS;
}

/**
 * One backup email per conversation until the recipient has opened it. sendMessage()
 * applies this same rule inside its database statement, so it holds under concurrent
 * sends; keep the two in step.
 */
export function shouldEmail(s: { emailedAt: Date | null; readAt: Date | null }): boolean {
	if (!s.emailedAt) return true;
	return s.readAt !== null && s.readAt.getTime() >= s.emailedAt.getTime();
}

/* ---------- dates ---------- */

const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' in India. */
export function indiaDay(now: Date): string {
	return indiaDate.format(now);
}

export function isClosed(now: Date, closesAt: string): boolean {
	return now.getTime() > Date.parse(closesAt);
}

export function purgeDue(now: Date, closesAt: string): boolean {
	return now.getTime() > Date.parse(closesAt) + PURGE_AFTER_DAYS * 86_400_000;
}

/* ---------- links ---------- */

/** A same-site path to return to after signing in, or null. */
export function safeNext(next: string | null | undefined): string | null {
	if (!next || next.length > 300) return null;
	if (!next.startsWith('/') || next.startsWith('//')) return null;
	// Backslashes and control characters can turn a path into another host in some browsers.
	if (/[\\\u0000-\u001f\u007f]/.test(next)) return null;
	return next;
}

/** The printed URL with the right casing, when someone typed it differently. */
export function canonicalDirectoryPath(pathname: string): string | null {
	const match = pathname.match(/^\/visitordirectory(\/.*)?$/i);
	if (!match || pathname.startsWith(DIRECTORY_PATH)) return null;
	return DIRECTORY_PATH + (match[1] ?? '');
}

/* ---------- polling and search ---------- */

const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 30_000;
const QUIET_AFTER_MS = 120_000;

/** How long to wait before asking the server for news again. */
export function pollDelay(s: { inConversation: boolean; quietMs: number }): number {
	return s.inConversation && s.quietMs < QUIET_AFTER_MS ? FAST_POLL_MS : SLOW_POLL_MS;
}

export function matchesSearch(p: { fullName: string; companyName: string }, query: string): boolean {
	const q = query.trim().toLowerCase();
	return !q || p.fullName.toLowerCase().includes(q) || p.companyName.toLowerCase().includes(q);
}
