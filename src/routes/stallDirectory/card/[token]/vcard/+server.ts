import { error } from '@sveltejs/kit';
import { EVENT } from '#lib/event.ts';
import { resolveStallCard } from '#lib/server/stall-directory/card.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** vCard 3.0 text value: escape \ , ; and newlines. */
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

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

/** "Save contact" on a scanned stall QR: the exhibitor's contact card as a .vcf file. */
export const GET: RequestHandler = async ({ params }) => {
	const c = await resolveStallCard(params.token);
	if (!c) error(404, 'Not found');

	const parts = c.contactName.trim().split(/\s+/);
	const last = parts.length > 1 ? parts.pop()! : '';
	const where = c.stall ? `Stall ${c.stall}` : 'Exhibitor';
	const lines = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`FN:${esc(c.contactName)}`,
		`N:${esc(last)};${esc(parts.join(' '))};;;`,
		`ORG:${esc(c.businessName)}`,
		`TITLE:${esc(`Exhibitor · ${where}`)}`,
		`TEL;TYPE=CELL:${c.phone}`,
		`EMAIL;TYPE=INTERNET:${esc(c.email)}`,
		`NOTE:${esc(`Met at ${EVENT.name} 2026 · ${where}`)}`,
		'END:VCARD'
	];

	const filename = `${c.businessName.replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-') || 'stall'}.vcf`;
	return new Response(lines.map(fold).join('\r\n') + '\r\n', {
		headers: {
			'content-type': 'text/vcard; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'private, no-store'
		}
	});
};
