import { error } from '@sveltejs/kit';
import { pdfTable } from '#lib/server/pdf-table.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { listLeads, stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import { xlsx } from '#lib/server/xlsx.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Spreadsheet-safe: quotes every cell and stops a leading =, +, - or @ running as a formula. */
const cell = (v: string | number | null) => {
	let s = String(v ?? '');
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return `"${s.replace(/"/g, '""')}"`;
};

const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

const FORMATS = {
	csv: { type: 'text/csv; charset=utf-8', ext: 'csv' },
	xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
	pdf: { type: 'application/pdf', ext: 'pdf' }
} as const;

/** The exhibitor's leads as a CSV, Excel or PDF file: ?format=csv (default), xlsx or pdf. */
export const GET: RequestHandler = async ({ cookies, url }) => {
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) error(401, 'Sign in again.');
	if (!(await stallDirectoryReady())) error(503, 'Leads open closer to the event.');
	const format = (url.searchParams.get('format') ?? 'csv') as keyof typeof FORMATS;
	if (!(format in FORMATS)) error(400, 'Choose csv, xlsx or pdf.');

	const leads = await listLeads(exhibitor.bookingIds);
	const multipleStalls = exhibitor.stalls.length > 1;
	const columns = [
		{ label: 'Name', width: 90, xlsx: 24 },
		{ label: 'Designation', width: 75, xlsx: 20 },
		{ label: 'Company', width: 95, xlsx: 26 },
		{ label: 'Industry', width: 62, xlsx: 18 },
		{ label: 'City', width: 52, xlsx: 14 },
		{ label: 'Phone', width: 66, xlsx: 15 },
		{ label: 'Email', width: 120, xlsx: 30 },
		...(multipleStalls || format !== 'pdf' ? [{ label: 'Stall', width: 30, xlsx: 8 }] : []),
		{ label: 'Scanned', width: 68, xlsx: 20 },
		{ label: 'Note', width: 110, xlsx: 40 }
	];
	const rows = leads.map((l) => [
		l.fullName,
		l.designation,
		l.companyName,
		l.industry,
		l.city,
		l.phone.replace(/^\+91/, ''),
		l.email,
		...(multipleStalls || format !== 'pdf' ? [l.stall ?? ''] : []),
		when.format(new Date(l.scannedAt)),
		l.note
	]);

	let body: Uint8Array | string;
	if (format === 'xlsx') {
		body = xlsx({ name: 'Leads', header: columns.map((c) => c.label), rows, widths: columns.map((c) => c.xlsx) });
	} else if (format === 'pdf') {
		const stalls = exhibitor.stalls.map((s) => (s.stall ? `Stall ${s.stall}` : 'Stall to be announced')).join(', ');
		body = pdfTable({
			title: `Leads · ${exhibitor.businessName}`,
			subtitle: [
				`${stalls} · Midtown Business Conclave`,
				`${leads.length} ${leads.length === 1 ? 'lead' : 'leads'} · downloaded ${when.format(new Date())}`
			],
			columns: [{ label: '#', width: 20 }, ...columns],
			rows: rows.map((r, i) => [i + 1, ...r])
		});
	} else {
		// The byte-order mark makes Excel read the CSV as UTF-8.
		body = '﻿' + [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n');
	}

	const { type, ext } = FORMATS[format];
	return new Response(body as BodyInit, {
		headers: {
			'content-type': type,
			'content-disposition': `attachment; filename="conclave-leads.${ext}"`,
			'cache-control': 'no-store'
		}
	});
};
