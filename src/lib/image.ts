const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Long side in px: enough for the 4K poster's arch (≈1140 × 1020 px) with room to zoom. */
const MAX_SIDE = 2000;

export class PhotoError extends Error {}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number) {
	const data = ctx.getImageData(0, 0, w, h).data;
	for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true;
	return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
	return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resizes to at most 2000px on the long side, keeping the aspect ratio and any
 * transparency (cut-out PNGs sit on the poster's studio backdrop).
 * Returns WebP where the browser can encode it, otherwise PNG (transparent) or JPEG.
 */
export async function preparePhoto(file: File): Promise<Blob> {
	if (!ACCEPTED.includes(file.type)) throw new PhotoError('Choose a JPG, PNG or WebP image.');
	if (file.size > MAX_INPUT_BYTES) throw new PhotoError('Choose an image under 15 MB.');

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		throw new PhotoError('We could not read that image. Try a JPG or PNG.');
	}

	const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new PhotoError('Your browser could not prepare this image.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();

	const transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, w, h);

	// Browsers that cannot encode WebP silently return PNG instead.
	let blob = await toBlob(canvas, 'image/webp', 0.9);
	if (!blob || blob.type !== 'image/webp') {
		blob = await toBlob(canvas, transparent ? 'image/png' : 'image/jpeg', 0.9);
	}
	if (!blob) throw new PhotoError('Your browser could not prepare this image.');
	return blob;
}
