import { describe, expect, it } from 'vitest';
import { allowSignInLink } from './sign-in-limit.ts';

describe('allowSignInLink', () => {
	it('lets a whole venue on one Wi-Fi address ask for links', () => {
		for (let i = 0; i < 400; i++) expect(allowSignInLink('203.0.113.7', `delegate-${i}@example.test`)).toBe(true);
	});
	it('sends at most 3 links to one address in 30 minutes', () => {
		const ip = '198.51.100.1';
		expect([1, 2, 3, 4].map(() => allowSignInLink(ip, 'Same@Example.test'))).toEqual([true, true, true, false]);
		expect(allowSignInLink(ip, 'same@example.test')).toBe(false);
	});
});
