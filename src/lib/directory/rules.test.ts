import { describe, expect, it } from 'vitest';
import {
	BLOCKER_TEXT, DEFAULT_DIRECTORY_SETTINGS, canonicalDirectoryPath, cleanBody, indiaDay, isClosed, isDuplicateSend,
	matchesSearch, messageBlocker, parseDirectorySettings, pollDelay, purgeDue, safeNext, shouldEmail, type MessageFacts
} from './rules.ts';

const person = { paid: true, hidden: false, adminHidden: false, messagesOff: false, adminMessagesOff: false };
const me = { messagesOff: false, adminMessagesOff: false, startedToday: 0 };
const base: MessageFacts = { closed: false, me, other: person, iBlocked: false, theyBlocked: false, conversation: null };
const f = (patch: Partial<MessageFacts>): MessageFacts => ({ ...base, ...patch });

describe('messageBlocker', () => {
	it('lets a paid delegate start a conversation', () => expect(messageBlocker(base)).toBeNull());
	it('stops everything once closed', () => expect(messageBlocker(f({ closed: true }))).toBe('closed'));
	it('puts the organiser switch before the delegate’s own', () =>
		expect(messageBlocker(f({ me: { ...me, messagesOff: true, adminMessagesOff: true } }))).toBe('admin-off'));
	it('stops sending when I turned messages off', () =>
		expect(messageBlocker(f({ me: { ...me, messagesOff: true } }))).toBe('self-off'));
	it('treats unknown and unpaid people as unavailable', () => {
		expect(messageBlocker(f({ other: null }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, paid: false } }))).toBe('unavailable');
	});
	it('tells the blocker they blocked this person', () => expect(messageBlocker(f({ iBlocked: true }))).toBe('you-blocked'));
	it('shows being blocked exactly like messages off', () => {
		expect(messageBlocker(f({ theyBlocked: true }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, messagesOff: true } }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, adminMessagesOff: true } }))).toBe('unavailable');
	});
	it('makes existing conversations read-only when the other side is off', () =>
		expect(messageBlocker(f({ other: { ...person, messagesOff: true }, conversation: { mySent: 1, theirSent: 1 } }))).toBe('unavailable'));
	it('lets nobody start with a hidden person, but lets them get replies', () => {
		expect(messageBlocker(f({ other: { ...person, hidden: true } }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, adminHidden: true } }))).toBe('unavailable');
		expect(messageBlocker(f({ other: { ...person, hidden: true }, conversation: { mySent: 0, theirSent: 1 } }))).toBeNull();
	});
	it('allows 30 new conversations a day, and replies beyond that', () => {
		expect(messageBlocker(f({ me: { ...me, startedToday: 29 } }))).toBeNull();
		expect(messageBlocker(f({ me: { ...me, startedToday: 30 } }))).toBe('daily-limit');
		expect(messageBlocker(f({ me: { ...me, startedToday: 30 }, conversation: { mySent: 1, theirSent: 1 } }))).toBeNull();
	});
	it('allows 3 messages until the other person replies', () => {
		expect(messageBlocker(f({ conversation: { mySent: 2, theirSent: 0 } }))).toBeNull();
		expect(messageBlocker(f({ conversation: { mySent: 3, theirSent: 0 } }))).toBe('wait-for-reply');
		expect(messageBlocker(f({ conversation: { mySent: 9, theirSent: 1 } }))).toBeNull();
	});
	it('uses the organiser’s wording for admin-off', () =>
		expect(BLOCKER_TEXT['admin-off']).toBe('Messaging has been turned off for your pass. Speak to the registration desk.'));
});

describe('cleanBody', () => {
	it('trims and keeps line breaks', () => expect(cleanBody('  hi\r\nthere  ')).toBe('hi\nthere'));
	it('rejects empty text', () => expect(cleanBody(' \n ')).toBeNull());
	it('accepts 1000 characters and rejects 1001', () => {
		expect(cleanBody('a'.repeat(1000))).toBe('a'.repeat(1000));
		expect(cleanBody('a'.repeat(1001))).toBeNull();
	});
	it('accepts 1000 Tamil letters', () => expect(cleanBody('அ'.repeat(1000))).not.toBeNull());
});

describe('isDuplicateSend', () => {
	const now = new Date('2026-11-28T10:00:10Z');
	it('catches the same text within 10 seconds', () =>
		expect(isDuplicateSend({ body: 'Hello', at: '2026-11-28T10:00:02Z' }, 'Hello', now)).toBe(true));
	it('allows the same text later, or different text', () => {
		expect(isDuplicateSend({ body: 'Hello', at: '2026-11-28T09:59:59Z' }, 'Hello', now)).toBe(false);
		expect(isDuplicateSend({ body: 'Hello', at: '2026-11-28T10:00:09Z' }, 'Hi', now)).toBe(false);
		expect(isDuplicateSend(null, 'Hello', now)).toBe(false);
	});
});

describe('shouldEmail', () => {
	const t = (s: string) => new Date(`2026-11-28T${s}:00Z`);
	it('emails the first time', () => expect(shouldEmail({ emailedAt: null, readAt: null })).toBe(true));
	it('waits while an emailed message is unread', () => {
		expect(shouldEmail({ emailedAt: t('10:00'), readAt: null })).toBe(false);
		expect(shouldEmail({ emailedAt: t('10:00'), readAt: t('09:00') })).toBe(false);
	});
	it('emails again once they have read it', () => expect(shouldEmail({ emailedAt: t('10:00'), readAt: t('10:05') })).toBe(true));
});

describe('dates', () => {
	it('counts days in India time', () => {
		expect(indiaDay(new Date('2026-11-27T18:29:59Z'))).toBe('2026-11-27');
		expect(indiaDay(new Date('2026-11-27T18:30:00Z'))).toBe('2026-11-28');
	});
	it('closes after the end of 12 December in India', () => {
		const closes = DEFAULT_DIRECTORY_SETTINGS.closesAt;
		expect(isClosed(new Date('2026-12-12T18:29:58Z'), closes)).toBe(false);
		expect(isClosed(new Date('2026-12-12T18:30:00Z'), closes)).toBe(true);
	});
	it('purges 30 days after closing', () => {
		const closes = DEFAULT_DIRECTORY_SETTINGS.closesAt;
		expect(purgeDue(new Date('2027-01-11T18:29:00Z'), closes)).toBe(false);
		expect(purgeDue(new Date('2027-01-11T18:31:00Z'), closes)).toBe(true);
	});
});

describe('parseDirectorySettings', () => {
	it('defaults everything when missing', () => expect(parseDirectorySettings(undefined)).toEqual(DEFAULT_DIRECTORY_SETTINGS));
	it('keeps valid fields and repairs bad ones', () =>
		expect(parseDirectorySettings({ closesAt: 'soon', emailCapPerDay: 2000.7, pushEnabled: true })).toEqual({
			closesAt: DEFAULT_DIRECTORY_SETTINGS.closesAt,
			emailCapPerDay: 1000,
			pushEnabled: true
		}));
});

describe('safeNext', () => {
	it('keeps local paths', () => {
		expect(safeNext('/visitorDirectory/0b6f6a9e-1c1e-4c1a-9d1e-2b8e0a7f1c33')).toBe('/visitorDirectory/0b6f6a9e-1c1e-4c1a-9d1e-2b8e0a7f1c33');
		expect(safeNext('/me')).toBe('/me');
	});
	it('rejects anything that could leave the site', () => {
		for (const bad of [null, undefined, '', 'visitorDirectory', 'https://evil.example', '//evil.example', '/\\evil.example', '/a\nb'])
			expect(safeNext(bad)).toBeNull();
	});
});

describe('canonicalDirectoryPath', () => {
	it('fixes the casing', () => {
		expect(canonicalDirectoryPath('/visitordirectory')).toBe('/visitorDirectory');
		expect(canonicalDirectoryPath('/VISITORDIRECTORY/abc')).toBe('/visitorDirectory/abc');
	});
	it('leaves correct and unrelated paths alone', () => {
		expect(canonicalDirectoryPath('/visitorDirectory/abc')).toBeNull();
		expect(canonicalDirectoryPath('/visitordirectoryx')).toBeNull();
		expect(canonicalDirectoryPath('/me')).toBeNull();
	});
});

describe('pollDelay', () => {
	it('polls fast in an active conversation, then slows', () => {
		expect(pollDelay({ inConversation: true, quietMs: 60_000 })).toBe(10_000);
		expect(pollDelay({ inConversation: true, quietMs: 120_000 })).toBe(30_000);
		expect(pollDelay({ inConversation: false, quietMs: 0 })).toBe(30_000);
	});
});

describe('matchesSearch', () => {
	const p = { fullName: 'Priya Raman', companyName: 'Kaveri Textiles' };
	it('matches name or company, any case', () => {
		expect(matchesSearch(p, ' priya ')).toBe(true);
		expect(matchesSearch(p, 'TEXT')).toBe(true);
		expect(matchesSearch(p, '')).toBe(true);
		expect(matchesSearch(p, 'salem')).toBe(false);
	});
});
