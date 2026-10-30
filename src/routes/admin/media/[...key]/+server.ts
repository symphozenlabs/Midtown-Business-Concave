import { error } from '@sveltejs/kit';
import { getObject } from '#lib/server/r2.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Streams a delegate's photo or poster from storage to a signed-in organiser. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin) error(404, 'Not found');
	const key = params.key;
	if (!/^registrations\/2026\/[0-9a-f-]{36}(-poster)?\.(jpg|png|webp)$/.test(key)) error(404, 'Not found');
	const object = await getObject(key);
	if (!object) error(404, 'Not found');
	return new Response(object.body as BodyInit, {
		headers: { 'content-type': object.contentType, 'cache-control': 'private, max-age=3600' }
	});
};
