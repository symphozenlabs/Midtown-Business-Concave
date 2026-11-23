import { describe, expect, it } from 'vitest';
import { messageTime } from './time.ts';

describe('messageTime', () => {
	const now = new Date('2026-11-28T09:00:00Z'); // 2:30 pm in India
	it('shows only the time for today in India', () => expect(messageTime('2026-11-28T06:12:00Z', now)).toBe('11:42 am'));
	it('adds the date for earlier days', () => expect(messageTime('2026-11-27T13:15:00Z', now)).toBe('27 Nov, 6:45 pm'));
	it('counts days in India, not UTC', () => expect(messageTime('2026-11-27T19:00:00Z', now)).toBe('12:30 am'));
});
