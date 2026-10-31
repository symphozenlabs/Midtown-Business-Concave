import { error } from '@sveltejs/kit';
import { categoryInfo } from '#lib/ops/categories.ts';
import { listTransactions, readFilter } from '#lib/server/ops/activity.ts';
import { audit, getDefaultEvent, opsReady } from '#lib/server/ops/event.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Quotes a CSV cell, and defuses values a spreadsheet would run as a formula. */
function cell(value: unknown) {
	let s = value == null ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The transaction history with the page's filters, as CSV. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	if (!(await opsReady())) error(503, 'Run db/schema.sql first.');
	const event = await getDefaultEvent();
	const filter = readFilter(url.searchParams);
	const rows = await listTransactions(event.id, filter, 20_000);
	await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'activity.export', details: { ...filter, rows: rows.length } });

	const time = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Kolkata' });
	const header = ['Time (IST)', 'Desk', 'Result', 'Code', 'Outcome', 'Participant', 'Registration', 'Handler', 'Username', 'Context'];
	const lines = rows.map((t) =>
		[
			time.format(new Date(t.at)),
			categoryInfo(t.category).label,
			t.result,
			t.code,
			t.title,
			t.participantName,
			t.participantCode,
			t.handlerName,
			t.handlerUsername,
			t.context ? JSON.stringify(t.context) : ''
		]
			.map(cell)
			.join(',')
	);
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response('﻿' + [header.join(','), ...lines].join('\r\n'), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="mbc-scan-activity-${stamp}.csv"`
		}
	});
};
