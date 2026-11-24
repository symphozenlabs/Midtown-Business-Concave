import { error } from '@sveltejs/kit';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { listLeads, stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Spreadsheet-safe: quotes every cell and stops a leading =, +, - or @ running as a formula. */
const cell = (v: string | number | null) => {
	let s = String(v ?? '');
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return `"${s.replace(/"/g, '""')}"`;
};

const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

/** The exhibitor's leads as a CSV file. */
export const GET: RequestHandler = async ({ cookies }) => {
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) error(401, 'Sign in again.');
	if (!(await stallDirectoryReady())) error(503, 'Leads open closer to the event.');
	const leads = await listLeads(exhibitor.bookingIds);
	const header = ['Name', 'Designation', 'Company', 'Industry', 'City', 'Phone', 'Email', 'Stall', 'Scanned', 'Note'];
	const rows = leads.map((l) =>
		[l.fullName, l.designation, l.companyName, l.industry, l.city, l.phone.replace(/^\+91/, ''), l.email, l.stall, when.format(new Date(l.scannedAt)), l.note].map(cell).join(',')
	);
	const csv = '﻿' + [header.map(cell).join(','), ...rows].join('\r\n');
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="conclave-leads.csv"',
			'cache-control': 'no-store'
		}
	});
};
