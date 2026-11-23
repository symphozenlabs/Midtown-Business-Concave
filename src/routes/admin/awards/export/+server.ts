import { error } from '@sveltejs/kit';
import { AWARD_STATUS_LABEL } from '#lib/awards.ts';
import { listAwardApplications } from '#lib/server/awards.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Quotes a CSV cell, and defuses values a spreadsheet would run as a formula. */
function cell(value: unknown) {
	let s = value == null ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every award application as a CSV that opens in Excel. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	const rows = await listAwardApplications();
	const time = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const header = ['Application', 'Received (IST)', 'Status', 'Business', 'Category', 'Year started', 'Team size', 'Website', 'Applicant', 'Designation', 'Email', 'Mobile', 'City', 'About the business', 'Why it deserves the award', 'Organiser note'];
	const lines = rows.map((a) =>
		[a.code, time.format(new Date(a.createdAt)), AWARD_STATUS_LABEL[a.status], a.businessName, a.categoryLabel, a.yearStarted, a.teamSize, a.website, a.fullName, a.designation, a.email, a.phone, a.city, a.about, a.achievements, a.adminNote]
			.map(cell)
			.join(',')
	);
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response('﻿' + [header.join(','), ...lines].join('\r\n'), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="award-applications-${stamp}.csv"`
		}
	});
};
