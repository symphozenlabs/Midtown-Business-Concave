/*
 * Midtown Business Conclave — "I'm Attending" poster renderer (Canvas 2D).
 * A faithful port of the client-approved FINAL template from
 * MBC2026-IAmAttending-PosterMaker.html: the approved artwork is the base and
 * only the photo and the name-plate text change. Coordinates were measured on
 * the artwork; keep them in sync with the poster maker if it is revised.
 */

export interface PosterAssets {
	sef: HTMLImageElement;
	me: HTMLImageElement;
	mbc: HTMLImageElement;
	bgFinal: HTMLImageElement;
	archBackdrop: HTMLImageElement;
}

export interface PhotoMeta {
	cutout: boolean;
	bbox: { x: number; y: number; w: number; h: number };
}

export interface PosterState {
	name: string;
	title: string;
	company: string;
	/** `null` shows the placeholder pill, `''` hides the pill. */
	category: string | null;
	photo: HTMLImageElement | null;
	photoMeta: PhotoMeta | null;
	zoom: number;
	dx: number;
	dy: number;
}

type Ctx = CanvasRenderingContext2D;

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = 'Montserrat, "Helvetica Neue", Arial, sans-serif';

/** Fonts the template draws with; load these before the first render. */
export const POSTER_FONTS = [
	'700 italic 100px "Playfair Display"',
	'600 20px Montserrat',
	'700 20px Montserrat',
	'800 20px Montserrat'
];

const FINAL = {
	W: 1080,
	H: 1920,
	k: 1.25,
	logos: { cx: 540, y: 107, sefH: 98, meH: 79, gap: 78 },
	mbc: { cx: 540, y: 1248, w: 600 },
	// inner edge of the gold arch frame; the bottom runs under the plate
	arch: { x: 249.6, y: 464.4, w: 568.8, h: 509 },
	plate: {
		cx: 539.4,
		name: { y: 1041.6, size: 60, maxW: 600 },
		title: { y: 1082.4, size: 25, track: 6, maxW: 440, line: { y: 1071.6, len: 74, gap: 30 } },
		company: { y: 1131.6, size: 48, maxW: 600 },
		pill: { cy: 1178, h: 44.4, size: 25, track: 7, dotR: 6, dotIn: 29, pad: 50, maxW: 520 }
	}
} as const;

type Layout = typeof FINAL;
type Arch = { x: number; y: number; w: number; h: number };

export const POSTER_SIZE = { width: FINAL.W, height: FINAL.H };
/** 4K UHD story output, 2160 × 3840. */
export const POSTER_UHD_WIDTH = 2160;
/** Base-unit → screen-drag factor used by the poster maker. */
export const POSTER_K = FINAL.k;

/* ---------- utilities ---------- */

let SC = 1; // output scale: 1 = 1080 base, 2 = 4K story

function makeCanvas(w: number, h: number) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

// offscreen layer at output resolution, drawn in base (1080) coordinates
function layer(w: number, h: number): [HTMLCanvasElement, Ctx] {
	const cv = makeCanvas(Math.round(w * SC), Math.round(h * SC));
	const c = cv.getContext('2d')!;
	c.setTransform(SC, 0, 0, SC, 0, 0);
	c.imageSmoothingQuality = 'high';
	return [cv, c];
}

function free(cv: HTMLCanvasElement) {
	// release memory promptly (iOS Safari)
	cv.width = 0;
	cv.height = 0;
}

function gold(ctx: Ctx, x0: number, y0: number, x1: number, y1: number) {
	const g = ctx.createLinearGradient(x0, y0, x1, y1);
	g.addColorStop(0, '#FFF3CC');
	g.addColorStop(0.22, '#F7D07D');
	g.addColorStop(0.46, '#E0A13F');
	g.addColorStop(0.64, '#B26E1C');
	g.addColorStop(0.82, '#E9B556');
	g.addColorStop(1, '#FFE5A0');
	return g;
}

const adv = (ctx: Ctx, ch: string, sp: number) => (ch === ' ' ? sp * 1.15 : ctx.measureText(ch).width + sp);

function spacedWidth(ctx: Ctx, t: string, sp: number) {
	let w = 0;
	for (const ch of t) w += adv(ctx, ch, sp);
	return Math.max(0, w - sp);
}

function drawSpaced(ctx: Ctx, t: string, x: number, y: number, sp: number, align: 'left' | 'center' | 'right') {
	const w = spacedWidth(ctx, t, sp);
	let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
	const prev = ctx.textAlign;
	ctx.textAlign = 'left';
	for (const ch of t) {
		if (ch !== ' ') ctx.fillText(ch, cx, y);
		cx += adv(ctx, ch, sp);
	}
	ctx.textAlign = prev;
	return w;
}

function fitFont(
	ctx: Ctx,
	text: string,
	fontFn: (s: number) => string,
	maxW: number,
	maxSize: number,
	minSize: number,
	sp?: number
) {
	let s = maxSize;
	for (; s > minSize; s -= 1) {
		ctx.font = fontFn(s);
		const w = sp ? spacedWidth(ctx, text, (sp * s) / maxSize) : ctx.measureText(text).width;
		if (w <= maxW) break;
	}
	ctx.font = fontFn(s);
	return s;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// Arch: flat bottom, semicircular top.
function archPath(ctx: Ctx, a: Arch, grow = 0) {
	const x = a.x - grow,
		y = a.y - grow,
		w = a.w + 2 * grow,
		h = a.h + 2 * grow,
		r = w / 2;
	ctx.beginPath();
	ctx.moveTo(x, y + h);
	ctx.lineTo(x, y + r);
	ctx.arc(x + r, y + r, r, Math.PI, 2 * Math.PI);
	ctx.lineTo(x + w, y + h);
	ctx.closePath();
}

/* ---------- blocks ---------- */

function drawPlaceholder(ctx: Ctx, L: Layout) {
	const a = L.arch,
		r = a.w / 2,
		cx = a.x + r;
	const hy = a.y + r * 0.74,
		hr = r * 0.31;
	ctx.save();
	const g = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
	g.addColorStop(0, 'rgba(24,18,14,0.82)');
	g.addColorStop(1, 'rgba(10,8,8,0.95)');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, hy, hr, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(cx - r * 0.95, a.y + a.h);
	ctx.bezierCurveTo(cx - r * 0.95, hy + hr * 1.6, cx - r * 0.55, hy + hr * 1.35, cx - hr * 0.55, hy + hr * 1.12);
	ctx.lineTo(cx + hr * 0.55, hy + hr * 1.12);
	ctx.bezierCurveTo(cx + r * 0.55, hy + hr * 1.35, cx + r * 0.95, hy + hr * 1.6, cx + r * 0.95, a.y + a.h);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,214,140,0.55)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(cx, hy, hr, Math.PI * 1.05, Math.PI * 1.95);
	ctx.stroke();
	ctx.fillStyle = 'rgba(255,226,170,0.7)';
	ctx.font = `600 ${13 * L.k}px ${SANS}`;
	drawSpaced(ctx, 'YOUR PHOTO HERE', cx, hy + hr * 2.1, 4 * L.k, 'center');
	ctx.restore();
}

function drawLogos(ctx: Ctx, L: Layout, A: PosterAssets) {
	const c = L.logos;
	const sefW = (c.sefH * A.sef.width) / A.sef.height;
	const meW = (c.meH * A.me.width) / A.me.height;
	const gap = c.gap;
	const total = sefW + gap + meW;
	const x0 = c.cx - total / 2;
	ctx.drawImage(A.sef, x0, c.y, sefW, c.sefH);
	ctx.save();
	const dx = x0 + sefW + gap / 2;
	const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.sefH);
	g.addColorStop(0, 'rgba(240,190,100,0)');
	g.addColorStop(0.5, 'rgba(240,190,100,0.9)');
	g.addColorStop(1, 'rgba(240,190,100,0)');
	ctx.fillStyle = g;
	ctx.fillRect(dx - 0.75, c.y, 1.5, c.sefH);
	ctx.restore();
	ctx.drawImage(A.me, x0 + sefW + gap, c.y + (c.sefH - c.meH) / 2, meW, c.meH);
}

function drawMBC(ctx: Ctx, L: Layout, A: PosterAssets) {
	const m = L.mbc;
	const h = (m.w * A.mbc.height) / A.mbc.width;
	const x = m.cx - m.w / 2;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.6)';
	ctx.shadowBlur = 30 * SC;
	ctx.shadowOffsetY = 10 * SC;
	ctx.drawImage(A.mbc, x, m.y, m.w, h);
	ctx.restore();
}

function drawFinalArch(ctx: Ctx, L: Layout, st: PosterState, A: PosterAssets) {
	const a = L.arch;
	ctx.save();
	archPath(ctx, a, -0.6);
	ctx.clip();
	const cutout = !!(st.photo && st.photoMeta && st.photoMeta.cutout);
	if (!st.photo || cutout) ctx.drawImage(A.archBackdrop, a.x, a.y, a.w, a.h + 6);
	if (st.photo) {
		const m = st.photoMeta;
		const [pc, q] = layer(L.W, L.H);
		let pl: { x: number; y: number; w: number; h: number };
		if (cutout && m) {
			const s = ((a.w * 1.2) / m.bbox.w) * (st.zoom || 1);
			const w = st.photo.width * s,
				h = st.photo.height * s;
			pl = {
				w,
				h,
				x: a.x + a.w / 2 - (m.bbox.x + m.bbox.w / 2) * s + (st.dx || 0) * L.k,
				y: a.y + a.h * 0.08 - m.bbox.y * s + (st.dy || 0) * L.k
			};
		} else {
			const s = Math.max(a.w / st.photo.width, a.h / st.photo.height) * (st.zoom || 1);
			const w = st.photo.width * s,
				h = st.photo.height * s;
			pl = { w, h, x: a.x + (a.w - w) / 2 + (st.dx || 0) * L.k, y: a.y + (st.dy || 0) * L.k };
		}
		q.filter = 'brightness(1.05) contrast(1.04) saturate(1.05)';
		q.drawImage(st.photo, pl.x, pl.y, pl.w, pl.h);
		q.filter = 'none';
		q.globalCompositeOperation = 'screen';
		q.globalAlpha = 0.1;
		q.drawImage(st.photo, pl.x, pl.y, pl.w, pl.h);
		q.globalAlpha = 1;
		q.globalCompositeOperation = 'source-over';
		if (cutout) {
			ctx.shadowColor = 'rgba(0,0,0,0.45)';
			ctx.shadowBlur = 20 * SC;
		}
		ctx.drawImage(pc, 0, 0, L.W, L.H);
		ctx.shadowColor = 'transparent';
		free(pc);
	} else {
		drawPlaceholder(ctx, L);
	}
	ctx.restore();
}

function drawFinalPlate(ctx: Ctx, L: Layout, st: PosterState) {
	const P = L.plate,
		cx = P.cx;
	const name = (st.name || 'Your Name').trim();
	const title = (st.title || 'Designation').trim().toUpperCase();
	const company = (st.company || 'Company Name').trim();
	const cat = (st.category == null ? 'Business Category' : st.category).trim().toUpperCase();
	ctx.save();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	if (!cat) ctx.translate(0, 24); // no category pill: settle the three lines a little lower

	// name — white, bold sans
	fitFont(ctx, name, (s) => `800 ${s}px ${SANS}`, P.name.maxW, P.name.size, 24);
	ctx.fillStyle = '#FFFFFF';
	ctx.shadowColor = 'rgba(0,0,0,0.55)';
	ctx.shadowBlur = 6 * SC;
	ctx.shadowOffsetY = 2 * SC;
	ctx.fillText(name, cx, P.name.y);
	ctx.shadowColor = 'transparent';
	ctx.shadowOffsetY = 0;

	// designation — gold spaced caps with a line either side
	const ts = fitFont(ctx, title, (s) => `700 ${s}px ${SANS}`, P.title.maxW, P.title.size, 12, P.title.track);
	const sp = (P.title.track * ts) / P.title.size;
	ctx.fillStyle = gold(ctx, cx - 220, 0, cx + 220, 0);
	const tw = drawSpaced(ctx, title, cx, P.title.y, sp, 'center');
	const ln = P.title.line,
		ly = ln.y;
	const lg = ctx.createLinearGradient(cx - tw / 2 - ln.gap - ln.len, 0, cx - tw / 2 - ln.gap, 0);
	lg.addColorStop(0, 'rgba(236,190,110,0.15)');
	lg.addColorStop(1, 'rgba(236,190,110,0.95)');
	ctx.fillStyle = lg;
	ctx.fillRect(cx - tw / 2 - ln.gap - ln.len, ly, ln.len, 2);
	const rg = ctx.createLinearGradient(cx + tw / 2 + ln.gap, 0, cx + tw / 2 + ln.gap + ln.len, 0);
	rg.addColorStop(0, 'rgba(236,190,110,0.95)');
	rg.addColorStop(1, 'rgba(236,190,110,0.15)');
	ctx.fillStyle = rg;
	ctx.fillRect(cx + tw / 2 + ln.gap, ly, ln.len, 2);

	// company — white italic serif
	fitFont(ctx, company, (s) => `italic 700 ${s}px ${SERIF}`, P.company.maxW, P.company.size, 18);
	ctx.fillStyle = '#FFFFFF';
	ctx.shadowColor = 'rgba(0,0,0,0.5)';
	ctx.shadowBlur = 5 * SC;
	ctx.shadowOffsetY = 2 * SC;
	ctx.fillText(company, cx, P.company.y);
	ctx.shadowColor = 'transparent';
	ctx.shadowOffsetY = 0;

	// category pill — gold outline, warm dark fill, a dot at each end
	if (cat) {
		const pl = P.pill;
		const ps = fitFont(ctx, cat, (s) => `600 ${s}px ${SANS}`, pl.maxW, pl.size, 11, pl.track);
		const psp = (pl.track * ps) / pl.size;
		const cw = spacedWidth(ctx, cat, psp);
		const w = cw + pl.pad * 2,
			h = pl.h,
			x = cx - w / 2,
			y = pl.cy - h / 2;
		roundRect(ctx, x, y, w, h, h / 2);
		ctx.fillStyle = 'rgba(36,28,18,0.96)';
		ctx.fill();
		ctx.lineWidth = 1.8;
		ctx.strokeStyle = gold(ctx, x, y, x + w, y + h);
		ctx.stroke();
		ctx.fillStyle = gold(ctx, x, y, x + w, y + h);
		ctx.beginPath();
		ctx.arc(x + pl.dotIn, pl.cy, pl.dotR, 0, Math.PI * 2);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(x + w - pl.dotIn, pl.cy, pl.dotR, 0, Math.PI * 2);
		ctx.fill();
		ctx.textBaseline = 'middle';
		drawSpaced(ctx, cat, cx, pl.cy + 1, psp, 'center');
		ctx.textBaseline = 'alphabetic';
	}
	ctx.restore();
}

/* ---------- main ---------- */

/** Draws the poster onto `canvas`; `width` is the output pixel width (1080 preview, 2160 for 4K). */
export function renderPoster(canvas: HTMLCanvasElement, st: PosterState, A: PosterAssets, width: number = FINAL.W) {
	const L = FINAL;
	SC = width / L.W;
	canvas.width = Math.round(L.W * SC);
	canvas.height = Math.round(L.H * SC);
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(SC, 0, 0, SC, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.textBaseline = 'alphabetic';

	ctx.fillStyle = '#070B16';
	ctx.fillRect(0, 0, L.W, L.H);
	ctx.drawImage(A.bgFinal, 0, 0, L.W, L.H);
	drawLogos(ctx, L, A);
	drawFinalArch(ctx, L, st, A);
	drawFinalPlate(ctx, L, st);
	drawMBC(ctx, L, A);
	return canvas;
}

/** Does the image have a transparent background, and where is the subject? */
export function analysePhoto(img: HTMLImageElement): PhotoMeta {
	const S = 360,
		sc = Math.min(1, S / Math.max(img.width, img.height));
	const w = Math.max(1, Math.round(img.width * sc)),
		h = Math.max(1, Math.round(img.height * sc));
	const c = makeCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
	c.drawImage(img, 0, 0, w, h);
	const d = c.getImageData(0, 0, w, h).data;
	let clear = 0,
		minX = w,
		minY = h,
		maxX = -1,
		maxY = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const a = d[(y * w + x) * 4 + 3];
			if (a < 16) clear++;
			if (a > 60) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	const cutout = clear / (w * h) > 0.06 && maxX > minX;
	return {
		cutout,
		bbox: cutout
			? { x: minX / sc, y: minY / sc, w: (maxX - minX + 1) / sc, h: (maxY - minY + 1) / sc }
			: { x: 0, y: 0, w: img.width, h: img.height }
	};
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

let assetsPromise: Promise<PosterAssets> | null = null;

/** Loads the artwork and fonts once per page. */
export function loadPosterAssets(): Promise<PosterAssets> {
	assetsPromise ??= (async () => {
		const names = ['sef', 'me', 'mbc', 'bgFinal', 'archBackdrop'] as const;
		const [images] = await Promise.all([
			Promise.all(names.map((n) => loadImage(`/poster/${n}.webp`))),
			Promise.all(POSTER_FONTS.map((f) => document.fonts.load(f)))
		]);
		return Object.fromEntries(names.map((n, i) => [n, images[i]])) as unknown as PosterAssets;
	})();
	return assetsPromise;
}

export { loadImage };

export interface PosterFileInput {
	name: string;
	title: string;
	company: string;
	category: string;
	photoUrl: string | null;
	zoom: number;
	dx: number;
	dy: number;
}

/** Renders the finished poster as a 4K JPEG, for upload with the registration. */
export async function renderPosterFile(input: PosterFileInput, width = POSTER_UHD_WIDTH): Promise<Blob> {
	const assets = await loadPosterAssets();
	const photo = input.photoUrl ? await loadImage(input.photoUrl) : null;
	const canvas = document.createElement('canvas');
	renderPoster(
		canvas,
		{
			name: input.name,
			title: input.title,
			company: input.company,
			category: input.category,
			photo,
			photoMeta: photo ? analysePhoto(photo) : null,
			zoom: input.zoom,
			dx: input.dx,
			dy: input.dy
		},
		assets,
		width
	);
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
	canvas.width = 0;
	canvas.height = 0;
	if (!blob) throw new Error('Could not create the poster image');
	return blob;
}
