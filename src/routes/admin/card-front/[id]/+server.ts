import { error, json } from '@sveltejs/kit';
import { putObject } from '#lib/server/r2.ts';
import { getRegistration, setPosterKey } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The organiser's browser redraws a delegate's ID card front (the "I am attending"
 * poster) from their stored photo and framing, and uploads it here to replace the
 * stored one, e.g. when the delegate's own phone left the photo out.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	const reg = await getRegistration(params.id);
	if (!reg) error(404, 'This registration no longer exists.');

	const body = new Uint8Array(await request.arrayBuffer());
	if (body.length > MAX_BYTES) error(413, 'That image is too large.');
	if (!(body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)) error(415, 'Send a JPEG.');

	const key = reg.posterKey || `registrations/2026/${reg.id}-poster.jpg`;
	await putObject(key, body, 'image/jpeg');
	if (key !== reg.posterKey) await setPosterKey(reg.id, key);
	console.info(`[admin] ${locals.admin.email} regenerated the ID card front of ${reg.code}`);
	return json({ key });
};
