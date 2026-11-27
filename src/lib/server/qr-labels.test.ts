import { describe, expect, it } from 'vitest';
import { QR_LABEL_HEADER, qrLabelCsv, qrLabelRows } from './qr-labels.ts';

const regs = [
	{ id: 'a', fullName: ' Meena Kumar ', designation: 'Founder', companyName: 'Meena "Foods", Salem', ticketType: 'delegate' as const },
	{ id: 'b', fullName: 'Arun', designation: '-', companyName: '=HYPERLINK("x")', ticketType: 'visitor' as const }
];
const urls = new Map([
	['a', 'https://conclave.midtownevents.in/pass/AAAAAAAAAAAAAAAAAAAAAA'],
	['b', 'https://conclave.midtownevents.in/pass/BBBBBBBBBBBBBBBBBBBBBB']
]);

describe('qrLabelRows', () => {
	it('puts each registration in the columns OpenLabel maps', () => {
		expect(QR_LABEL_HEADER).toEqual(['Visitor Type', 'Name', 'URL for QR', 'Designation', 'Company']);
		expect(qrLabelRows(regs, urls)).toEqual([
			['Delegate', 'Meena Kumar', 'https://conclave.midtownevents.in/pass/AAAAAAAAAAAAAAAAAAAAAA', 'Founder', 'Meena "Foods", Salem'],
			['Visitor', 'Arun', 'https://conclave.midtownevents.in/pass/BBBBBBBBBBBBBBBBBBBBBB', '-', '=HYPERLINK("x")']
		]);
	});
});

describe('qrLabelCsv', () => {
	const csv = qrLabelCsv(qrLabelRows(regs, urls));
	const lines = csv.split('\r\n');

	it('starts with a byte-order mark and the header', () => {
		expect(csv.startsWith('﻿')).toBe(true);
		expect(lines[0]).toBe('﻿"Visitor Type","Name","URL for QR","Designation","Company"');
		expect(lines).toHaveLength(3);
	});

	it('quotes commas and quotes, and defuses formulas', () => {
		expect(lines[1]).toBe('"Delegate","Meena Kumar","https://conclave.midtownevents.in/pass/AAAAAAAAAAAAAAAAAAAAAA","Founder","Meena ""Foods"", Salem"');
		expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
		expect(lines[2]).toContain(`,"-",`);
	});
});
