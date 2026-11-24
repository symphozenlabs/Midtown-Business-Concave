/*
 * A one-sheet Excel workbook (.xlsx) with a bold header row, column widths, a frozen
 * header and a filter. No dependency: an .xlsx is a zip of a few XML files, stored
 * uncompressed here. Every cell is text, so nothing in a cell can run as a formula.
 */

const enc = new TextEncoder();

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** A zip archive of the given files, stored without compression. */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
	const now = new Date();
	const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
	const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	for (const f of files) {
		const name = enc.encode(f.name);
		const crc = crc32(f.data);
		const local = new Uint8Array(30 + name.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, 0x0800, true); // UTF-8 names
		lv.setUint16(8, 0, true); // stored
		lv.setUint16(10, time, true);
		lv.setUint16(12, date, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, f.data.length, true);
		lv.setUint32(22, f.data.length, true);
		lv.setUint16(26, name.length, true);
		local.set(name, 30);

		const central = new Uint8Array(46 + name.length);
		const cv = new DataView(central.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint16(10, 0, true);
		cv.setUint16(12, time, true);
		cv.setUint16(14, date, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, f.data.length, true);
		cv.setUint32(24, f.data.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, offset, true);
		central.set(name, 46);

		locals.push(local, f.data);
		centrals.push(central);
		offset += local.length + f.data.length;
	}
	const centralSize = centrals.reduce((n, c) => n + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, files.length, true);
	ev.setUint16(10, files.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);

	const parts = [...locals, ...centrals, end];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/** XML-safe text: escapes markup and drops control characters XML can't hold. */
const xml = (s: string) =>
	s
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/** A1-style column letters: 0 → A, 26 → AA. */
function column(i: number): string {
	let s = '';
	for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
	return s;
}

export interface Sheet {
	/** The tab name, at most 31 characters. */
	name: string;
	header: string[];
	rows: (string | number | null)[][];
	/** Column widths in characters; defaults to 18. */
	widths?: number[];
}

export function xlsx(sheet: Sheet): Uint8Array {
	const cell = (ref: string, v: string | number | null, style: number) =>
		`<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(String(v ?? ''))}</t></is></c>`;
	const row = (r: number, values: (string | number | null)[], style: number) =>
		`<row r="${r}">${values.map((v, i) => cell(`${column(i)}${r}`, v, style)).join('')}</row>`;
	const last = column(sheet.header.length - 1);
	const cols = sheet.header
		.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${sheet.widths?.[i] ?? 18}" customWidth="1"/>`)
		.join('');

	const sheetXml =
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
		`<cols>${cols}</cols>` +
		`<sheetData>${row(1, sheet.header, 1)}${sheet.rows.map((r, i) => row(i + 2, r, 0)).join('')}</sheetData>` +
		`<autoFilter ref="A1:${last}${sheet.rows.length + 1}"/>` +
		`</worksheet>`;

	const styles =
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
		`<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
		`<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
		`<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
		`<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
		`<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
		`</styleSheet>`;

	const name = xml(sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
	const files: Record<string, string> = {
		'[Content_Types].xml':
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
			`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
			`<Default Extension="xml" ContentType="application/xml"/>` +
			`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
			`<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
			`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
			`</Types>`,
		'_rels/.rels':
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
			`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
			`</Relationships>`,
		'xl/workbook.xml':
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
			`<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
			`<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${last}$${sheet.rows.length + 1}</definedName></definedNames>` +
			`</workbook>`,
		'xl/_rels/workbook.xml.rels':
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
			`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
			`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
			`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
			`</Relationships>`,
		'xl/worksheets/sheet1.xml': sheetXml,
		'xl/styles.xml': styles
	};
	return zip(Object.entries(files).map(([n, s]) => ({ name: n, data: enc.encode(s) })));
}
