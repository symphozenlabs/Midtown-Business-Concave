import { qrMatrix } from './qr-png.ts';

/*
 * One person's name-and-QR label as a page to print from the admin dashboard: the same
 * 75 x 50 mm label as print/visitor-card/qr-labels.html, black only, for the PeriPeri
 * thermal label printer. The QR is drawn here, so printing needs no internet.
 *
 * The printer's head starts about 3 mm in from the label's left edge and cannot print
 * left of that, so the layout keeps 4 mm clear on the left and the printout is moved left
 * by --head-x (and up by --head-y). Keep those in step with label.html and qr-labels.html.
 */

export interface QrLabel {
	/** Delegate or Visitor. */
	type: string;
	name: string;
	/** What the QR opens: the person's pass link. */
	link: string;
	designation: string;
	company: string;
}

const esc = (t: string) =>
	t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The QR as an SVG with a one-module white border, each run of dark modules in a row drawn as one rectangle. */
export function qrSvg(text: string): string {
	const { size, data } = qrMatrix(text);
	let d = '';
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (!data[r * size + c]) continue;
			let run = 1;
			while (c + run < size && data[r * size + c + run]) run++;
			d += `M${c} ${r}h${run}v1h-${run}z`;
			c += run - 1;
		}
	}
	return `<svg viewBox="-1 -1 ${size + 2} ${size + 2}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#000"/></svg>`;
}

const LATIN =
	'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
	'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const FONTS = [700, 800]
	.flatMap((w) =>
		[
			['latin', LATIN],
			['latin-ext', LATIN_EXT]
		].map(
			([subset, range]) =>
				`@font-face{font-family:'Montserrat';font-weight:${w};font-display:block;src:url(/fonts/montserrat-${w}-${subset}.woff2) format('woff2');unicode-range:${range};}`
		)
	)
	.join('\n');

const STYLE = `
${FONTS}
@page { size: 75mm 50mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { color: #000; background: #fff; }

/* where the label printer puts its first dot, measured from the label's top-left corner */
:root { --head-x: 3mm; --head-y: 0mm; }

/* ---------- the label: 75 x 50 mm, black on white ---------- */
.lab { position: relative; width: 75mm; height: 50mm; overflow: hidden; background: #fff; color: #000; font-family: 'Montserrat', 'Helvetica Neue', Arial, sans-serif; }
.lab .name {
  position: absolute; left: 4mm; right: 3mm; top: 2.6mm; height: 9mm;
  display: flex; align-items: center; font-size: 7.5mm; font-weight: 800; line-height: 1.05; letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden;
}
.lab .name.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; padding-top: 0.2mm; }
.lab .rule { position: absolute; left: 4mm; right: 3mm; top: 12.2mm; height: 0.5mm; background: #000; }
/* the QR's one-module white border puts its first black square about 1 mm inside the box, at 4 mm */
.lab .qr { position: absolute; left: 3mm; top: 13.2mm; width: 33.6mm; height: 33.6mm; }
.lab .qr svg { display: block; width: 100%; height: 100%; }
.lab .info { position: absolute; left: 38.8mm; right: 3mm; top: 14.2mm; bottom: 3mm; display: flex; flex-direction: column; gap: 1mm; }
.lab .role { font-size: 2.5mm; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lab .co { font-size: 3.4mm; font-weight: 800; line-height: 1.15; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
/* Delegate or Visitor: outlined, not filled, because this printer cannot print large solid black areas evenly */
.lab .type {
  margin-top: auto; align-self: flex-start; max-width: 100%;
  font-size: 4.2mm; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.1;
  border: 0.5mm solid #000; border-radius: 1mm; padding: 0.8mm 1.6mm 0.6mm;
  white-space: nowrap; overflow: hidden;
}

/* ---------- on screen: the label enlarged, with a Print button ---------- */
@media screen {
  body { min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: 20px; padding: 24px; background: #f3f1ec; font-family: system-ui, -apple-system, sans-serif; }
  .stage { width: 150mm; height: 100mm; }
  .stage .lab { transform: scale(2); transform-origin: 0 0; box-shadow: 0 0.5mm 2mm rgba(0,0,0,0.18); border-radius: 0.8mm; }
  .bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: center; }
  .bar button { font: 600 14px system-ui, sans-serif; padding: 10px 18px; border-radius: 8px; border: 0; cursor: pointer; background: #0b1430; color: #fff; }
  .bar p { margin: 0; font-size: 13px; color: #555; }
}
@media screen and (max-width: 640px) {
  .stage { width: 75mm; height: 50mm; }
  .stage .lab { transform: none; }
}

@media print {
  html, body { width: 75mm; height: 50mm; overflow: hidden; }
  .bar { display: none; }
  .lab { translate: calc(-1 * var(--head-x)) calc(-1 * var(--head-y)); }
}
`;

/*
 * The name gets the biggest size that fits on one line (7.5 mm down to 4.6 mm), then wraps
 * to two lines. window.labelReady settles once the fonts are in and the name is fitted, so
 * the admin dashboard knows when to open the print dialog.
 */
const SCRIPT = `
(function () {
  var el = document.querySelector('.lab .name');
  function fit() {
    el.classList.remove('wrap');
    var mm = 7.5;
    el.style.fontSize = mm + 'mm';
    while (el.scrollWidth > el.clientWidth + 0.5 && mm > 4.6) { mm -= 0.2; el.style.fontSize = mm + 'mm'; }
    if (el.scrollWidth > el.clientWidth + 0.5) { el.classList.add('wrap'); el.style.fontSize = '4.2mm'; }
  }
  var fonts = document.fonts ? document.fonts.load('800 20px Montserrat', el.textContent || 'A').catch(function () {}) : Promise.resolve();
  window.labelReady = fonts.then(fit);
  window.addEventListener('beforeprint', fit);
  var button = document.getElementById('print');
  if (button) button.addEventListener('click', function () { window.print(); });
})();
`;

/** The whole page: the label, and on screen a Print button with the print settings to use. */
export function qrLabelPage(label: QrLabel): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Label · ${esc(label.name)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="stage">
<div class="lab">
<div class="name">${esc(label.name)}</div>
<div class="rule"></div>
<div class="qr">${qrSvg(label.link)}</div>
<div class="info">
${label.designation ? `<div class="role">${esc(label.designation)}</div>` : ''}
${label.company ? `<div class="co">${esc(label.company)}</div>` : ''}
<div class="type">${esc(label.type || '–')}</div>
</div>
</div>
</div>
<div class="bar">
<button type="button" id="print">Print label</button>
<p>Label printer, paper size 75 × 50 mm, margins None, scale 100%.</p>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}
