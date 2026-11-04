import { error } from '@sveltejs/kit';
import { getPublishedFloorMap, imageKeyPattern } from '#lib/server/floor-maps.ts';
import { getObject } from '#lib/server/r2.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** The plan image behind a published floor map. Anyone with the QR link may load it; drafts are never served here. */
export const GET: RequestHandler = async ({ params }) => {
	const map = await getPublishedFloorMap(params.token);
	if (!map || !imageKeyPattern.test(map.imageKey)) error(404, 'Not found');
	const object = await getObject(map.imageKey);
	if (!object) error(404, 'Not found');
	return new Response(object.body as BodyInit, {
		headers: {
			'content-type': object.contentType,
			// Short cache: unpublishing takes the image down within minutes.
			'cache-control': 'public, max-age=300',
			'x-robots-tag': 'noindex'
		}
	});
};
