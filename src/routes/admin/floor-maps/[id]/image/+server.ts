import { error } from '@sveltejs/kit';
import { getFloorMap, imageKeyPattern } from '#lib/server/floor-maps.ts';
import { getObject } from '#lib/server/r2.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** The uploaded plan image of any floor map (drafts included), for the signed-in organiser. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin) error(404, 'Not found');
	const map = await getFloorMap(params.id);
	if (!map || !imageKeyPattern.test(map.imageKey)) error(404, 'Not found');
	const object = await getObject(map.imageKey);
	if (!object) error(404, 'Not found');
	return new Response(object.body as BodyInit, {
		headers: { 'content-type': object.contentType, 'cache-control': 'private, max-age=3600' }
	});
};
