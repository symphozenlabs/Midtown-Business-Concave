/**
 * Reads the text inside a QR code image in the browser: the platform's
 * BarcodeDetector where it exists (Chrome on Android/macOS), otherwise jsQR.
 * Desktop Chrome on Windows has no BarcodeDetector, so jsQR does the work there.
 */
import jsQRModule from 'jsqr';

interface DetectedBarcode {
	rawValue: string;
}

interface BarcodeDetectorLike {
	detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

declare const BarcodeDetector: (new (options?: { formats?: string[] }) => BarcodeDetectorLike) | undefined;

type JsQr = (
	data: Uint8ClampedArray,
	width: number,
	height: number,
	options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
) => { data: string } | null;

/**
 * jsQR ships as CommonJS. It loads with the configuration page (not on first use),
 * and the function is looked up defensively because bundlers wrap CommonJS
 * defaults differently.
 */
function resolveJsQr(): JsQr {
	const mod: any = jsQRModule;
	for (const candidate of [mod, mod?.default, mod?.default?.default]) {
		if (typeof candidate === 'function') return candidate as JsQr;
	}
	throw new Error('The QR reader did not load. Reload the page and try again.');
}

/** Phone photos and screenshots vary in size; jsQR finds codes best at a few scales. */
const SIDES = [1200, 800, 1800, 500];

async function detectNative(bitmap: ImageBitmap): Promise<string | null> {
	if (typeof BarcodeDetector === 'undefined') return null;
	try {
		const found = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
		return found.find((f) => f.rawValue)?.rawValue ?? null;
	} catch {
		return null;
	}
}

/**
 * Reads QR codes from live camera frames for the event desks. BarcodeDetector
 * reads the video element directly; jsQR gets a frame scaled to 720px, which
 * keeps each read to a few milliseconds on mid-range phones.
 */
export function createVideoDecoder() {
	let detector: BarcodeDetectorLike | null = null;
	if (typeof BarcodeDetector !== 'undefined') {
		try {
			detector = new BarcodeDetector({ formats: ['qr_code'] });
		} catch {
			detector = null;
		}
	}
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	let jsQR: JsQr | null = null;

	return {
		/** True when the platform decoder is used (fast enough to read every frame). */
		native: detector !== null,
		async read(video: HTMLVideoElement): Promise<string | null> {
			if (!video.videoWidth) return null;
			if (detector) {
				try {
					const found = await detector.detect(video);
					return found.find((f) => f.rawValue)?.rawValue ?? null;
				} catch {
					detector = null; // fall through to jsQR from now on
				}
			}
			if (!ctx) return null;
			jsQR ??= resolveJsQr();
			const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
			const width = Math.round(video.videoWidth * scale);
			const height = Math.round(video.videoHeight * scale);
			if (canvas.width !== width) canvas.width = width;
			if (canvas.height !== height) canvas.height = height;
			ctx.drawImage(video, 0, 0, width, height);
			const { data } = ctx.getImageData(0, 0, width, height);
			return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
		}
	};
}

export async function decodeQrImage(file: Blob): Promise<string | null> {
	const bitmap = await createImageBitmap(file);
	try {
		const native = await detectNative(bitmap);
		if (native) return native;

		const jsQR = resolveJsQr();
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error('This browser cannot read images.');

		const longest = Math.max(bitmap.width, bitmap.height);
		const tried = new Set<number>();
		for (const side of SIDES) {
			const scale = Math.min(1, side / longest);
			const width = Math.max(1, Math.round(bitmap.width * scale));
			if (tried.has(width)) continue;
			tried.add(width);
			const height = Math.max(1, Math.round(bitmap.height * scale));
			canvas.width = width;
			canvas.height = height;
			// White behind transparent PNGs, so the code's light modules stay light.
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, width, height);
			ctx.drawImage(bitmap, 0, 0, width, height);
			const { data } = ctx.getImageData(0, 0, width, height);
			const result = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
			if (result?.data) return result.data;
		}
		return null;
	} finally {
		bitmap.close();
	}
}
