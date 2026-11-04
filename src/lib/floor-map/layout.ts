/**
 * Floor map layout: what the organiser draws over the uploaded floor plan and what
 * the 3D viewer builds. Shared by the browser (editor, viewer) and the server
 * (validation before saving). Coordinates are pixels of the uploaded image; the
 * map's scale (pixels per metre) turns them into metres in 3D.
 */

export type Point = [number, number];

export interface Wall {
	id: string;
	a: Point;
	b: Point;
	/** Metres. */
	thickness: number;
	/** Metres. */
	height: number;
}

export const ZONE_TYPES = [
	{ value: 'room', label: 'Room', color: '#60a5fa', height: 0.03 },
	{ value: 'stall', label: 'Stall', color: '#e3b04b', height: 1 },
	{ value: 'stage', label: 'Stage', color: '#8b5cf6', height: 0.8 },
	{ value: 'hall', label: 'Hall / seating', color: '#3b82f6', height: 0.05 },
	{ value: 'food', label: 'Food court', color: '#f97316', height: 0.05 },
	{ value: 'registration', label: 'Registration', color: '#14b8a6', height: 1 },
	{ value: 'restroom', label: 'Restroom', color: '#64748b', height: 0.05 },
	{ value: 'lounge', label: 'Lounge', color: '#22c55e', height: 0.05 },
	{ value: 'walkway', label: 'Walkway', color: '#cbd5e1', height: 0.02 },
	{ value: 'other', label: 'Other', color: '#94a3b8', height: 0.05 }
] as const;
export type ZoneType = (typeof ZONE_TYPES)[number]['value'];

export interface Zone {
	id: string;
	type: ZoneType;
	name: string;
	polygon: Point[];
	color: string;
	/** Metres: a stall counter stands about 1 m tall, floor areas a few centimetres. */
	height: number;
	/** What visitors read about this room before and while they explore it in 3D. */
	description: string;
}

export const MARKER_TYPES = [
	{ value: 'entrance', label: 'Entrance', color: '#16a34a', symbol: 'IN' },
	{ value: 'exit', label: 'Exit', color: '#dc2626', symbol: 'EXIT' },
	{ value: 'info', label: 'Help desk', color: '#2563eb', symbol: 'i' },
	{ value: 'restroom', label: 'Restroom', color: '#475569', symbol: 'WC' },
	{ value: 'food', label: 'Food', color: '#ea580c', symbol: 'F' },
	{ value: 'lift', label: 'Lift / stairs', color: '#7c3aed', symbol: 'L' },
	{ value: 'firstaid', label: 'First aid', color: '#e11d48', symbol: '+' }
] as const;
export type MarkerType = (typeof MARKER_TYPES)[number]['value'];

export interface Marker {
	id: string;
	type: MarkerType;
	label: string;
	pos: Point;
}

export interface Layout {
	walls: Wall[];
	zones: Zone[];
	markers: Marker[];
	/** Where walk mode starts, and the direction faced in degrees (0 = up the image, clockwise). */
	start: { pos: Point; facing: number } | null;
}

export const EMPTY_LAYOUT: Layout = { walls: [], zones: [], markers: [], start: null };

export const LIMITS = { walls: 1500, zones: 600, markers: 300, polygonPoints: 64, name: 60, description: 600 };
export const DEFAULT_WALL = { thickness: 0.2, height: 2.6 };

export const zoneInfo = (type: string) => ZONE_TYPES.find((z) => z.value === type) ?? ZONE_TYPES[ZONE_TYPES.length - 1];
export const markerInfo = (type: string) => MARKER_TYPES.find((m) => m.value === type) ?? MARKER_TYPES[2];

export function newId(prefix: string) {
	return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

/* ---------- validation: everything that is saved or analysed passes through here ---------- */

const num = (v: unknown, min: number, max: number, fallback: number) => {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (v: unknown, max = LIMITS.name) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
/** Like text(), but keeps line breaks: descriptions may have short paragraphs. */
const paragraph = (v: unknown, max = LIMITS.description) =>
	typeof v === 'string'
		? v
				.replace(/\r\n?/g, '\n')
				.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ')
				.replace(/\n{3,}/g, '\n\n')
				.trim()
				.slice(0, max)
		: '';
const color = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const id = (v: unknown, prefix: string) => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : newId(prefix));

/**
 * Cleans a layout from any source (the editor, the AI, a hand-edited payload):
 * known types only, numbers clamped to the image (with some margin), strings
 * trimmed, counts capped. Never throws.
 */
export function sanitizeLayout(input: unknown, width: number, height: number): Layout {
	const src = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>;
	const list = (v: unknown) => (Array.isArray(v) ? v : []);
	const margin = Math.max(width, height) * 0.25;
	const point = (v: unknown): Point | null => {
		if (!Array.isArray(v) || v.length < 2) return null;
		const x = Number(v[0]);
		const y = Number(v[1]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
		return [
			Math.round(Math.min(width + margin, Math.max(-margin, x)) * 10) / 10,
			Math.round(Math.min(height + margin, Math.max(-margin, y)) * 10) / 10
		];
	};

	const walls: Wall[] = [];
	for (const raw of list(src.walls).slice(0, LIMITS.walls)) {
		const w = (raw ?? {}) as Record<string, unknown>;
		const a = point(w.a);
		const b = point(w.b);
		if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
		walls.push({
			id: id(w.id, 'w'),
			a,
			b,
			thickness: num(w.thickness, 0.05, 2, DEFAULT_WALL.thickness),
			height: num(w.height, 0.3, 12, DEFAULT_WALL.height)
		});
	}

	const zones: Zone[] = [];
	for (const raw of list(src.zones).slice(0, LIMITS.zones)) {
		const z = (raw ?? {}) as Record<string, unknown>;
		const polygon = list(z.polygon).slice(0, LIMITS.polygonPoints).map(point).filter((p): p is Point => p !== null);
		if (polygon.length < 3) continue;
		const info = zoneInfo(String(z.type));
		zones.push({
			id: id(z.id, 'z'),
			type: info.value,
			name: text(z.name),
			polygon,
			color: color(z.color, info.color),
			height: num(z.height, 0.01, 6, info.height),
			description: paragraph(z.description)
		});
	}

	const markers: Marker[] = [];
	for (const raw of list(src.markers).slice(0, LIMITS.markers)) {
		const m = (raw ?? {}) as Record<string, unknown>;
		const pos = point(m.pos);
		if (!pos) continue;
		const info = markerInfo(String(m.type));
		markers.push({ id: id(m.id, 'm'), type: info.value, label: text(m.label) || info.label, pos });
	}

	const s = (src.start ?? null) as Record<string, unknown> | null;
	const startPos = s ? point(s.pos) : null;
	const start = startPos ? { pos: startPos, facing: Math.round(num(s!.facing, -360, 360, 0)) } : null;

	return { walls, zones, markers, start };
}

export const isEmptyLayout = (l: Layout) => !l.walls.length && !l.zones.length && !l.markers.length;

/** Polygon centre (average of the corners): where a zone's label floats. */
export function centroid(polygon: Point[]): Point {
	let x = 0;
	let y = 0;
	for (const p of polygon) {
		x += p[0];
		y += p[1];
	}
	return [x / polygon.length, y / polygon.length];
}
