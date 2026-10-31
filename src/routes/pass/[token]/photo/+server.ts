import { error } from '@sveltejs/kit';
import { opsReady } from '#lib/server/ops/event.ts';
import { passHolder } from '#lib/server/ops/networking.ts';
import { resolveToken } from '#lib/server/ops/passes.ts';
import { getObject } from '#lib/server/r2.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** The photo on the scanned ID card: only for a current, paid pass. */
export const GET: RequestHandler = async ({ params }) => {
	if (!(await opsReady())) error(404, 'Not found');
	const resolved = await resolveToken(params.token);
	if (resolved.status !== 'active') error(404, 'Not found');
	const holder = await passHolder(resolved.registrationId);
	const object = holder?.photoKey ? await getObject(holder.photoKey) : null;
	if (!object) error(404, 'Not found');
	return new Response(object.body as BodyInit, {
		headers: { 'content-type': object.contentType, 'cache-control': 'private, max-age=600' }
	});
};
