/**
 * Browser-side image work for floor maps: shrink an uploaded plan to a size phones
 * can use as a 3D texture, make a smaller copy for AI analysis, and read pixels for
 * the in-browser wall detection.
 */

/** Longest side of the stored plan. 4096 is the largest texture most phones accept. */
export const MAX_PLAN_SIDE = 4096;
/** The server refuses larger uploads; plans compress well, so this is rarely reached. */
export const MAX_PLAN_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export class PlanError extends Error {}

async function isHeic(file: File) {
	if (/^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return true;
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	const ascii = String.fromCharCode(...head);
	return ascii.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii.slice(8, 12));
}

/** Loads any image the browser can show (PNG, JPG, WebP, SVG, HEIC) from a file or a URL. */
export async function loadImage(source: File | string): Promise<{ img: CanvasImageSource; width: number; height: number; close: () => void }> {
	if (source instanceof File && (await isHeic(source))) {
		try {
			const bitmap = await createImageBitmap(source);
			return { img: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
		} catch {
			const { heicTo } = await import('heic-to');
			const bitmap = (await heicTo({ blob: source, type: 'bitmap' })) as ImageBitmap;
			return { img: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
		}
	}
	const url = source instanceof File ? URL.createObjectURL(source) : source;
	const img = new Image();
	img.decoding = 'async';
	img.src = url;
	try {
		await img.decode();
	} catch {
		if (source instanceof File) URL.revokeObjectURL(url);
		throw new PlanError('This file could not be opened as an image. Use PNG, JPG, WebP or HEIC.');
	}
	// SVGs without a size report 0: give them a sensible one.
	const width = img.naturalWidth || 2000;
	const height = img.naturalHeight || 1400;
	return { img, width, height, close: () => source instanceof File && URL.revokeObjectURL(url) };
}

function draw(img: CanvasImageSource, w: number, h: number) {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new PlanError('This browser cannot process images. Try Chrome, Edge or Safari.');
	// Plans with transparent backgrounds become white, so walls stay visible in 3D.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, w, h);
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, w, h);
	return { canvas, ctx };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Shrinks the plan to at most 4096 px and under 4 MB. WebP where the browser can make it, else JPEG. */
export async function preparePlan(file: File): Promise<{ blob: Blob; width: number; height: number }> {
	if (file.size > MAX_INPUT_BYTES) throw new PlanError('That file is over 40 MB. Export the plan at a smaller size.');
	const image = await loadImage(file);
	try {
		let side = Math.min(MAX_PLAN_SIDE, Math.max(image.width, image.height));
		for (;;) {
			const k = side / Math.max(image.width, image.height);
			const w = Math.max(1, Math.round(image.width * k));
			const h = Math.max(1, Math.round(image.height * k));
			const { canvas } = draw(image.img, w, h);
			let blob = await toBlob(canvas, 'image/webp', 0.9);
			if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.9);
			if (!blob) throw new PlanError('This browser could not save the image.');
			if (blob.size <= MAX_PLAN_BYTES || side <= 1200) return { blob, width: w, height: h };
			side = Math.round(side * 0.8);
		}
	} finally {
		image.close();
	}
}

/** A copy for Claude: at most 2576 px on the long edge (its full-detail size), as base64 JPEG. */
export async function planForAi(url: string): Promise<{ base64: string; mediaType: 'image/jpeg'; width: number; height: number }> {
	const image = await loadImage(url);
	try {
		const k = Math.min(1, 2576 / Math.max(image.width, image.height));
		const w = Math.round(image.width * k);
		const h = Math.round(image.height * k);
		const { canvas } = draw(image.img, w, h);
		const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
		return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg', width: w, height: h };
	} finally {
		image.close();
	}
}

/** Greyscale pixels of the plan at a working size, for wall detection. */
export async function planPixels(url: string, maxSide: number) {
	const image = await loadImage(url);
	try {
		const k = Math.min(1, maxSide / Math.max(image.width, image.height));
		const w = Math.round(image.width * k);
		const h = Math.round(image.height * k);
		const { ctx } = draw(image.img, w, h);
		const rgba = ctx.getImageData(0, 0, w, h).data;
		const grey = new Uint8Array(w * h);
		for (let i = 0; i < grey.length; i++) grey[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
		return { grey, width: w, height: h, factor: 1 / k };
	} finally {
		image.close();
	}
}
