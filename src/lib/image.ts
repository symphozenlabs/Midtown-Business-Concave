/** Types browsers report for JPG, PNG and WebP, including older Windows names. */
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/x-png', 'image/webp'];
const ACCEPTED_NAME = /\.(jpe?g|jfif|pjpeg|png|webp)$/i;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Long side in px: enough for the 4K poster's arch (≈1140 × 1020 px) with room to zoom. */
const MAX_SIDE = 2000;
/** The upload limit is 5 MB; stay under it with room for the rest of the form. */
const MAX_OUTPUT_BYTES = 4.5 * 1024 * 1024;

export const PHOTO_MESSAGES = {
	heic: 'We could not convert this iPhone (HEIC) photo. Save it as a JPG, or take a screenshot of it, and try again.',
	notImage: 'This file is not a photo we can use. Choose a JPG, PNG, WebP or iPhone HEIC photo.',
	tooLarge: 'This file is over 15 MB. Choose a smaller photo.',
	unreadable:
		'We could not open this photo. It may be damaged, very large, or in a format your browser cannot read. Try another photo, or take a screenshot of it and upload that.',
	browser: 'Your browser could not prepare this photo. Try another browser, or a smaller photo.'
} as const;

export class PhotoError extends Error {}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number) {
	const data = ctx.getImageData(0, 0, w, h).data;
	for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true;
	return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
	return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** iPhone photos (HEIC/HEIF), recognised by type, name or the "ftyp" box in the first bytes. */
async function isHeic(file: File) {
	if (/^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return true;
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	const ascii = String.fromCharCode(...head);
	return ascii.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii.slice(8, 12));
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

const fromBitmap = (bitmap: ImageBitmap): Decoded => ({
	source: bitmap,
	width: bitmap.width,
	height: bitmap.height,
	close: () => bitmap.close()
});

/**
 * iPhone HEIC photos: Safari opens them itself; other browsers need a converter,
 * loaded only now because it is large (about 3 MB).
 */
async function decodeHeic(file: File): Promise<Decoded> {
	try {
		return fromBitmap(await createImageBitmap(file, { imageOrientation: 'from-image' }));
	} catch {
		/* not Safari: convert below */
	}
	try {
		const { heicTo } = await import('heic-to');
		return fromBitmap(await heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } }));
	} catch (e) {
		console.error('[photo] HEIC conversion failed', e);
		throw new PhotoError(PHOTO_MESSAGES.heic);
	}
}

/**
 * Decodes the image the right way up. createImageBitmap is fast and handles EXIF
 * rotation; older Safari lacks it for files, and some large photos fail there, so
 * fall back to an <img> (which modern browsers also rotate from EXIF).
 */
async function decode(file: File): Promise<Decoded> {
	try {
		return fromBitmap(await createImageBitmap(file, { imageOrientation: 'from-image' }));
	} catch {
		const url = URL.createObjectURL(file);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			if (!img.naturalWidth) throw new Error('empty image');
			return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
		} catch {
			URL.revokeObjectURL(url);
			throw new PhotoError(PHOTO_MESSAGES.unreadable);
		}
	}
}

async function encode(source: CanvasImageSource, width: number, height: number, mayBeTransparent: boolean) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new PhotoError(PHOTO_MESSAGES.browser);
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(source, 0, 0, width, height);
	const transparent = mayBeTransparent && hasTransparency(ctx, width, height);

	// Browsers that cannot encode WebP (Safari) silently return PNG instead.
	let blob = await toBlob(canvas, 'image/webp', 0.9);
	if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, transparent ? 'image/png' : 'image/jpeg', 0.9);
	if (!blob) throw new PhotoError(PHOTO_MESSAGES.browser);
	return blob;
}

/**
 * Resizes to at most 2000px on the long side, keeping the aspect ratio and any
 * transparency (cut-out PNGs sit on the poster's studio backdrop), and keeps the
 * result under the upload limit. Returns WebP where the browser can encode it,
 * otherwise PNG (transparent) or JPEG.
 */
export async function preparePhoto(file: File): Promise<Blob> {
	if (file.size > MAX_INPUT_BYTES) throw new PhotoError(PHOTO_MESSAGES.tooLarge);
	const heic = await isHeic(file);
	// Many pickers report an empty or old-fashioned type for real JPG and PNG files,
	// so the name is enough too; decoding is the real test.
	const looksRight = heic || ACCEPTED_TYPES.includes(file.type.toLowerCase()) || ACCEPTED_NAME.test(file.name) || !file.type;
	if (!looksRight) throw new PhotoError(PHOTO_MESSAGES.notImage);

	const image = heic ? await decodeHeic(file) : await decode(file);
	try {
		const mayBeTransparent = !heic && !/jpe?g/i.test(file.type);
		let side = MAX_SIDE;
		for (;;) {
			const scale = Math.min(1, side / Math.max(image.width, image.height));
			const w = Math.round(image.width * scale);
			const h = Math.round(image.height * scale);
			const blob = await encode(image.source, w, h, mayBeTransparent);
			// A large transparent PNG (Safari cannot make WebP) can exceed the limit: shrink and try again.
			if (blob.size <= MAX_OUTPUT_BYTES || side <= 1000) return blob;
			side = Math.round(side * 0.75);
		}
	} finally {
		image.close();
	}
}
