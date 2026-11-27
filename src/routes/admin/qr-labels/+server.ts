import { error } from '@sveltejs/kit';
import { audit, getDefaultEvent, opsReady } from '#lib/server/ops/event.ts';
import { isPassConfigured, passUrlsFor } from '#lib/server/ops/passes.ts';
import { QR_LABEL_HEADER, QR_LABEL_WIDTHS, qrLabelCsv, qrLabelRows } from '#lib/server/qr-labels.ts';
import { publicOrigin } from '#lib/server/site.ts';
import { listPaidForLabels } from '#lib/server/store.ts';
import { xlsx } from '#lib/server/xlsx.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const FORMATS = {
	csv: { type: 'text/csv; charset=utf-8', ext: 'csv' },
	xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' }
} as const;

/**
 * Every paid Delegate and Visitor with the link their QR opens, for printing QR labels
 * in OpenLabel: ?format=xlsx (default) or csv.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	const format = (url.searchParams.get('format') ?? 'xlsx') as keyof typeof FORMATS;
	if (!(format in FORMATS)) error(400, 'Choose csv or xlsx.');
	if (!isPassConfigured || !(await opsReady())) error(503, 'QR links need DATABASE_URL and PASS_SECRET, and db/schema.sql run on the database.');

	const regs = await listPaidForLabels();
	const rows = qrLabelRows(regs, await passUrlsFor(regs.map((r) => r.id), publicOrigin(url)));
	const event = await getDefaultEvent();
	await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'qr-labels.export', details: { format, rows: rows.length } });

	const body = format === 'xlsx' ? xlsx({ name: 'QR labels', header: QR_LABEL_HEADER, rows, widths: QR_LABEL_WIDTHS }) : qrLabelCsv(rows);
	const { type, ext } = FORMATS[format];
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(body as BodyInit, {
		headers: {
			'content-type': type,
			'content-disposition': `attachment; filename="mbc-qr-labels-${stamp}.${ext}"`,
			'cache-control': 'no-store'
		}
	});
};
