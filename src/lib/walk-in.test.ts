import { describe, expect, it } from 'vitest';
import { readWalkIn } from './walk-in.ts';

const prices = { delegate: 2000, visitor: 499 };
const base = { fullName: 'Narasimman T', designation: 'CEO', companyName: 'Mpeoples Business', ticketType: 'visitor', amountRupees: '499', upiTxnId: '' };

describe('readWalkIn', () => {
	it('tidies the spaces in what the desk typed', () => {
		expect(
			readWalkIn({ ...base, fullName: '  Narasimman   T ', companyName: ' Mpeoples  Business ', amountRupees: ' ₹499 ' }, prices)
		).toEqual({
			ok: true,
			input: { fullName: 'Narasimman T', designation: 'CEO', companyName: 'Mpeoples Business', ticketType: 'visitor', amountRupees: 499, upiTxnId: null }
		});
	});

	it('asks for every field, Delegate or Visitor, and the amount', () => {
		const result = readWalkIn({ ...base, fullName: ' ', designation: 'A', companyName: '', ticketType: 'vip', amountRupees: '' }, prices);
		expect(result).toEqual({
			ok: false,
			errors: {
				fullName: 'Enter the name.',
				designation: 'Enter the designation.',
				companyName: 'Enter the company.',
				ticketType: 'Choose Delegate, Visitor or Complimentary.',
				amountRupees: 'Enter the amount received in rupees, or 0 for a complimentary pass.'
			}
		});
	});

	it('keeps each field within the table limits', () => {
		const result = readWalkIn({ ...base, fullName: 'N'.repeat(41), designation: 'D'.repeat(40), companyName: 'C'.repeat(45) }, prices);
		expect(result).toEqual({
			ok: false,
			errors: { fullName: 'Name can be at most 40 characters.', companyName: 'Company can be at most 44 characters.' }
		});
	});

	it('takes a complimentary pass, or a part payment, but never more than the ticket costs', () => {
		expect(readWalkIn({ ...base, amountRupees: '0' }, prices)).toMatchObject({ ok: true, input: { amountRupees: 0 } });
		expect(readWalkIn({ ...base, ticketType: 'delegate', amountRupees: '1,500' }, prices)).toMatchObject({ ok: true, input: { amountRupees: 1500 } });
		expect(readWalkIn({ ...base, amountRupees: '500' }, prices)).toEqual({
			ok: false,
			errors: { amountRupees: 'The visitor ticket costs ₹499. Enter that or less.' }
		});
		expect(readWalkIn({ ...base, amountRupees: '-1' }, prices)).toMatchObject({ ok: false });
		expect(readWalkIn({ ...base, amountRupees: '10.555' }, prices)).toMatchObject({ ok: false });
	});

	it('makes the Complimentary choice a free Delegate pass, ignoring the amount and UPI fields', () => {
		expect(readWalkIn({ ...base, ticketType: 'complimentary', amountRupees: '', upiTxnId: 'junk' }, prices)).toEqual({
			ok: true,
			input: { fullName: 'Narasimman T', designation: 'CEO', companyName: 'Mpeoples Business', ticketType: 'delegate', amountRupees: 0, upiTxnId: null }
		});
	});

	it('keeps a 12-digit UPI reference and refuses anything else', () => {
		expect(readWalkIn({ ...base, upiTxnId: '4321 5678 9012' }, prices)).toMatchObject({ ok: true, input: { upiTxnId: '432156789012' } });
		expect(readWalkIn({ ...base, upiTxnId: 'T2611271234' }, prices)).toEqual({
			ok: false,
			errors: { upiTxnId: 'A UPI reference ID is 12 digits. Leave it empty for cash.' }
		});
	});
});
