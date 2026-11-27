import { describe, expect, it } from 'vitest';
import { qrLabelPage, qrSvg } from './qr-label-page.ts';
import { qrMatrix } from './qr-png.ts';

const link = 'https://conclave.midtownevents.in/pass/AAAAAAAAAAAAAAAAAAAAAA';

describe('qrSvg', () => {
	it('draws every dark module of the QR, and no light one', () => {
		const { size, data } = qrMatrix(link);
		const svg = qrSvg(link);
		expect(svg).toContain(`viewBox="-1 -1 ${size + 2} ${size + 2}"`);
		const dark = new Set<number>();
		for (const [, c, r, run] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
			for (let i = 0; i < Number(run); i++) dark.add(Number(r) * size + Number(c) + i);
		}
		const expected = data.reduce((n: number, v: number) => n + (v ? 1 : 0), 0);
		expect(dark.size).toBe(expected);
		for (const i of dark) expect(data[i]).toBe(1);
	});
});

describe('qrLabelPage', () => {
	const page = qrLabelPage({
		type: 'Visitor',
		name: 'Meena <Kumar>',
		link,
		designation: 'Founder & CEO',
		company: 'Meena "Foods"'
	});

	it('escapes what people typed', () => {
		expect(page).toContain('<div class="name">Meena &lt;Kumar&gt;</div>');
		expect(page).toContain('<div class="role">Founder &amp; CEO</div>');
		expect(page).toContain('<div class="co">Meena &quot;Foods&quot;</div>');
		expect(page).not.toContain('<Kumar>');
	});

	it('prints one 75 x 50 mm label with the type and the QR', () => {
		expect(page).toContain('@page { size: 75mm 50mm; margin: 0; }');
		expect(page).toContain('<div class="type">Visitor</div>');
		expect(page).toContain('<svg viewBox=');
	});

	it('leaves out an empty designation or company', () => {
		const bare = qrLabelPage({ type: 'Delegate', name: 'Arun', link, designation: '', company: '' });
		expect(bare).not.toContain('class="role"');
		expect(bare).not.toContain('class="co"');
	});
});
