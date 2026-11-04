/**
 * In-browser plan analysis: the free option, and what runs straight after an upload
 * when AI analysis is not set up.
 *
 * 1. Walls: long, thick, dark horizontal and vertical strokes (how most floor plans
 *    draw walls), returned as wall segments in image pixels. Faint plans get a second,
 *    more lenient pass.
 * 2. Rooms: segmented from the plan's pixels. Doorways are closed by eroding open
 *    space, each room grows back to its own walls, and corridors and the outside are
 *    left out (see findRoomsInImage).
 * Diagonal walls and stalls are left for the organiser to draw.
 */
import { DEFAULT_WALL, newId, type Point, type Wall, type Zone } from './layout.ts';
import { planPixels } from './image-prep.ts';

/** Otsu's threshold, capped so mid-grey fills and thin outlines are not taken for walls. */
function darkThreshold(grey: Uint8Array, cap: number) {
	const hist = new Array(256).fill(0);
	for (const g of grey) hist[g]++;
	const total = grey.length;
	let sum = 0;
	for (let i = 0; i < 256; i++) sum += i * hist[i];
	let sumB = 0;
	let wB = 0;
	let best = 0;
	let threshold = 100;
	for (let t = 0; t < 256; t++) {
		wB += hist[t];
		if (!wB) continue;
		const wF = total - wB;
		if (!wF) break;
		sumB += t * hist[t];
		const mB = sumB / wB;
		const mF = (sum - sumB) / wF;
		const between = wB * wF * (mB - mF) ** 2;
		if (between > best) {
			best = between;
			threshold = t;
		}
	}
	return Math.min(threshold, cap);
}

interface Band {
	start: number;
	end: number;
	from: number[];
	to: number[];
}

/**
 * Scans lines (rows, or columns when `vertical`) for dark runs of at least `minLen`
 * and stacks runs on neighbouring lines into bands: a band of wall-like thickness is a wall.
 */
function scan(dark: Uint8Array, w: number, h: number, vertical: boolean, minLen: number, minThick: number, maxThick: number) {
	const lines = vertical ? w : h;
	const along = vertical ? h : w;
	const at = (line: number, i: number) => (vertical ? dark[i * w + line] : dark[line * w + i]);
	let open: Band[] = [];
	const done: Band[] = [];

	for (let line = 0; line < lines; line++) {
		const runs: [number, number][] = [];
		let s = -1;
		for (let i = 0; i <= along; i++) {
			const d = i < along && at(line, i);
			if (d && s < 0) s = i;
			else if (!d && s >= 0) {
				if (i - s >= minLen) runs.push([s, i - 1]);
				s = -1;
			}
		}
		const next: Band[] = [];
		for (const [a, b] of runs) {
			const band = open.find((o) => {
				const pa = o.from[o.from.length - 1];
				const pb = o.to[o.to.length - 1];
				const overlap = Math.min(b, pb) - Math.max(a, pa);
				return overlap > 0.8 * Math.min(b - a, pb - pa);
			});
			if (band && !next.includes(band)) {
				band.end = line;
				band.from.push(a);
				band.to.push(b);
				next.push(band);
			} else next.push({ start: line, end: line, from: [a], to: [b] });
		}
		for (const o of open) if (!next.includes(o)) done.push(o);
		open = next;
	}
	done.push(...open);

	const median = (v: number[]) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
	return done
		.filter((b) => {
			const thick = b.end - b.start + 1;
			return thick >= minThick && thick <= maxThick;
		})
		.map((b) => ({ mid: (b.start + b.end) / 2, from: median(b.from), to: median(b.to), thick: b.end - b.start + 1 }));
}

/** Joins pieces on the same line separated by a tiny gap (anti-aliasing), keeping door gaps. */
function merge(segs: { mid: number; from: number; to: number; thick: number }[], gap: number) {
	segs.sort((a, b) => a.mid - b.mid || a.from - b.from);
	const out: typeof segs = [];
	for (const s of segs) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.mid - s.mid) <= 2 && s.from - last.to <= gap) {
			last.to = Math.max(last.to, s.to);
			last.thick = Math.max(last.thick, s.thick);
		} else out.push({ ...s });
	}
	return out;
}

function findWalls(grey: Uint8Array, w: number, h: number, factor: number, scalePxPerM: number, lenient: boolean): Wall[] {
	const t = darkThreshold(grey, lenient ? 170 : 110);
	const dark = new Uint8Array(grey.length);
	for (let i = 0; i < grey.length; i++) dark[i] = grey[i] <= t ? 1 : 0;

	const side = Math.max(w, h);
	// Short pieces count: walls between doorways are often only a metre or two long.
	const minLen = Math.max(lenient ? 12 : 16, Math.round(side * (lenient ? 0.01 : 0.014)));
	const minThick = lenient ? 2 : 3;
	const maxThick = Math.max(8, Math.round(side * 0.025));

	const horizontal = merge(scan(dark, w, h, false, minLen, minThick, maxThick), 3);
	const vertical = merge(scan(dark, w, h, true, minLen, minThick, maxThick), 3);

	const r = (v: number) => Math.round(v * factor * 10) / 10;
	const thickness = (px: number) => Math.min(1, Math.max(0.1, Math.round(((px * factor) / scalePxPerM) * 100) / 100));
	const wall = (a: Point, b: Point, thick: number): Wall => ({ id: newId('w'), a, b, thickness: thickness(thick), height: DEFAULT_WALL.height });
	return [
		...horizontal.map((s) => wall([r(s.from), r(s.mid)], [r(s.to), r(s.mid)], s.thick)),
		...vertical.map((s) => wall([r(s.mid), r(s.from)], [r(s.mid), r(s.to)], s.thick))
	].slice(0, 1500);
}

/* ---------- rooms ---------- */

function distToSegment(p: Point, a: Point, b: Point) {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const len2 = dx * dx + dy * dy || 1;
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Moore-neighbour boundary tracing of one labelled component, clockwise. */
function trace(labels: Int32Array, w: number, h: number, label: number, start: number): Point[] {
	const dirs = [
		[-1, 0],
		[-1, -1],
		[0, -1],
		[1, -1],
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1]
	];
	const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === label;
	const sx = start % w;
	const sy = (start - sx) / w;
	const out: Point[] = [[sx, sy]];
	let cx = sx;
	let cy = sy;
	let bx = sx - 1;
	let by = sy;
	for (let guard = 0; guard < 4 * w * h; guard++) {
		const bi = dirs.findIndex(([dx, dy]) => cx + dx === bx && cy + dy === by);
		let moved = false;
		for (let k = 1; k <= 8; k++) {
			const [dx, dy] = dirs[(bi + k) % 8];
			const nx = cx + dx;
			const ny = cy + dy;
			if (inside(nx, ny)) {
				const [pdx, pdy] = dirs[(bi + k - 1) % 8];
				bx = cx + pdx;
				by = cy + pdy;
				cx = nx;
				cy = ny;
				moved = true;
				break;
			}
		}
		if (!moved || (cx === sx && cy === sy)) break;
		out.push([cx, cy]);
	}
	return out;
}

/** Ramer–Douglas–Peucker simplification of an open chain. */
function simplify(points: Point[], eps: number): Point[] {
	if (points.length < 3) return points;
	const [a, b] = [points[0], points[points.length - 1]];
	let maxD = 0;
	let index = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const d = distToSegment(points[i], a, b);
		if (d > maxD) {
			maxD = d;
			index = i;
		}
	}
	if (maxD <= eps) return [a, b];
	return [...simplify(points.slice(0, index + 1), eps).slice(0, -1), ...simplify(points.slice(index), eps)];
}

/* ---------- rooms: segmented from the plan's own pixels ---------- */

const ROOM_COLOURS = ['#60a5fa', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c'];
const SQRT2 = Math.SQRT2;

/** Clears small dark specks (room labels, icons, arrows) so they are not taken for walls. */
function removeSmallBlobs(dark: Uint8Array, w: number, h: number, maxSide: number) {
	const seen = new Uint8Array(w * h);
	const stack: number[] = [];
	const cells: number[] = [];
	for (let i = 0; i < w * h; i++) {
		if (!dark[i] || seen[i]) continue;
		cells.length = 0;
		stack.push(i);
		seen[i] = 1;
		let x0 = w;
		let y0 = h;
		let x1 = 0;
		let y1 = 0;
		while (stack.length) {
			const c = stack.pop()!;
			cells.push(c);
			const x = c % w;
			const y = (c - x) / w;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
					const n = ny * w + nx;
					if (dark[n] && !seen[n]) {
						seen[n] = 1;
						stack.push(n);
					}
				}
			}
		}
		if (x1 - x0 < maxSide && y1 - y0 < maxSide) for (const c of cells) dark[c] = 0;
	}
}

/** Two-pass chamfer distance from every open cell to the nearest wall cell. */
function distanceToWalls(blocked: Uint8Array, w: number, h: number) {
	const d = new Float32Array(w * h);
	for (let i = 0; i < d.length; i++) d[i] = blocked[i] ? 0 : 1e9;
	const relax = (i: number, j: number, cost: number) => {
		if (d[j] + cost < d[i]) d[i] = d[j] + cost;
	};
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (!d[i]) continue;
			if (x > 0) relax(i, i - 1, 1);
			if (y > 0) {
				relax(i, i - w, 1);
				if (x > 0) relax(i, i - w - 1, SQRT2);
				if (x < w - 1) relax(i, i - w + 1, SQRT2);
			}
		}
	for (let y = h - 1; y >= 0; y--)
		for (let x = w - 1; x >= 0; x--) {
			const i = y * w + x;
			if (!d[i]) continue;
			if (x < w - 1) relax(i, i + 1, 1);
			if (y < h - 1) {
				relax(i, i + w, 1);
				if (x < w - 1) relax(i, i + w + 1, SQRT2);
				if (x > 0) relax(i, i + w - 1, SQRT2);
			}
		}
	return d;
}

/** Labels connected cells where `inside(i)` holds (4-connected). Returns labels and each label's size and border contact. */
function label(w: number, h: number, inside: (i: number) => boolean) {
	const labels = new Int32Array(w * h);
	const sizes: number[] = [0];
	const border: boolean[] = [false];
	const stack: number[] = [];
	let next = 1;
	for (let i = 0; i < w * h; i++) {
		if (labels[i] || !inside(i)) continue;
		let size = 0;
		let touches = false;
		labels[i] = next;
		stack.push(i);
		while (stack.length) {
			const c = stack.pop()!;
			size++;
			const x = c % w;
			const y = (c - x) / w;
			if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
			if (x > 0 && !labels[c - 1] && inside(c - 1)) (labels[c - 1] = next), stack.push(c - 1);
			if (x < w - 1 && !labels[c + 1] && inside(c + 1)) (labels[c + 1] = next), stack.push(c + 1);
			if (y > 0 && !labels[c - w] && inside(c - w)) (labels[c - w] = next), stack.push(c - w);
			if (y < h - 1 && !labels[c + w] && inside(c + w)) (labels[c + w] = next), stack.push(c + w);
		}
		sizes.push(size);
		border.push(touches);
		next++;
	}
	return { labels, sizes, border };
}

/**
 * Grows each room's core back to the walls: every open cell within `reach` of a core
 * (measured through open space) joins the nearest core. Doorways narrower than the
 * erosion stay cut, and corridors beyond them are not swallowed.
 */
function regrow(cores: Int32Array, blocked: Uint8Array, w: number, h: number, reach: number) {
	const d = new Float32Array(w * h).fill(1e9);
	const owner = new Int32Array(w * h);
	for (let i = 0; i < d.length; i++) if (cores[i]) (d[i] = 0), (owner[i] = cores[i]);
	const relax = (i: number, j: number, cost: number) => {
		if (owner[j] && d[j] + cost < d[i]) {
			d[i] = d[j] + cost;
			owner[i] = owner[j];
		}
	};
	for (let pass = 0; pass < 2; pass++) {
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				if (blocked[i] || !d[i]) continue;
				if (x > 0) relax(i, i - 1, 1);
				if (y > 0) {
					relax(i, i - w, 1);
					if (x > 0) relax(i, i - w - 1, SQRT2);
					if (x < w - 1) relax(i, i - w + 1, SQRT2);
				}
			}
		for (let y = h - 1; y >= 0; y--)
			for (let x = w - 1; x >= 0; x--) {
				const i = y * w + x;
				if (blocked[i] || !d[i]) continue;
				if (x < w - 1) relax(i, i + 1, 1);
				if (y < h - 1) {
					relax(i, i + w, 1);
					if (x < w - 1) relax(i, i + w + 1, SQRT2);
					if (x > 0) relax(i, i + w - 1, SQRT2);
				}
			}
	}
	for (let i = 0; i < d.length; i++) if (d[i] > reach) owner[i] = 0;
	return owner;
}

/**
 * Finds rooms in the plan image (plus any walls already on the map):
 * 1. dark strokes are walls; small specks (labels, icons) are ignored;
 * 2. open space is eroded until doorways close, which leaves one "core" per room;
 *    the erosion depth is chosen automatically as the one that separates the most rooms;
 * 3. each core grows back to its walls (not through doorways);
 * 4. spaces touching the image edge (outside), corridors (thin, branching shapes) and
 *    specks are dropped. Near-rectangular rooms become clean rectangles.
 */
async function findRoomsInImage(imageUrl: string, imageWidth: number, imageHeight: number, scalePxPerM: number, walls: Wall[]): Promise<Zone[]> {
	const { grey, width: w, height: h, factor } = await planPixels(imageUrl, 640);
	const t = darkThreshold(grey, 120);
	const blocked = new Uint8Array(w * h);
	for (let i = 0; i < grey.length; i++) blocked[i] = grey[i] <= t ? 1 : 0;
	removeSmallBlobs(blocked, w, h, Math.max(6, Math.round(Math.max(w, h) * 0.025)));

	// Walls on the map count too (drawn or corrected by the organiser).
	for (const wl of walls) {
		const ax = wl.a[0] / factor;
		const ay = wl.a[1] / factor;
		const bx = wl.b[0] / factor;
		const by = wl.b[1] / factor;
		const half = Math.max(0.75, (wl.thickness * scalePxPerM) / factor / 2);
		const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half));
		const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + half));
		const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half));
		const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + half));
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (distToSegment([x + 0.5, y + 0.5], [ax, ay], [bx, by]) <= half) blocked[y * w + x] = 1;
	}

	// Seal hairline gaps from anti-aliasing with a one-cell dilation.
	const sealed = blocked.slice();
	for (let y = 1; y < h - 1; y++)
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			if (!blocked[i] && (blocked[i - 1] || blocked[i + 1] || blocked[i - w] || blocked[i + w])) sealed[i] = 1;
		}
	const dist = distanceToWalls(sealed, w, h);

	// Pick the erosion depth that separates the most rooms.
	const maxR = Math.max(3, Math.min(18, Math.round(Math.min(w, h) * 0.06)));
	let best = { r: 0, count: -1 };
	for (let r = 1; r <= maxR; r += 0.5) {
		const { sizes, border } = label(w, h, (i) => dist[i] > r);
		let count = 0;
		for (let k = 1; k < sizes.length; k++) if (sizes[k] >= 3 && !border[k]) count++;
		if (count > best.count) best = { r, count };
	}
	if (best.count <= 0) return [];

	const { labels: cores, sizes, border } = label(w, h, (i) => dist[i] > best.r);
	for (let i = 0; i < cores.length; i++) if (cores[i] && (sizes[cores[i]] < 3 || border[cores[i]])) cores[i] = 0;
	const owner = regrow(cores, sealed, w, h, best.r + 1.25);

	// Per-room statistics.
	const stats = new Map<number, { area: number; x0: number; y0: number; x1: number; y1: number; edge: boolean; start: number }>();
	for (let i = 0; i < owner.length; i++) {
		const k = owner[i];
		if (!k) continue;
		const x = i % w;
		const y = (i - x) / w;
		let s = stats.get(k);
		if (!s) stats.set(k, (s = { area: 0, x0: x, y0: y, x1: x, y1: y, edge: false, start: i }));
		s.area++;
		if (x < s.x0) s.x0 = x;
		if (x > s.x1) s.x1 = x;
		if (y < s.y0) s.y0 = y;
		if (y > s.y1) s.y1 = y;
		if (x === 0 || y === 0 || x === w - 1 || y === h - 1) s.edge = true;
	}

	const cellsPerM2 = (scalePxPerM / factor) ** 2;
	const minArea = Math.max(24, 1 * cellsPerM2, w * h * 0.0004);
	const candidates = [...stats].filter(([, s]) => {
		if (s.edge || s.area < minArea) return false;
		const bw = s.x1 - s.x0 + 1;
		const bh = s.y1 - s.y0 + 1;
		const fill = s.area / (bw * bh);
		if (fill < 0.45) return false; // branching corridors and leftover gaps between rooms
		return Math.max(bw, bh) / Math.min(bw, bh) <= 4.5; // straight corridors
	});
	const fillOf = (s: { area: number; x0: number; y0: number; x1: number; y1: number }) => s.area / ((s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1));
	// A typical room's size, from the clean rectangular ones.
	const typical = candidates.filter(([, s]) => fillOf(s) >= 0.85).map(([, s]) => s.area);
	const areas = (typical.length >= 3 ? typical : candidates.map(([, s]) => s.area)).sort((a, b) => a - b);
	const median = areas[Math.floor(areas.length / 2)] ?? 0;

	const rooms: { poly: Point[]; y: number; x: number }[] = [];
	for (const [k, s] of candidates) {
		const fill = fillOf(s);
		// Corridor pieces cut off at doorways: much smaller than a room, and usually ragged.
		if (s.area < median * 0.3 || (fill < 0.8 && s.area < median * 0.6) || (fill < 0.7 && s.area < median * 1.2)) continue;
		const px = (v: number) => Math.round(v * factor * 10) / 10;
		let poly: Point[];
		if (fill >= 0.85) {
			poly = [
				[px(s.x0), px(s.y0)],
				[px(s.x1 + 1), px(s.y0)],
				[px(s.x1 + 1), px(s.y1 + 1)],
				[px(s.x0), px(s.y1 + 1)]
			];
		} else {
			const outline = trace(owner, w, h, k, s.start);
			let eps = 1.2;
			let simple = simplify([...outline, outline[0]], eps).slice(0, -1);
			while (simple.length > 64) simple = simplify([...outline, outline[0]], (eps *= 1.5)).slice(0, -1);
			if (simple.length < 3) continue;
			poly = simple.map((p) => [px(p[0] + 0.5), px(p[1] + 0.5)] as Point);
		}
		rooms.push({ poly, y: s.y0, x: s.x0 });
	}

	// Reading order: top to bottom in bands, then left to right.
	const band = Math.max(4, Math.round(h * 0.04));
	rooms.sort((a, b) => Math.round(a.y / band) - Math.round(b.y / band) || a.x - b.x);
	void imageWidth;
	void imageHeight;
	return rooms.map((r, n) => ({
		id: newId('z'),
		type: 'room',
		name: `Room ${n + 1}`,
		polygon: r.poly,
		color: ROOM_COLOURS[n % ROOM_COLOURS.length],
		height: 0.03,
		description: ''
	}));
}

/**
 * Drops strokes outside the building: scale bars, legend boxes and title underlines
 * often look like walls. Walls that touch each other form groups (door gaps split the
 * building into several). Groups with at least a fifth of the biggest group's length
 * make up the building; small groups not fully inside its outline (plus 0.5 m) go.
 */
function keepBuilding(walls: Wall[], scalePxPerM: number): Wall[] {
	if (walls.length < 4) return walls;
	const touch = (a: Wall, b: Wall) => {
		const reach = ((a.thickness + b.thickness) / 2) * scalePxPerM + 0.3 * scalePxPerM;
		return [a.a, a.b].some((p) => distToSegment(p, b.a, b.b) <= reach) || [b.a, b.b].some((p) => distToSegment(p, a.a, a.b) <= reach);
	};
	const group = new Array(walls.length).fill(-1);
	let groups = 0;
	for (let i = 0; i < walls.length; i++) {
		if (group[i] >= 0) continue;
		const stack = [i];
		group[i] = groups;
		while (stack.length) {
			const k = stack.pop()!;
			for (let j = 0; j < walls.length; j++) {
				if (group[j] < 0 && touch(walls[k], walls[j])) {
					group[j] = groups;
					stack.push(j);
				}
			}
		}
		groups++;
	}
	const length = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
	const total = new Array(groups).fill(0);
	walls.forEach((w, i) => (total[group[i]] += length(w)));
	const biggest = Math.max(...total);
	const isBig = (g: number) => total[g] >= biggest * 0.2;
	const pts = walls.filter((_, i) => isBig(group[i])).flatMap((w) => [w.a, w.b]);
	const m = scalePxPerM * 0.5;
	const box = {
		x0: Math.min(...pts.map((p) => p[0])) - m,
		y0: Math.min(...pts.map((p) => p[1])) - m,
		x1: Math.max(...pts.map((p) => p[0])) + m,
		y1: Math.max(...pts.map((p) => p[1])) + m
	};
	const inBox = (p: Point) => p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1;
	return walls.filter((w, i) => isBig(group[i]) || (inBox(w.a) && inBox(w.b)));
}

export interface BrowserAnalysis {
	walls: Wall[];
	rooms: Zone[];
}

export async function analysePlanInBrowser(imageUrl: string, imageWidth: number, imageHeight: number, scalePxPerM: number): Promise<BrowserAnalysis> {
	const { grey, width: w, height: h, factor } = await planPixels(imageUrl, 1400);
	let walls = findWalls(grey, w, h, factor, scalePxPerM, false);
	if (walls.length < 4) {
		const lenient = findWalls(grey, w, h, factor, scalePxPerM, true);
		if (lenient.length > walls.length) walls = lenient;
	}
	walls = keepBuilding(walls, scalePxPerM);
	return { walls, rooms: await findRoomsInImage(imageUrl, imageWidth, imageHeight, scalePxPerM, walls) };
}

/** Rooms only: from the plan image plus the walls now on the map (after the organiser has fixed them). */
export function findRooms(imageUrl: string, imageWidth: number, imageHeight: number, scalePxPerM: number, walls: Wall[]) {
	return findRoomsInImage(imageUrl, imageWidth, imageHeight, scalePxPerM, walls);
}
