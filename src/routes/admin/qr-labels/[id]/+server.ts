import { error } from '@sveltejs/kit';
import { audit, getDefaultEvent, opsReady } from '#lib/server/ops/event.ts';
import { isPassConfigured, passUrlsFor } from '#lib/server/ops/passes.ts';
import { qrLabelPage } from '#lib/server/qr-label-page.ts';
import { qrLabelRows } from '#lib/server/qr-labels.ts';
import { publicOrigin } from '#lib/server/site.ts';
import { getRegistration } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * One paid participant's name-and-QR label, as a page ready to print on the label
 * printer. The dashboard's Print label button opens its print dialog; opened in a tab,
 * it shows the label with a Print button. Same fields as the QR labels CSV.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	if (!isPassConfigured || !(await opsReady())) error(503, 'QR links need DATABASE_URL and PASS_SECRET, and db/schema.sql run on the database.');
	const reg = await getRegistration(params.id);
	if (!reg) error(404, 'This registration no longer exists.');
	if (reg.status !== 'paid') error(409, 'Only paid registrations have a pass QR to print.');

	const [[type, name, link, designation, company]] = qrLabelRows([reg], await passUrlsFor([reg.id], publicOrigin(url)));
	const event = await getDefaultEvent();
	await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'qr-label.print', targetType: 'registration', targetId: reg.id });

	return new Response(qrLabelPage({ type, name, link, designation, company }), {
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
};
