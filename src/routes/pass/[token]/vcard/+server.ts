import { error } from '@sveltejs/kit';
import { opsReady } from '#lib/server/ops/event.ts';
import { passHolder } from '#lib/server/ops/networking.ts';
import { resolveToken } from '#lib/server/ops/passes.ts';
import { getObject } from '#lib/server/r2.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Photos larger than this are left out so the card stays small enough for every contacts app. */
const MAX_PHOTO_BYTES = 400 * 1024;

/** vCard 3.0 text value: escape \ , ; and newlines. */
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

function base64(bytes: Uint8Array) {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin);
}

/** Lines longer than 75 octets are folded with CRLF + space (RFC 2426). */
function fold(line: string) {
	const out: string[] = [];
	let rest = line;
	while (rest.length > 75) {
		out.push(rest.slice(0, 75));
		rest = rest.slice(75);
	}
	out.push(rest);
	return out.join('\r\n ');
}

/** "Save contact" on a scanned pass: the delegate's contact card as a .vcf file. */
export const GET: RequestHandler = async ({ params }) => {
	if (!(await opsReady())) error(404, 'Not found');
	const resolved = await resolveToken(params.token);
	if (resolved.status !== 'active') error(404, 'Not found');
	const h = await passHolder(resolved.registrationId);
	if (!h) error(404, 'Not found');

	const parts = h.fullName.trim().split(/\s+/);
	const last = parts.length > 1 ? parts.pop()! : '';
	const lines = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`FN:${esc(h.fullName)}`,
		`N:${esc(last)};${esc(parts.join(' '))};;;`,
		`ORG:${esc(h.companyName)}`,
		`TITLE:${esc(h.designation)}`,
		`TEL;TYPE=CELL:${h.phone}`,
		`EMAIL;TYPE=INTERNET:${esc(h.email)}`
	];
	if (h.linkedin) lines.push(`URL;TYPE=LinkedIn:${esc(h.linkedin)}`, `X-SOCIALPROFILE;TYPE=linkedin:${esc(h.linkedin)}`);
	if (h.website) lines.push(`URL;TYPE=WORK:${esc(h.website)}`);
	if (h.city) lines.push(`ADR;TYPE=WORK:;;;${esc(h.city)};;;`);
	lines.push(`NOTE:${esc(`Met at Midtown Business Conclave 2026 · ${h.industry}`)}`);

	if (h.photoKey) {
		const photo = await getObject(h.photoKey).catch(() => null);
		if (photo) {
			const bytes = new Uint8Array(await new Response(photo.body as BodyInit).arrayBuffer());
			const type = photo.contentType.includes('png') ? 'PNG' : photo.contentType.includes('jpeg') || photo.contentType.includes('jpg') ? 'JPEG' : null;
			if (type && bytes.length <= MAX_PHOTO_BYTES) lines.push(`PHOTO;ENCODING=b;TYPE=${type}:${base64(bytes)}`);
		}
	}
	lines.push('END:VCARD');

	const filename = `${h.fullName.replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-') || 'contact'}.vcf`;
	return new Response(lines.map(fold).join('\r\n') + '\r\n', {
		headers: {
			'content-type': 'text/vcard; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'private, no-store'
		}
	});
};
