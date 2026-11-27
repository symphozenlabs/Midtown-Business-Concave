import { describe, expect, it } from 'vitest';
import { validateManualStallBooking, type ManualStallBookingInput } from './stall-booking.ts';

const valid: ManualStallBookingInput = {
	fullName: 'Priya Raman',
	businessName: 'Raman Textiles',
	email: 'priya@example.com',
	phone: '98427 88990',
	allottedStall: 12,
	amountRupees: 7500,
	upiTxnId: ''
};

const check = (change: Partial<ManualStallBookingInput>, price = 7500) => validateManualStallBooking({ ...valid, ...change }, price);

describe('a stall booking added by an organiser', () => {
	it('accepts a paid booking with its stall', () => {
		expect(check({})).toEqual({});
	});

	it('accepts a complimentary stall and a 12-digit UPI ID', () => {
		expect(check({ amountRupees: 0 })).toEqual({});
		expect(check({ upiTxnId: '4321 5678 9012' })).toEqual({});
	});

	it('checks the exhibitor the same way as the website', () => {
		const errors = check({ fullName: 'P', businessName: '', email: 'priya@', phone: '12345' });
		expect(Object.keys(errors).sort()).toEqual(['businessName', 'email', 'fullName', 'phone']);
	});

	it('needs a stall from the layout', () => {
		expect(check({ allottedStall: null }).allottedStall).toBeTruthy();
		expect(check({ allottedStall: 25 }).allottedStall).toBeTruthy();
		expect(check({ allottedStall: 40 }).allottedStall).toBeTruthy();
	});

	it('keeps the amount between free and the stall price', () => {
		expect(check({ amountRupees: -1 }).amountRupees).toBeTruthy();
		expect(check({ amountRupees: 7500.5 }).amountRupees).toBeTruthy();
		expect(check({ amountRupees: Number.NaN }).amountRupees).toBeTruthy();
		expect(check({ amountRupees: 10.123 }).amountRupees).toBeTruthy();
		expect(check({ amountRupees: 5625.5 })).toEqual({});
	});

	it('rejects a UPI ID that is not 12 digits', () => {
		expect(check({ upiTxnId: '12345' }).upiTxnId).toBeTruthy();
	});
});
