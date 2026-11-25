import { describe, expect, it } from 'vitest';
import { codePrefix, codeVariants, isRegistrationCode, withTicketPrefix } from './registration-code.ts';

describe('registration codes', () => {
	it('accepts delegate and visitor codes', () => {
		expect(isRegistrationCode('MBC-AB2C3D')).toBe(true);
		expect(isRegistrationCode('MBCV-AB2C3D')).toBe(true);
	});

	it('refuses anything else', () => {
		for (const bad of ['MBC-AB2C3', 'MBCX-AB2C3D', 'MBCVV-AB2C3D', 'mbc-ab2c3d', 'MBC26-AB2C3D', ''])
			expect(isRegistrationCode(bad)).toBe(false);
	});

	it('prefixes by ticket', () => {
		expect(codePrefix('delegate')).toBe('MBC-');
		expect(codePrefix('visitor')).toBe('MBCV-');
	});

	it('moves a code between tickets keeping its six characters', () => {
		expect(withTicketPrefix('MBC-AB2C3D', 'visitor')).toBe('MBCV-AB2C3D');
		expect(withTicketPrefix('MBCV-AB2C3D', 'delegate')).toBe('MBC-AB2C3D');
		expect(withTicketPrefix('MBCV-AB2C3D', 'visitor')).toBe('MBCV-AB2C3D');
	});

	it('lists both spellings for lookups', () => {
		expect(codeVariants('MBC-AB2C3D')).toEqual(['MBC-AB2C3D', 'MBCV-AB2C3D']);
		expect(codeVariants('MBCV-AB2C3D')).toEqual(['MBC-AB2C3D', 'MBCV-AB2C3D']);
	});
});
