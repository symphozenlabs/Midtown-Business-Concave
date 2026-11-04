import { getPublishedFloorMap, imageUrlFor } from '#lib/server/floor-maps.ts';
import type { PageServerLoad } from './$types';

export const prerender = false;

/**
 * What the floor map QR opens: the published map in 3D. No sign-in, read-only, and
 * only the published copy; drafts and unpublished maps show "not available".
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex' });
	const map = await getPublishedFloorMap(params.token).catch(() => null);
	if (!map?.publishedLayout) return { found: false as const };
	return {
		found: true as const,
		title: map.title,
		imageUrl: imageUrlFor(map, 'public'),
		imageWidth: map.imageWidth,
		imageHeight: map.imageHeight,
		scale: map.publishedScale ?? map.scalePxPerM,
		layout: map.publishedLayout
	};
};
