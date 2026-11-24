import { describe, expect, it } from 'vitest';
import { pdfTable } from './pdf-table.ts';
import { xlsx } from './xlsx.ts';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('xlsx', () => {
	const book = xlsx({ name: 'Leads', header: ['Name', 'Note'], rows: [['Meena <K>', '=SUM(A1)'], ['Arun', null]] });

	it('is a zip holding the workbook parts', () => {
		expect([book[0], book[1], book[2], book[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
			expect(text(book)).toContain(part);
		}
	});

	it('writes every cell as escaped text, never a formula', () => {
		const s = text(book);
		expect(s).toContain('<t xml:space="preserve">Meena &lt;K&gt;</t>');
		expect(s).toContain('=SUM(A1)</t>');
		expect(s).not.toContain('<f>');
		expect(s).toContain('<autoFilter ref="A1:B3"/>');
	});
});

describe('pdfTable', () => {
	const rows = Array.from({ length: 120 }, (_, i) => [`Person ${i + 1}`, 'note (with) \\ chars']);
	const pdf = text(pdfTable({ title: 'Leads · Test', subtitle: ['Stall 5'], columns: [{ label: 'Name', width: 1 }, { label: 'Note', width: 1 }], rows }));

	it('is a PDF that splits long tables over pages', () => {
		expect(pdf.startsWith('%PDF-1.4')).toBe(true);
		expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
		const count = Number(pdf.match(/\/Count (\d+)/)?.[1]);
		expect(count).toBeGreaterThan(1);
		expect(pdf).toContain(`(Page ${count} of ${count})`);
		expect(pdf).toContain('(Person 120)');
	});

	it('escapes PDF string syntax and encodes the middle dot', () => {
		expect(pdf).toContain('(note \\(with\\) \\\\ chars)');
		expect(pdf).toContain('(Leads \\267 Test)');
	});

	it('points the cross-reference table at each object', () => {
		const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
		expect(pdf.slice(xref, xref + 4)).toBe('xref');
		const first = Number(pdf.slice(xref).split('\n')[3].slice(0, 10));
		expect(pdf.slice(first, first + 7)).toBe('1 0 obj');
	});
});
