import { fail, redirect } from '@sveltejs/kit';
import { EMPTY_LAYOUT } from '#lib/floor-map/layout.ts';
import { SAMPLE_IMAGE, SAMPLE_SCALE, SAMPLE_TITLE, sampleLayout } from '#lib/floor-map/sample.ts';
import {
	STATIC_PREFIX,
	createFloorMap,
	deleteFloorMap,
	imageUrlFor,
	isFloorMapStoreAvailable,
	listFloorMaps
} from '#lib/server/floor-maps.ts';
import { isStorageAvailable, putObject } from '#lib/server/r2.ts';
import { publicOrigin } from '#lib/server/site.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX_BYTES = 4 * 1024 * 1024;

/** Accepts only real WebP, PNG or JPEG bytes, whatever the browser called the file. */
function sniff(bytes: Uint8Array): { ext: 'webp' | 'png' | 'jpg'; type: string } | null {
	const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
	if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return { ext: 'png', type: 'image/png' };
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
	return null;
}

const cleanTitle = (v: FormDataEntryValue | null) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

export const load: PageServerLoad = async ({ url }) => {
	if (!isFloorMapStoreAvailable) return { available: false as const };
	const maps = await listFloorMaps();
	const origin = publicOrigin(url);
	return {
		available: true as const,
		canUpload: isStorageAvailable,
		maps: maps.map((m) => ({ ...m, imageUrl: imageUrlFor(m, 'admin'), publicUrl: `${origin}/map/${m.publicToken}` }))
	};
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		if (!locals.admin) redirect(303, '/login');
		if (!isStorageAvailable) return fail(503, { message: 'Image storage (R2) is not set up, so plans cannot be uploaded yet.' });
		const form = await request.formData();
		const title = cleanTitle(form.get('title'));
		const file = form.get('image');
		const width = Math.round(Number(form.get('width')));
		const height = Math.round(Number(form.get('height')));
		const metres = Number(form.get('widthMetres'));

		if (!title) return fail(400, { message: 'Give the map a name, for example "Stall floor map · Hall A".' });
		if (!(file instanceof File) || !file.size) return fail(400, { message: 'Choose the floor plan image.' });
		if (file.size > MAX_BYTES) return fail(400, { message: 'The image is too large. It should be under 4 MB after resizing.' });
		if (!(width >= 50 && width <= 8192 && height >= 50 && height <= 8192)) return fail(400, { message: 'The image size could not be read. Choose it again.' });

		const bytes = new Uint8Array(await file.arrayBuffer());
		const kind = sniff(bytes);
		if (!kind) return fail(400, { message: 'That file is not a PNG, JPG or WebP image.' });

		// Without a known width, assume the plan shows about 40 m across; the editor can calibrate it.
		const scale = Number.isFinite(metres) && metres >= 2 && metres <= 2000 ? width / metres : width / 40;
		const id = crypto.randomUUID();
		const key = `floor-maps/${id}/${Date.now().toString(36)}.${kind.ext}`;
		await putObject(key, bytes, kind.type);
		await createFloorMap({
			id,
			title,
			imageKey: key,
			imageWidth: width,
			imageHeight: height,
			scalePxPerM: scale,
			layout: EMPTY_LAYOUT,
			createdBy: locals.admin.email
		});
		redirect(303, `/admin/floor-maps/${id}?new=1`);
	},

	sample: async ({ locals }) => {
		if (!locals.admin) redirect(303, '/login');
		const map = await createFloorMap({
			title: SAMPLE_TITLE,
			imageKey: STATIC_PREFIX + SAMPLE_IMAGE.url,
			imageWidth: SAMPLE_IMAGE.width,
			imageHeight: SAMPLE_IMAGE.height,
			scalePxPerM: SAMPLE_SCALE,
			layout: sampleLayout(),
			createdBy: locals.admin.email
		});
		redirect(303, `/admin/floor-maps/${map.id}`);
	},

	delete: async ({ request, locals }) => {
		if (!locals.admin) redirect(303, '/login');
		const id = String((await request.formData()).get('id') ?? '');
		if (!(await deleteFloorMap(id))) return fail(404, { message: 'That map was already deleted.' });
		return { deleted: true };
	}
};
