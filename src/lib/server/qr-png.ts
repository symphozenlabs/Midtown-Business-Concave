/**
 * QR code as a PNG, for email attachments. Uses qrcode's pure-JS encoder and a
 * small PNG writer (CompressionStream for the pixels), because qrcode's own PNG
 * renderer needs Node's fs and zlib, which Cloudflare Workers do not fully have.
 */
import * as core from 'qrcode/lib/core/qrcode.js';

interface BitMatrix {
	size: number;
	data: Uint8Array;
}

type Create = (text: string, options: { errorCorrectionLevel: string }) => { modules: BitMatrix };

/** The CommonJS export arrives as a named or a default export depending on the bundler. */
const create: Create = (core as any).create ?? (core as any).default?.create;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array) {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

async function deflate(bytes: Uint8Array) {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Black-on-white QR, `scale` pixels per module with the standard four-module quiet zone. */
export async function qrPng(text: string, scale = 10): Promise<Uint8Array> {
	const { modules } = create(text, { errorCorrectionLevel: 'M' });
	const margin = 4;
	const side = (modules.size + margin * 2) * scale;

	// 8-bit greyscale scanlines, each led by filter byte 0.
	const raw = new Uint8Array(side * (side + 1)).fill(255);
	for (let y = 0; y < side; y++) {
		raw[y * (side + 1)] = 0;
		const my = Math.floor(y / scale) - margin;
		if (my < 0 || my >= modules.size) continue;
		for (let x = 0; x < side; x++) {
			const mx = Math.floor(x / scale) - margin;
			if (mx >= 0 && mx < modules.size && modules.data[my * modules.size + mx]) raw[y * (side + 1) + 1 + x] = 0;
		}
	}

	const header = new Uint8Array(13);
	const hv = new DataView(header.buffer);
	hv.setUint32(0, side);
	hv.setUint32(4, side);
	header[8] = 8; // bit depth
	header[9] = 0; // greyscale

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', await deflate(raw)),
		chunk('IEND', new Uint8Array())
	];
	const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const p of parts) {
		png.set(p, offset);
		offset += p.length;
	}
	return png;
}
