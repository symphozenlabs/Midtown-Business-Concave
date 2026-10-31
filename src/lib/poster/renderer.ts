/*
 * Midtown Business Conclave — "I'm Attending" poster renderer (Canvas 2D).
 * A faithful port of the client-approved FINAL template from
 * MBC2026-IAmAttending-PosterMaker.html: the approved artwork is the base and
 * only the photo and the name-plate text change. Coordinates were measured on
 * the artwork; keep them in sync with the poster maker if it is revised.
 */

import { DEFAULT_EVENT, eventLabels, type EventSettings } from '#lib/event-settings.ts';

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
	/** The schedule from Event setup; the strip shows it when it differs from the artwork's. */
	event?: EventSettings | null;
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

type Placement = { x: number; y: number; w: number; h: number };

/** Where the photo sits before any drag limit, in base (1080) units. */
function rawPlacement(L: Layout, st: PosterState, photo: HTMLImageElement): Placement & { s: number } {
	const a = L.arch,
		m = st.photoMeta;
	if (m?.cutout) {
		const s = ((a.w * 1.2) / m.bbox.w) * (st.zoom || 1);
		return {
			s,
			w: photo.width * s,
			h: photo.height * s,
			x: a.x + a.w / 2 - (m.bbox.x + m.bbox.w / 2) * s + (st.dx || 0) * L.k,
			y: a.y + a.h * 0.08 - m.bbox.y * s + (st.dy || 0) * L.k
		};
	}
	const s = Math.max(a.w / photo.width, a.h / photo.height) * (st.zoom || 1);
	const w = photo.width * s,
		h = photo.height * s;
	return { s, w, h, x: a.x + (a.w - w) / 2 + (st.dx || 0) * L.k, y: a.y + (st.dy || 0) * L.k };
}

/**
 * Where the photo sits on the card after the delegate's zoom and drag, kept over
 * the arch: a photo (or a cut-out's subject) larger than the arch always covers it,
 * a smaller one stays inside it. Without this a drag could push the photo right out
 * and the card went out with an empty arch.
 */
function photoPlacement(L: Layout, st: PosterState, photo: HTMLImageElement): Placement {
	const a = L.arch;
	const p = rawPlacement(L, st, photo);
	const box = st.photoMeta?.cutout ? st.photoMeta.bbox : { x: 0, y: 0, w: photo.width, h: photo.height };
	// The part that must stay put: the whole photo, or a cut-out's subject.
	const sx = p.x + box.x * p.s,
		sy = p.y + box.y * p.s,
		sw = box.w * p.s,
		sh = box.h * p.s;
	const fit = (pos: number, size: number, start: number, span: number) =>
		size >= span ? Math.min(start, Math.max(start + span - size, pos)) : Math.max(start, Math.min(start + span - size, pos));
	return { w: p.w, h: p.h, x: p.x + (fit(sx, sw, a.x, a.w) - sx), y: p.y + (fit(sy, sh, a.y, a.h) - sy) };
}

/**
 * The drag offsets after that limit, in the poster maker's units, so a drag stops
 * at the edge instead of running on past it.
 */
export function limitFraming(st: PosterState): { dx: number; dy: number } {
	if (!st.photo) return { dx: st.dx, dy: st.dy };
	const raw = rawPlacement(FINAL, st, st.photo);
	const kept = photoPlacement(FINAL, st, st.photo);
	return {
		dx: Math.round((st.dx || 0) + (kept.x - raw.x) / FINAL.k),
		dy: Math.round((st.dy || 0) + (kept.y - raw.y) / FINAL.k)
	};
}

/**
 * Framing saved from a runaway drag sits exactly at the stored limits (±260, ±360);
 * redrawing such a card starts from the centre instead.
 */
export function isRunawayFraming(f: { dx: number; dy: number }) {
	return Math.abs(f.dx) >= 260 || Math.abs(f.dy) >= 360;
}

function drawFinalArch(ctx: Ctx, L: Layout, st: PosterState, A: PosterAssets) {
	const a = L.arch;
	ctx.save();
	archPath(ctx, a, -0.6);
	ctx.clip();
	const cutout = !!(st.photo && st.photoMeta && st.photoMeta.cutout);
	if (!st.photo || cutout) ctx.drawImage(A.archBackdrop, a.x, a.y, a.w, a.h + 6);
	if (st.photo) {
		// Drawn straight onto the card. A second full-size 4K layer doubled the canvas
		// memory, and iPhone Safari silently leaves a canvas blank past its limit: the
		// card then went out with an empty arch.
		const pl = photoPlacement(L, st, st.photo);
		ctx.save();
		if (cutout) {
			ctx.shadowColor = 'rgba(0,0,0,0.45)';
			ctx.shadowBlur = 20 * SC;
		}
		ctx.filter = 'brightness(1.05) contrast(1.04) saturate(1.05)';
		ctx.drawImage(st.photo, pl.x, pl.y, pl.w, pl.h);
		ctx.restore();
		ctx.save();
		ctx.globalCompositeOperation = 'screen';
		ctx.globalAlpha = 0.1;
		ctx.drawImage(st.photo, pl.x, pl.y, pl.w, pl.h);
		ctx.restore();
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
/*
 * The date and time in the artwork's bottom strip ("SAT, 28 NOV 2026", "10 AM – 6 PM")
 * are part of the approved image. When the organisers set a different schedule in
 * Event setup, those two values are painted over (rebuilding the navy panel behind
 * them from the rows just above and below) and written again in the same style.
 * The approved schedule leaves the artwork untouched.
 */
const SCHEDULE = {
	// Base (1080) units, measured on bgFinal: the clear area around each value.
	date: { x: 157.5, w: 215, text: 161.5 },
	time: { x: 482.5, w: 212, text: 486.5 },
	y: 1699,
	h: 27,
	baseline: 1720,
	size: 23,
	maxW: 205
} as const;

const ARTWORK_SCHEDULE = eventLabels(DEFAULT_EVENT);

/** Rebuilds the panel behind a value by blending the clean rows above and below it. */
function repaintPanel(ctx: Ctx, x: number, w: number) {
	const X = Math.round(x * SC),
		Y = Math.round(SCHEDULE.y * SC),
		W = Math.round(w * SC),
		H = Math.round(SCHEDULE.h * SC);
	const top = ctx.getImageData(X, Y - 1, W, 1).data;
	const bottom = ctx.getImageData(X, Y + H, W, 1).data;
	const patch = ctx.createImageData(W, H);
	for (let j = 0; j < H; j++) {
		const t = (j + 1) / (H + 1);
		for (let i = 0; i < W; i++) {
			const k = i * 4,
				o = (j * W + i) * 4;
			patch.data[o] = top[k] + (bottom[k] - top[k]) * t;
			patch.data[o + 1] = top[k + 1] + (bottom[k + 1] - top[k + 1]) * t;
			patch.data[o + 2] = top[k + 2] + (bottom[k + 2] - top[k + 2]) * t;
			patch.data[o + 3] = 255;
		}
	}
	ctx.putImageData(patch, X, Y);
}

function drawScheduleValue(ctx: Ctx, text: string, x: number) {
	ctx.save();
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	fitFont(ctx, text, (s) => `600 ${s}px ${SANS}`, SCHEDULE.maxW, SCHEDULE.size, 14);
	ctx.fillStyle = '#F4F1EA';
	ctx.fillText(text, x, SCHEDULE.baseline);
	ctx.restore();
}

function drawSchedule(ctx: Ctx, event: EventSettings | null) {
	if (!event) return;
	const now = eventLabels(event);
	if (now.compactDate !== ARTWORK_SCHEDULE.compactDate) {
		repaintPanel(ctx, SCHEDULE.date.x, SCHEDULE.date.w);
		drawScheduleValue(ctx, now.compactDate.toUpperCase(), SCHEDULE.date.text);
	}
	if (now.compactTime !== ARTWORK_SCHEDULE.compactTime) {
		repaintPanel(ctx, SCHEDULE.time.x, SCHEDULE.time.w);
		drawScheduleValue(ctx, now.compactTime.toUpperCase(), SCHEDULE.time.text);
	}
}

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
	drawSchedule(ctx, st.event ?? null);
	drawLogos(ctx, L, A);
	drawFinalArch(ctx, L, st, A);
	drawFinalPlate(ctx, L, st);
	drawMBC(ctx, L, A);
	return canvas;
}

/* ---------- ID card back ---------- */

/*
 * The back of the delegate's ID card, made when the organisers confirm payment.
 * Same size, artwork, logos, fonts and gold as the front, so the two read as one
 * card; a navy panel over the middle carries the event QR (gate, halls, meals,
 * certificate, networking) and the registration number. The name, photo and
 * designation are on the front only.
 */
export interface BackState {
	code: string;
	/** The pass QR, already drawn at any size; scaled into the white card. */
	qr: CanvasImageSource;
}

const BACK = {
	panel: { x: 92, y: 236, w: 896, h: 1328, r: 40 },
	mbc: { cx: 540, y: 276, w: 430 },
	eyebrow: { y: 520, size: 26, track: 9, line: { len: 70, gap: 26 } },
	qr: { cx: 540, y: 584, card: 600, pad: 40 },
	code: { cy: 1302, h: 58, size: 30, track: 7, pad: 52 },
	scan: { y: 1408, size: 18, track: 5 },
	note: { y: 1454, size: 20 }
} as const;

function drawEyebrow(ctx: Ctx, text: string, cx: number, y: number, size: number, track: number, ln: { len: number; gap: number }) {
	ctx.font = `700 ${size}px ${SANS}`;
	ctx.fillStyle = gold(ctx, cx - 240, 0, cx + 240, 0);
	const w = drawSpaced(ctx, text, cx, y, track, 'center');
	const ly = y - size * 0.36;
	const left = ctx.createLinearGradient(cx - w / 2 - ln.gap - ln.len, 0, cx - w / 2 - ln.gap, 0);
	left.addColorStop(0, 'rgba(236,190,110,0.1)');
	left.addColorStop(1, 'rgba(236,190,110,0.95)');
	ctx.fillStyle = left;
	ctx.fillRect(cx - w / 2 - ln.gap - ln.len, ly, ln.len, 2);
	const right = ctx.createLinearGradient(cx + w / 2 + ln.gap, 0, cx + w / 2 + ln.gap + ln.len, 0);
	right.addColorStop(0, 'rgba(236,190,110,0.95)');
	right.addColorStop(1, 'rgba(236,190,110,0.1)');
	ctx.fillStyle = right;
	ctx.fillRect(cx + w / 2 + ln.gap, ly, ln.len, 2);
}

function drawBackPanel(ctx: Ctx) {
	const p = BACK.panel;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.55)';
	ctx.shadowBlur = 40 * SC;
	ctx.shadowOffsetY = 12 * SC;
	roundRect(ctx, p.x, p.y, p.w, p.h, p.r);
	const fill = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
	fill.addColorStop(0, '#0d1834');
	fill.addColorStop(0.55, '#08101f');
	fill.addColorStop(1, '#050913');
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.restore();

	// a warm glow behind the QR, like the light in the front's arch
	ctx.save();
	roundRect(ctx, p.x, p.y, p.w, p.h, p.r);
	ctx.clip();
	const glow = ctx.createRadialGradient(540, 800, 40, 540, 800, 520);
	glow.addColorStop(0, 'rgba(227,176,75,0.22)');
	glow.addColorStop(1, 'rgba(227,176,75,0)');
	ctx.fillStyle = glow;
	ctx.fillRect(p.x, p.y, p.w, p.h);
	ctx.restore();

	roundRect(ctx, p.x, p.y, p.w, p.h, p.r);
	ctx.lineWidth = 3;
	ctx.strokeStyle = gold(ctx, p.x, p.y, p.x + p.w, p.y + p.h);
	ctx.stroke();
	roundRect(ctx, p.x + 12, p.y + 12, p.w - 24, p.h - 24, p.r - 10);
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(236,190,110,0.28)';
	ctx.stroke();
}

function drawBackQr(ctx: Ctx, qr: CanvasImageSource) {
	const q = BACK.qr;
	const x = q.cx - q.card / 2,
		y = q.y;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.45)';
	ctx.shadowBlur = 24 * SC;
	ctx.shadowOffsetY = 8 * SC;
	roundRect(ctx, x, y, q.card, q.card, 28);
	ctx.fillStyle = '#FFFFFF';
	ctx.fill();
	ctx.restore();

	// gold corner brackets just outside the card
	const o = 16,
		len = 74;
	ctx.save();
	ctx.lineWidth = 6;
	ctx.lineCap = 'round';
	ctx.strokeStyle = gold(ctx, x, y, x + q.card, y + q.card);
	const corners: [number, number, number, number][] = [
		[x - o, y - o, 1, 1],
		[x + q.card + o, y - o, -1, 1],
		[x - o, y + q.card + o, 1, -1],
		[x + q.card + o, y + q.card + o, -1, -1]
	];
	for (const [cx, cy, sx, sy] of corners) {
		ctx.beginPath();
		ctx.moveTo(cx + sx * len, cy);
		ctx.lineTo(cx + sx * 18, cy);
		ctx.quadraticCurveTo(cx, cy, cx, cy + sy * 18);
		ctx.lineTo(cx, cy + sy * len);
		ctx.stroke();
	}
	ctx.restore();

	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(qr, x + q.pad, y + q.pad, q.card - q.pad * 2, q.card - q.pad * 2);
	ctx.imageSmoothingEnabled = true;
}

function drawBackDetails(ctx: Ctx, st: BackState) {
	const B = BACK,
		cx = 540;
	ctx.save();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	// registration number in the front's category-pill style
	const c = B.code;
	ctx.font = `700 ${c.size}px ${SANS}`;
	const cw = spacedWidth(ctx, st.code, c.track);
	const w = cw + c.pad * 2,
		x = cx - w / 2,
		y = c.cy - c.h / 2;
	roundRect(ctx, x, y, w, c.h, c.h / 2);
	ctx.fillStyle = 'rgba(36,28,18,0.96)';
	ctx.fill();
	ctx.lineWidth = 1.8;
	ctx.strokeStyle = gold(ctx, x, y, x + w, y + c.h);
	ctx.stroke();
	ctx.fillStyle = gold(ctx, x, y, x + w, y + c.h);
	ctx.textBaseline = 'middle';
	drawSpaced(ctx, st.code, cx, c.cy + 1, c.track, 'center');
	ctx.textBaseline = 'alphabetic';

	ctx.font = `600 ${B.scan.size}px ${SANS}`;
	ctx.fillStyle = 'rgba(247,208,125,0.9)';
	drawSpaced(ctx, 'SCAN AT GATE · HALLS · MEALS · CERTIFICATE · NETWORKING', cx, B.scan.y, B.scan.track, 'center');

	ctx.font = `600 ${B.note.size}px ${SANS}`;
	ctx.fillStyle = 'rgba(255,255,255,0.62)';
	ctx.fillText('One personal QR for the whole day. Please do not share it.', cx, B.note.y);
	ctx.restore();
}

/** Draws the ID card back onto `canvas`; `width` is the output pixel width (1080 preview, 2160 for 4K). */
export function renderBack(canvas: HTMLCanvasElement, st: BackState, A: PosterAssets, width: number = FINAL.W) {
	const L = FINAL;
	SC = width / L.W;
	canvas.width = Math.round(L.W * SC);
	canvas.height = Math.round(L.H * SC);
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(SC, 0, 0, SC, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';

	ctx.fillStyle = '#070B16';
	ctx.fillRect(0, 0, L.W, L.H);
	ctx.drawImage(A.bgFinal, 0, 0, L.W, L.H);
	drawLogos(ctx, L, A);
	drawBackPanel(ctx);

	const m = BACK.mbc;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.6)';
	ctx.shadowBlur = 24 * SC;
	ctx.shadowOffsetY = 8 * SC;
	ctx.drawImage(A.mbc, m.cx - m.w / 2, m.y, m.w, (m.w * A.mbc.height) / A.mbc.width);
	ctx.restore();

	const e = BACK.eyebrow;
	ctx.save();
	ctx.textBaseline = 'alphabetic';
	drawEyebrow(ctx, 'DELEGATE PASS', 540, e.y, e.size, e.track, e.line);
	ctx.restore();

	drawBackQr(ctx, st.qr);
	drawBackDetails(ctx, st);
	return canvas;
}

export interface BackFileInput {
	code: string;
	/** What the QR encodes: the delegate's pass link. */
	qrText: string;
}

/** Renders the ID card back as a 4K JPEG, the same size as the front. */
export async function renderBackFile(input: BackFileInput, width = POSTER_UHD_WIDTH): Promise<Blob> {
	const [assets, QRCode] = await Promise.all([loadPosterAssets(), import('qrcode').then((m) => m.default ?? m)]);
	const qr = document.createElement('canvas');
	await QRCode.toCanvas(qr, input.qrText, {
		errorCorrectionLevel: 'M',
		margin: 0,
		width: 1024,
		color: { dark: '#0b1430', light: '#ffffff' }
	});
	const canvas = document.createElement('canvas');
	renderBack(canvas, { code: input.code, qr }, assets, width);
	const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
	canvas.width = 0;
	canvas.height = 0;
	qr.width = 0;
	if (!blob) throw new Error('Could not create the ID card back');
	return blob;
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
	/** The schedule from Event setup, shown in the bottom strip. */
	event?: EventSettings | null;
}

/** The poster could not be drawn properly; the message is meant for the delegate. */
export class PosterError extends Error {}

/**
 * Did the photo really land in the arch? Compares a thumbnail of the arch on the
 * finished card with the photo drawn on its own in the same place. A browser that
 * ran out of canvas memory leaves the arch showing only the background.
 */
function photoLooksDrawn(canvas: HTMLCanvasElement, st: PosterState, photo: HTMLImageElement) {
	const L = FINAL,
		a = L.arch;
	const out = canvas.width / L.W;
	const N = 32,
		H = Math.round((N * a.h) / a.w),
		f = N / a.w;
	const small = () => {
		const c = makeCanvas(N, H).getContext('2d', { willReadFrequently: true })!;
		return c;
	};
	const got = small();
	got.drawImage(canvas, a.x * out, a.y * out, a.w * out, a.h * out, 0, 0, N, H);
	const want = small();
	const pl = photoPlacement(L, st, photo);
	want.drawImage(photo, (pl.x - a.x) * f, (pl.y - a.y) * f, pl.w * f, pl.h * f);
	// Only compare inside the arch (its top is rounded), a little in from the edge.
	const mask = small();
	mask.setTransform(f, 0, 0, f, -a.x * f, -a.y * f);
	archPath(mask, a, -6);
	mask.fill();

	const g = got.getImageData(0, 0, N, H).data,
		w = want.getImageData(0, 0, N, H).data,
		m = mask.getImageData(0, 0, N, H).data;
	let diff = 0,
		count = 0;
	for (let i = 0; i < g.length; i += 4) {
		if (m[i + 3] < 250 || w[i + 3] < 220) continue; // outside the arch, or a cut-out's clear area
		diff += Math.abs(g[i] - w[i]) + Math.abs(g[i + 1] - w[i + 1]) + Math.abs(g[i + 2] - w[i + 2]);
		count++;
	}
	if (count < 40) return true; // too little of the photo shows to judge
	return diff / (count * 3) < 32;
}

/** Fallback output width when the 4K card cannot be drawn (low canvas memory, e.g. older iPhones). */
const POSTER_FALLBACK_WIDTH = 1080;

/**
 * Renders the finished poster as a 4K JPEG, for upload with the registration.
 * Checks the photo made it onto the card; if not, tries once more at a smaller
 * size, and refuses rather than send a card with an empty arch.
 */
export async function renderPosterFile(input: PosterFileInput, width = POSTER_UHD_WIDTH): Promise<Blob> {
	const assets = await loadPosterAssets();
	const photo = input.photoUrl ? await loadImage(input.photoUrl) : null;
	const state: PosterState = {
		name: input.name,
		title: input.title,
		company: input.company,
		category: input.category,
		photo,
		photoMeta: photo ? analysePhoto(photo) : null,
		zoom: input.zoom,
		dx: input.dx,
		dy: input.dy,
		event: input.event ?? null
	};
	for (const w of [...new Set([width, POSTER_FALLBACK_WIDTH])]) {
		const canvas = document.createElement('canvas');
		try {
			renderPoster(canvas, state, assets, w);
			if (photo && !photoLooksDrawn(canvas, state, photo)) {
				console.warn(`[poster] photo missing from the ${w}px card; trying smaller`);
				continue;
			}
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
			if (blob) return blob;
		} finally {
			// release memory promptly (iOS Safari)
			canvas.width = 0;
			canvas.height = 0;
		}
	}
	throw new PosterError(
		'Your ID card could not be drawn with your photo on this device. Close other tabs and try again, or register from another browser or a computer.'
	);
}
