import { TICKET_LABEL } from '#lib/payment.ts';
import type { LabelRegistration } from './store.ts';

/*
 * The QR label sheet for OpenLabel: one row per paid registration, with the link their
 * QR must encode. The column names are what the label template maps its fields to.
 */

export const QR_LABEL_HEADER = ['Visitor Type', 'Name', 'URL for QR', 'Designation', 'Company'];

/** Column widths for the Excel file, in characters. */
export const QR_LABEL_WIDTHS = [14, 28, 58, 26, 32];

export function qrLabelRows(regs: LabelRegistration[], urls: Map<string, string>): string[][] {
	return regs.map((r) => [
		TICKET_LABEL[r.ticketType],
		r.fullName.trim(),
		urls.get(r.id) ?? '',
		r.designation.trim(),
		r.companyName.trim()
	]);
}

/**
 * Quotes every cell and stops a leading =, +, - or @ running as a formula in a spreadsheet.
 * A lone "-" can't run, and an apostrophe in front of it would print on the label.
 */
const cell = (v: string) => {
	const s = v.length > 1 && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
	return `"${s.replace(/"/g, '""')}"`;
};

/** CSV with a byte-order mark, so Excel reads it as UTF-8. */
export function qrLabelCsv(rows: string[][]): string {
	return '﻿' + [QR_LABEL_HEADER, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
