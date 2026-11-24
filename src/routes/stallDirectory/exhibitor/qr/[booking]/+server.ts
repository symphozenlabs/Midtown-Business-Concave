import { error } from '@sveltejs/kit';
import { publicOrigin } from '#lib/server/site.ts';
import { stallCardQr } from '#lib/server/stall-directory/card.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** The signed-in exhibitor's own stall QR as a PNG, to show at the stall or download (?download). */
export const GET: RequestHandler = async ({ cookies, params, url }) => {
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) error(401, 'Sign in again.');
	const stall = exhibitor.stalls.find((s) => s.id === params.booking);
	if (!stall) error(404, 'Not found');
	const png = await stallCardQr(publicOrigin(url), stall);
	return new Response(png as BodyInit, {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'private, no-store',
			...(url.searchParams.has('download') ? { 'content-disposition': `attachment; filename="MBC2026-Stall-${stall.code}.png"` } : {})
		}
	});
};
