import { error, json } from '@sveltejs/kit';
import { deleteObject, putObject } from '#lib/server/r2.ts';
import { getRegistration, setPostKey } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The organiser's browser cuts the square (1:1) Instagram post from the delegate's
 * stored ID card front and uploads it here; it goes out with the ticket email.
 * Each upload gets a new key, so a redrawn post is never served from a cache.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.admin) error(401, 'Sign in again.');
	const reg = await getRegistration(params.id);
	if (!reg || reg.status !== 'paid') error(409, 'Only paid registrations get a square post.');
	if (!reg.posterKey) error(409, 'This delegate has no ID card front yet.');

	const body = new Uint8Array(await request.arrayBuffer());
	if (body.length > MAX_BYTES) error(413, 'That image is too large.');
	if (!(body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)) error(415, 'Send a JPEG.');

	const key = `registrations/2026/${reg.id}-post-${Date.now().toString(36)}.jpg`;
	await putObject(key, body, 'image/jpeg');
	if (reg.postKey && reg.postKey !== key) await deleteObject(reg.postKey);
	await setPostKey(reg.id, key);
	return json({ key });
};
