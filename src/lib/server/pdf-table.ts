/*
 * A table as an A4 landscape PDF: a title block, a header row repeated on every page,
 * cells that wrap to a few lines, and "Page n of N". No dependency: it writes the PDF
 * by hand with the built-in Helvetica fonts, so text is limited to Western (Latin-1)
 * characters; anything else prints as "?".
 */

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 36;
const FONT_SIZE = 8;
const LINE = 10;
const PAD = 4;
const MAX_LINES = 4;

// Helvetica advance widths (per 1000 em) for ASCII 32–126, from the standard AFM.
// prettier-ignore
const WIDTHS = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
	556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
	1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
	667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
	333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
	556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

/** Unicode punctuation WinAnsi has at other code points, or spells out. */
const SWAP: Record<string, string> = {
	'‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '•': '\x95', '–': '\x96', '—': '\x97', '…': '\x85', '€': '\x80', '₹': 'Rs '
};

/** The text as WinAnsi characters (each one byte). */
function winAnsi(s: string): string {
	let out = '';
	for (const ch of s.replace(/\s+/g, ' ')) {
		if (SWAP[ch]) out += SWAP[ch];
		else out += ch.charCodeAt(0) <= 0xff && ch.length === 1 ? ch : '?';
	}
	return out;
}

function width(s: string, size: number, bold = false): number {
	let w = 0;
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		w += c >= 32 && c <= 126 ? WIDTHS[c - 32] : 556;
	}
	return (w * size * (bold ? 1.06 : 1)) / 1000;
}

/** Word-wraps to the width, breaking long words, keeping at most `max` lines (the last ends in "..."). */
function wrap(text: string, w: number, size: number, max: number, bold = false): string[] {
	const lines: string[] = [];
	let line = '';
	const push = () => {
		lines.push(line);
		line = '';
	};
	for (const word of text.split(' ')) {
		const next = line ? `${line} ${word}` : word;
		if (width(next, size, bold) <= w) {
			line = next;
			continue;
		}
		if (line) push();
		let rest = word;
		while (width(rest, size, bold) > w) {
			let cut = rest.length - 1;
			while (cut > 1 && width(rest.slice(0, cut), size, bold) > w) cut--;
			lines.push(rest.slice(0, cut));
			rest = rest.slice(cut);
		}
		line = rest;
	}
	if (line) push();
	if (lines.length <= max) return lines.length ? lines : [''];
	const kept = lines.slice(0, max);
	let last = kept[max - 1];
	while (last && width(`${last}...`, size, bold) > w) last = last.slice(0, -1);
	kept[max - 1] = `${last}...`;
	return kept;
}

/** A PDF string literal, with non-ASCII bytes as octal escapes so the file stays ASCII. */
function literal(s: string): string {
	let out = '(';
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
		else if (c < 32 || c > 126) out += `\\${c.toString(8).padStart(3, '0')}`;
		else out += ch;
	}
	return `${out})`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

export interface Table {
	title: string;
	/** Lines under the title, e.g. who and when. */
	subtitle: string[];
	columns: { label: string; width: number }[];
	rows: (string | number | null)[][];
}

export function pdfTable(table: Table): Uint8Array {
	// Scale the columns to the usable width.
	const usable = PAGE_W - 2 * MARGIN;
	const total = table.columns.reduce((n, c) => n + c.width, 0);
	const widths = table.columns.map((c) => (c.width / total) * usable);
	const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((n, w) => n + w, 0));

	const header = table.columns.map((c, i) => wrap(winAnsi(c.label), widths[i] - 2 * PAD, FONT_SIZE, 2, true));
	const headerH = Math.max(...header.map((l) => l.length)) * LINE + 2 * PAD;
	const rows = table.rows.map((r) => r.map((v, i) => wrap(winAnsi(String(v ?? '')), widths[i] - 2 * PAD, FONT_SIZE, MAX_LINES)));

	// Lay the rows out on pages; the first page also carries the title block.
	const titleH = 26 + table.subtitle.length * 12 + 8;
	const bottom = MARGIN + 16;
	const pages: { top: number; rows: number[] }[] = [];
	let current = { top: PAGE_H - MARGIN - titleH, rows: [] as number[] };
	let y = current.top - headerH;
	rows.forEach((cells, i) => {
		const h = Math.max(...cells.map((l) => l.length)) * LINE + 2 * PAD;
		if (y - h < bottom && current.rows.length) {
			pages.push(current);
			current = { top: PAGE_H - MARGIN, rows: [] };
			y = current.top - headerH;
		}
		current.rows.push(i);
		y -= h;
	});
	pages.push(current);

	const text = (x: number, yy: number, s: string, bold = false, size = FONT_SIZE) =>
		`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${num(x)} ${num(yy)} Td ${literal(s)} Tj ET`;

	const streams = pages.map((p, pageIndex) => {
		const ops: string[] = [];
		if (pageIndex === 0) {
			ops.push('0.07 0.09 0.13 rg');
			ops.push(text(MARGIN, PAGE_H - MARGIN - 16, winAnsi(table.title), true, 15));
			ops.push('0.35 0.38 0.42 rg');
			table.subtitle.forEach((s, i) => ops.push(text(MARGIN, PAGE_H - MARGIN - 32 - i * 12, winAnsi(s), false, 9)));
		}
		let yy = p.top;
		// Header row on a dark band.
		ops.push(`0.07 0.09 0.13 rg ${num(MARGIN)} ${num(yy - headerH)} ${num(usable)} ${num(headerH)} re f`);
		ops.push('1 1 1 rg');
		header.forEach((lines, c) => lines.forEach((l, k) => ops.push(text(xs[c] + PAD, yy - PAD - FONT_SIZE - k * LINE + 1, l, true))));
		yy -= headerH;
		p.rows.forEach((r, n) => {
			const cells = rows[r];
			const h = Math.max(...cells.map((l) => l.length)) * LINE + 2 * PAD;
			if (n % 2 === 1) ops.push(`0.96 0.96 0.95 rg ${num(MARGIN)} ${num(yy - h)} ${num(usable)} ${num(h)} re f`);
			ops.push('0.12 0.13 0.15 rg');
			cells.forEach((lines, c) => lines.forEach((l, k) => ops.push(text(xs[c] + PAD, yy - PAD - FONT_SIZE - k * LINE + 1, l))));
			ops.push(`0.85 0.85 0.83 RG 0.5 w ${num(MARGIN)} ${num(yy - h)} m ${num(MARGIN + usable)} ${num(yy - h)} l S`);
			yy -= h;
		});
		ops.push('0.45 0.47 0.5 rg');
		const footer = `Page ${pageIndex + 1} of ${pages.length}`;
		ops.push(text(PAGE_W - MARGIN - width(footer, 8), MARGIN, footer));
		return ops.join('\n');
	});

	// Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then a page and its content per page.
	const objects: string[] = [];
	const pageRefs = pages.map((_, i) => `${5 + i * 2} 0 R`);
	objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
	objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`;
	objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
	objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
	streams.forEach((s, i) => {
		const pageObj = 5 + i * 2;
		objects[pageObj] =
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
			`/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObj + 1} 0 R >>`;
		objects[pageObj + 1] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
	});

	// Every character is ASCII, so string length is byte length.
	let out = '%PDF-1.4\n';
	const offsets: number[] = [];
	for (let i = 1; i < objects.length; i++) {
		offsets[i] = out.length;
		out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
	}
	const xref = out.length;
	out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
	for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
	out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new TextEncoder().encode(out);
}
