<script lang="ts">
	// A Salem-flavoured skyline in a single gold hairline: town blocks, temple
	// gopurams, the hill with its fort, a clock tower and a spire. Drawn once on load.
	//
	// The drawing is very wide (6000 units) with the landmarks gathered around the
	// centre, and scales to the strip's height ("slice"): any screen shows the
	// middle of it at full height, and only plain blocks at the far ends are
	// trimmed. Nothing is ever cut off at the top.
	const W = 6000;
	const BASE = 160;
	const C = W / 2;

	function seeded(seed: number) {
		return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	}

	function buildSkyline() {
		const rand = seeded(7);
		let d = `M0 ${BASE}`;
		let x = 0;
		const n = (v: number) => v.toFixed(0);

		const blocks = (until: number, min: number, max: number) => {
			while (x < until) {
				const w = Math.min(until - x, 18 + rand() * 42);
				const h = min + rand() * (max - min);
				d += ` V${n(BASE - h)} H${n(x + w)}`;
				x += w;
			}
			d += ` V${BASE}`;
		};

		// Stepped tiers rising to a small crown.
		const gopuram = (g0: number, tiers: number, gw: number, step: number, th: number) => {
			d += ` H${g0}`;
			for (let i = 0; i < tiers; i++) d += ` V${BASE - (i + 1) * th} H${g0 + (i + 1) * step}`;
			const topY = BASE - tiers * th;
			d += ` H${g0 + gw / 2 - 8} Q${g0 + gw / 2} ${topY - 20} ${g0 + gw / 2 + 8} ${topY}`;
			d += ` H${g0 + gw - tiers * step}`;
			for (let i = tiers - 1; i >= 0; i--) d += ` V${BASE - i * th} H${g0 + gw - i * step}`;
			x = g0 + gw;
		};

		const clockTower = (x0: number) => {
			d += ` H${x0} V70 H${x0 + 6} V58 L${x0 + 14} 40 L${x0 + 22} 58 V70 H${x0 + 28} V${BASE}`;
			x = x0 + 28;
		};

		const spire = (x0: number) => {
			d += ` H${x0} V96 L${x0 + 9} 52 L${x0 + 18} 96 V${BASE}`;
			x = x0 + 18;
		};

		blocks(C - 1240, 10, 56);
		gopuram(C - 1240, 4, 64, 6, 13);
		blocks(C - 600, 14, 64);
		gopuram(C - 600, 6, 92, 6, 15);
		blocks(C - 150, 18, 92);
		// The hill (peaks at x = C, y ≈ 87).
		d += ` L${C - 140} ${BASE - 6} Q${C} 20 ${C + 140} ${BASE - 6} L${C + 150} ${BASE}`;
		x = C + 150;
		blocks(C + 470, 16, 80);
		clockTower(C + 470);
		blocks(C + 1100, 14, 70);
		spire(C + 1100);
		blocks(W, 10, 60);
		return d;
	}

	const skyline = buildSkyline();
	// Fort on the hill's crest.
	const f = C - 840;
	const fort = `M${812 + f} 94 V80 H${818 + f} V74 H${824 + f} V80 H${846 + f} V66 H${851 + f} V58 L${855 + f} 52 L${859 + f} 58 V66 H${864 + f} V94`;
	const clock = { x: C + 484, y: 64 };
</script>

<svg class="skyline" viewBox="0 0 {W} {BASE}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
	<defs>
		<linearGradient id="skyline-fill" x1="0" x2="0" y1="0" y2="1">
			<stop offset="0" stop-color="#e3b04b" stop-opacity="0.10" />
			<stop offset="1" stop-color="#e3b04b" stop-opacity="0" />
		</linearGradient>
	</defs>
	<path d="{skyline} H{W} V{BASE} H0 Z" fill="url(#skyline-fill)" class="fill" />
	<path d={skyline} class="line" pathLength="1" />
	<path d={fort} class="line fort" pathLength="1" />
	<circle cx={clock.x} cy={clock.y} r="3.5" class="clock" />
</svg>

<style>
	.skyline {
		width: 100%;
		height: clamp(90px, 11vw, 160px);
	}

	.line {
		fill: none;
		stroke: var(--gold);
		stroke-width: 1.25;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		opacity: 0.7;
		animation: draw 2.6s var(--ease-out) 0.5s forwards;
	}

	.fort {
		animation-delay: 1.8s;
		animation-duration: 1.2s;
	}

	.fill {
		opacity: 0;
		animation: fade 1.6s var(--ease-out) 1.6s forwards;
	}

	.clock {
		fill: none;
		stroke: var(--gold);
		stroke-width: 1;
		opacity: 0;
		animation: fade 0.8s var(--ease-out) 2.4s forwards;
	}

	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}

	@keyframes fade {
		to {
			opacity: 1;
		}
	}
</style>
