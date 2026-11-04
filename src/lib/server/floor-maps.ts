/**
 * Floor maps: an uploaded floor plan image, the layout the organiser traces over it
 * (walls, stalls and other zones, markers), and a published copy that the public
 * 3D view at /map/<token> shows. Drafts never leave the dashboard; publishing copies
 * the draft, so edits go live only when the organiser publishes again. The token in
 * the QR never changes, so a printed QR keeps working.
 */
import { dev } from '$app/env';
import { sanitizeLayout, type Layout } from '#lib/floor-map/layout.ts';
import { SAMPLE_IMAGE, SAMPLE_SCALE, SAMPLE_TITLE, sampleLayout } from '#lib/floor-map/sample.ts';
import { randomToken } from './crypto.ts';
import { isDatabaseConfigured, sql } from './db.ts';
import { deleteObject } from './r2.ts';

export interface FloorMap {
	id: string;
	publicToken: string;
	title: string;
	/** R2 key of the uploaded image, or `static:<path>` for the bundled sample plan. */
	imageKey: string;
	imageWidth: number;
	imageHeight: number;
	scalePxPerM: number;
	layout: Layout;
	publishedLayout: Layout | null;
	publishedScale: number | null;
	publishedAt: string | null;
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
}

export type FloorMapSummary = Omit<FloorMap, 'layout' | 'publishedLayout'> & {
	counts: { walls: number; zones: number; stalls: number; markers: number };
	/** The draft has changes the public view does not show yet. */
	unpublishedChanges: boolean;
};

const useMemory = !isDatabaseConfigured && dev;
export const isFloorMapStoreAvailable = isDatabaseConfigured || useMemory;

export const STATIC_PREFIX = 'static:';
export const imageKeyPattern = /^floor-maps\/[0-9a-f-]{36}\/[0-9a-z]+\.(webp|png|jpg)$/;

/* ---------- storage: Neon, or memory in development without a database ---------- */

interface Row {
	id: string;
	public_token: string;
	title: string;
	image_key: string;
	image_width: number;
	image_height: number;
	scale_px_per_m: string | number;
	layout: unknown;
	published_layout: unknown;
	published_scale: string | number | null;
	published_at: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);

function fromRow(r: Row): FloorMap {
	const w = Number(r.image_width);
	const h = Number(r.image_height);
	return {
		id: r.id,
		publicToken: r.public_token,
		title: r.title,
		imageKey: r.image_key,
		imageWidth: w,
		imageHeight: h,
		scalePxPerM: Number(r.scale_px_per_m),
		layout: sanitizeLayout(r.layout, w, h),
		publishedLayout: r.published_layout ? sanitizeLayout(r.published_layout, w, h) : null,
		publishedScale: r.published_scale == null ? null : Number(r.published_scale),
		publishedAt: iso(r.published_at),
		createdBy: r.created_by,
		createdAt: iso(r.created_at)!,
		updatedAt: iso(r.updated_at)!
	};
}

let tableReady: Promise<void> | null = null;

/** Same statements as db/schema.sql, run once per server instance so the feature works before the schema is rerun. */
function ensureTable() {
	tableReady ??= (async () => {
		await sql()`
			create table if not exists floor_maps (
				id               uuid primary key default gen_random_uuid(),
				public_token     text not null unique,
				title            text not null check (char_length(title) between 1 and 80),
				image_key        text not null,
				image_width      integer not null check (image_width between 1 and 8192),
				image_height     integer not null check (image_height between 1 and 8192),
				scale_px_per_m   numeric(10, 3) not null check (scale_px_per_m > 0),
				layout           jsonb not null default '{}'::jsonb,
				published_layout jsonb,
				published_scale  numeric(10, 3),
				published_at     timestamptz,
				created_by       text,
				created_at       timestamptz not null default now(),
				updated_at       timestamptz not null default now()
			)`;
	})().catch((e) => {
		tableReady = null;
		throw e;
	});
	return tableReady;
}

const memory = new Map<string, FloorMap>();

/** Development without a database starts with the sample stall map, already published. */
function seedMemory() {
	if (memory.size) return;
	const now = new Date().toISOString();
	const layout = sampleLayout();
	const map: FloorMap = {
		id: crypto.randomUUID(),
		publicToken: 'sample-stall-map',
		title: SAMPLE_TITLE,
		imageKey: STATIC_PREFIX + SAMPLE_IMAGE.url,
		imageWidth: SAMPLE_IMAGE.width,
		imageHeight: SAMPLE_IMAGE.height,
		scalePxPerM: SAMPLE_SCALE,
		layout,
		publishedLayout: structuredClone(layout),
		publishedScale: SAMPLE_SCALE,
		publishedAt: now,
		createdBy: 'sample',
		createdAt: now,
		updatedAt: now
	};
	memory.set(map.id, map);
}

const clone = <T>(v: T): T => structuredClone(v);

/** 16 random bytes, URL-safe: about 22 characters, short enough for a clean QR. */
const newToken = () => randomToken(16);

/* ---------- public API ---------- */

/**
 * Where the browser loads the plan image: the bundled sample is a static file;
 * uploads stream from R2 through the dashboard (any map) or /map/<token>/image
 * (published maps only). The version stamp busts caches after a re-upload.
 */
export function imageUrlFor(map: Pick<FloorMap, 'id' | 'imageKey' | 'publicToken' | 'updatedAt'>, audience: 'admin' | 'public') {
	if (map.imageKey.startsWith(STATIC_PREFIX)) return map.imageKey.slice(STATIC_PREFIX.length);
	const v = encodeURIComponent(map.imageKey.split('/').pop() ?? '');
	return audience === 'admin' ? `/admin/floor-maps/${map.id}/image?v=${v}` : `/map/${map.publicToken}/image?v=${v}`;
}

function summarise(m: FloorMap): FloorMapSummary {
	const { layout, publishedLayout, ...rest } = m;
	return {
		...rest,
		counts: {
			walls: layout.walls.length,
			zones: layout.zones.length,
			stalls: layout.zones.filter((z) => z.type === 'stall').length,
			markers: layout.markers.length
		},
		unpublishedChanges:
			Boolean(publishedLayout) && (JSON.stringify(layout) !== JSON.stringify(publishedLayout) || m.publishedScale !== m.scalePxPerM)
	};
}

export async function listFloorMaps(): Promise<FloorMapSummary[]> {
	if (useMemory) {
		seedMemory();
		return [...memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => summarise(clone(m)));
	}
	await ensureTable();
	const rows = (await sql()`select * from floor_maps order by created_at desc`) as Row[];
	return rows.map((r) => summarise(fromRow(r)));
}

export async function getFloorMap(id: string): Promise<FloorMap | null> {
	if (!/^[0-9a-f-]{36}$/.test(id)) return null;
	if (useMemory) {
		seedMemory();
		const m = memory.get(id);
		return m ? clone(m) : null;
	}
	await ensureTable();
	const rows = (await sql()`select * from floor_maps where id = ${id}`) as Row[];
	return rows[0] ? fromRow(rows[0]) : null;
}

/** The published map behind a QR token, or null for unknown or unpublished maps. */
export async function getPublishedFloorMap(token: string): Promise<FloorMap | null> {
	if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
	if (useMemory) {
		seedMemory();
		const m = [...memory.values()].find((x) => x.publicToken === token);
		return m?.publishedLayout ? clone(m) : null;
	}
	await ensureTable();
	const rows = (await sql()`
		select * from floor_maps where public_token = ${token} and published_layout is not null`) as Row[];
	return rows[0] ? fromRow(rows[0]) : null;
}

export interface NewFloorMap {
	id?: string;
	title: string;
	imageKey: string;
	imageWidth: number;
	imageHeight: number;
	scalePxPerM: number;
	layout: Layout;
	createdBy: string;
}

export async function createFloorMap(input: NewFloorMap): Promise<FloorMap> {
	const id = input.id ?? crypto.randomUUID();
	const token = newToken();
	const layout = sanitizeLayout(input.layout, input.imageWidth, input.imageHeight);
	if (useMemory) {
		const now = new Date().toISOString();
		const map: FloorMap = {
			id,
			publicToken: token,
			title: input.title,
			imageKey: input.imageKey,
			imageWidth: input.imageWidth,
			imageHeight: input.imageHeight,
			scalePxPerM: input.scalePxPerM,
			layout,
			publishedLayout: null,
			publishedScale: null,
			publishedAt: null,
			createdBy: input.createdBy,
			createdAt: now,
			updatedAt: now
		};
		memory.set(id, map);
		return clone(map);
	}
	await ensureTable();
	const rows = (await sql()`
		insert into floor_maps (id, public_token, title, image_key, image_width, image_height, scale_px_per_m, layout, created_by)
		values (${id}, ${token}, ${input.title}, ${input.imageKey}, ${input.imageWidth}, ${input.imageHeight},
		        ${input.scalePxPerM}, ${JSON.stringify(layout)}::jsonb, ${input.createdBy})
		returning *`) as Row[];
	return fromRow(rows[0]);
}

/** Saves the draft: title, scale and layout. The public view is unchanged until publish. */
export async function saveFloorMapDraft(id: string, title: string, scalePxPerM: number, rawLayout: unknown): Promise<FloorMap | null> {
	const current = await getFloorMap(id);
	if (!current) return null;
	const layout = sanitizeLayout(rawLayout, current.imageWidth, current.imageHeight);
	if (useMemory) {
		const m = memory.get(id)!;
		Object.assign(m, { title, scalePxPerM, layout, updatedAt: new Date().toISOString() });
		return clone(m);
	}
	const rows = (await sql()`
		update floor_maps
		set title = ${title}, scale_px_per_m = ${scalePxPerM}, layout = ${JSON.stringify(layout)}::jsonb, updated_at = now()
		where id = ${id}
		returning *`) as Row[];
	return rows[0] ? fromRow(rows[0]) : null;
}

/** Copies the draft to the public view. */
export async function publishFloorMap(id: string): Promise<FloorMap | null> {
	if (useMemory) {
		const m = memory.get(id);
		if (!m) return null;
		Object.assign(m, { publishedLayout: clone(m.layout), publishedScale: m.scalePxPerM, publishedAt: new Date().toISOString() });
		return clone(m);
	}
	await ensureTable();
	const rows = (await sql()`
		update floor_maps
		set published_layout = layout, published_scale = scale_px_per_m, published_at = now()
		where id = ${id}
		returning *`) as Row[];
	return rows[0] ? fromRow(rows[0]) : null;
}

/** Takes the public view down; the QR shows "not available" until published again. */
export async function unpublishFloorMap(id: string): Promise<boolean> {
	if (useMemory) {
		const m = memory.get(id);
		if (!m) return false;
		Object.assign(m, { publishedLayout: null, publishedScale: null, publishedAt: null });
		return true;
	}
	await ensureTable();
	const rows = await sql()`
		update floor_maps set published_layout = null, published_scale = null, published_at = null where id = ${id} returning id`;
	return rows.length > 0;
}

export async function deleteFloorMap(id: string): Promise<boolean> {
	const current = await getFloorMap(id);
	if (!current) return false;
	if (useMemory) memory.delete(id);
	else await sql()`delete from floor_maps where id = ${id}`;
	if (!current.imageKey.startsWith(STATIC_PREFIX)) await deleteObject(current.imageKey);
	return true;
}
