import { describe, expect, it } from 'vitest';
import { readWalkIn } from './walk-in.ts';

describe('readWalkIn', () => {
	it('tidies the spaces in what the desk typed', () => {
		expect(readWalkIn({ fullName: '  Narasimman   T ', designation: 'CEO', companyName: ' Mpeoples  Business ', ticketType: 'visitor' })).toEqual({
			ok: true,
			input: { fullName: 'Narasimman T', designation: 'CEO', companyName: 'Mpeoples Business', ticketType: 'visitor' }
		});
	});

	it('asks for every field, and Delegate or Visitor', () => {
		const result = readWalkIn({ fullName: ' ', designation: 'A', companyName: '', ticketType: 'vip' });
		expect(result).toEqual({
			ok: false,
			errors: {
				fullName: 'Enter the name.',
				designation: 'Enter the designation.',
				companyName: 'Enter the company.',
				ticketType: 'Choose Delegate or Visitor.'
			}
		});
	});

	it('keeps each field within the table limits', () => {
		const result = readWalkIn({ fullName: 'N'.repeat(41), designation: 'D'.repeat(40), companyName: 'C'.repeat(45), ticketType: 'delegate' });
		expect(result).toEqual({
			ok: false,
			errors: { fullName: 'Name can be at most 40 characters.', companyName: 'Company can be at most 44 characters.' }
		});
	});
});
