import { error, fail, redirect } from '@sveltejs/kit';
import { FloorMapAiError, analyseFloorPlan, isFloorMapAiConfigured } from '#lib/server/floor-map-ai.ts';
import { getFloorMap, imageUrlFor, publishFloorMap, saveFloorMapDraft, unpublishFloorMap } from '#lib/server/floor-maps.ts';
import { allow } from '#lib/server/rate-limit.ts';
import { publicOrigin } from '#lib/server/site.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const map = await getFloorMap(params.id);
	if (!map) error(404, 'Floor map not found');
	return {
		map,
		imageUrl: imageUrlFor(map, 'admin'),
		publicUrl: `${publicOrigin(url)}/map/${map.publicToken}`,
		aiAvailable: isFloorMapAiConfigured,
		isNew: url.searchParams.has('new')
	};
};

/** Reads title, scale and layout from the editor's form. */
async function draftFrom(request: Request) {
	const form = await request.formData();
	const title = String(form.get('title') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
	const scale = Number(form.get('scale'));
	let layout: unknown;
	try {
		layout = JSON.parse(String(form.get('layout') ?? '{}'));
	} catch {
		return { problem: 'The map could not be read. Reload the page and try again.' } as const;
	}
	if (!title) return { problem: 'Give the map a name.' } as const;
	if (!(scale > 0.5 && scale < 5000)) return { problem: 'The scale is not valid. Calibrate it again.' } as const;
	if (String(form.get('layout') ?? '').length > 2_000_000) return { problem: 'The map has too many items to save.' } as const;
	return { title, scale, layout } as const;
}

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		if (!locals.admin) redirect(303, '/login');
		const draft = await draftFrom(request);
		if ('problem' in draft) return fail(400, { message: draft.problem });
		const map = await saveFloorMapDraft(params.id, draft.title, draft.scale, draft.layout);
		if (!map) return fail(404, { message: 'This map was deleted.' });
		return { saved: 'Draft saved. The public view changes when you publish.', map };
	},

	publish: async ({ params, request, locals }) => {
		if (!locals.admin) redirect(303, '/login');
		const draft = await draftFrom(request);
		if ('problem' in draft) return fail(400, { message: draft.problem });
		if (!(await saveFloorMapDraft(params.id, draft.title, draft.scale, draft.layout))) return fail(404, { message: 'This map was deleted.' });
		const map = await publishFloorMap(params.id);
		if (!map) return fail(404, { message: 'This map was deleted.' });
		return { saved: 'Published. Anyone who scans the QR now sees this version.', map };
	},

	unpublish: async ({ params, locals }) => {
		if (!locals.admin) redirect(303, '/login');
		if (!(await unpublishFloorMap(params.id))) return fail(404, { message: 'This map was deleted.' });
		const map = await getFloorMap(params.id);
		return { saved: 'Unpublished. The QR now shows "not available".', map };
	},

	analyse: async ({ params, request, locals }) => {
		if (!locals.admin) redirect(303, '/login');
		if (!isFloorMapAiConfigured) return fail(503, { message: 'AI analysis is not set up.' });
		if (!allow(`floor-ai:${locals.admin.email}`, 12, 60 * 60_000)) {
			return fail(429, { message: 'Too many analyses this hour. Try again later.' });
		}
		const map = await getFloorMap(params.id);
		if (!map) return fail(404, { message: 'This map was deleted.' });

		const form = await request.formData();
		const image = String(form.get('image') ?? '');
		const width = Number(form.get('width'));
		const height = Number(form.get('height'));
		if (!/^[A-Za-z0-9+/=]+$/.test(image) || image.length > 8_000_000) return fail(400, { message: 'The image could not be sent for analysis.' });
		if (!(width > 0 && width <= 2576 && height > 0 && height <= 2576)) return fail(400, { message: 'The image size is not valid.' });

		try {
			const result = await analyseFloorPlan(image, 'image/jpeg', width, height, map.imageWidth);
			return { analysed: result };
		} catch (e) {
			if (e instanceof FloorMapAiError) return fail(502, { message: e.message });
			console.error('[floor-map] analysis failed', e);
			return fail(500, { message: 'Analysis failed. Try again, or detect walls in the browser.' });
		}
	}
};
