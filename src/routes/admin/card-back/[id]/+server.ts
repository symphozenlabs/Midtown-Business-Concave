import { error, json } from '@sveltejs/kit';
import { currentCardBackKey } from '#lib/server/ops/passes.ts';
import { deleteObject, putObject } from '#lib/server/r2.ts';
import { getRegistration, setTicketBack } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The organiser's browser draws the ID card back (same artwork and fonts as the
 * front) and uploads it here. The server decides the key, so the QR version
 * always matches the delegate's current pass.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	const reg = await getRegistration(params.id);
	if (!reg || reg.status !== 'paid') error(409, 'Only paid registrations get an ID card back.');
	const key = await currentCardBackKey(reg.id);
	if (!key) error(503, 'Event passes are not set up (DATABASE_URL, PASS_SECRET and db/schema.sql).');

	const body = new Uint8Array(await request.arrayBuffer());
	if (body.length > MAX_BYTES) error(413, 'That image is too large.');
	if (!(body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)) error(415, 'Send a JPEG.');

	await putObject(key, body, 'image/jpeg');
	if (reg.ticketBackKey && reg.ticketBackKey !== key) await deleteObject(reg.ticketBackKey);
	await setTicketBack(reg.id, key);
	return json({ key });
};
