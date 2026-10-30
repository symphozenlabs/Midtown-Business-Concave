<script lang="ts">
	import { onMount } from 'svelte';

	// Navy-and-gold backdrop from the approved poster: a slow sunburst and mandala
	// ring centred behind the conclave logo (--vp-x / --vp-y), drifting gold dust
	// and a soft vignette. Motion is slow and stops for reduced motion.

	const RAYS = 36;
	const rays = Array.from({ length: RAYS }, (_, i) => {
		const t = (i / RAYS) * Math.PI * 2;
		const hw = (Math.PI / RAYS) * (i % 2 ? 0.22 : 0.42);
		const R = 1000;
		const p = (a: number) => `${(Math.cos(a) * R).toFixed(1)} ${(Math.sin(a) * R).toFixed(1)}`;
		return `M0 0 L${p(t - hw)} L${p(t + hw)} Z`;
	}).join(' ');

	const petals = Array.from({ length: 40 }, (_, i) => {
		const a = (i / 40) * 360;
		return `rotate(${a})`;
	});
	const dots = Array.from({ length: 72 }, (_, i) => {
		const t = (i / 72) * Math.PI * 2;
		return { x: Math.cos(t) * 372, y: Math.sin(t) * 372, r: i % 2 ? 1.2 : 2.2 };
	});

	let canvas: HTMLCanvasElement;
	let host: HTMLElement;

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let w = 0,
			h = 0,
			dpr = 1;

		type Mote = { x: number; y: number; r: number; vy: number; sway: number; phase: number; alpha: number; tint: number };
		let motes: Mote[] = [];

		function seed() {
			const count = Math.round(Math.min(90, (w * h) / 16000));
			motes = Array.from({ length: count }, () => ({
				x: Math.random() * w,
				y: Math.random() * h,
				r: 0.6 + Math.pow(Math.random(), 3) * 2.4,
				vy: 4 + Math.random() * 10, // px per second, upward
				sway: 6 + Math.random() * 14,
				phase: Math.random() * Math.PI * 2,
				alpha: 0.15 + Math.random() * 0.55,
				tint: Math.random()
			}));
		}

		function resize() {
			dpr = Math.min(2, window.devicePixelRatio || 1);
			w = host.clientWidth;
			h = host.clientHeight;
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			seed();
			draw(0);
		}

		function draw(time: number) {
			ctx.clearRect(0, 0, w, h);
			const s = time / 1000;
			for (const m of motes) {
				const x = m.x + Math.sin(s * 0.4 + m.phase) * m.sway;
				const twinkle = 0.65 + 0.35 * Math.sin(s * 1.3 + m.phase * 3);
				ctx.beginPath();
				ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255,${200 + Math.round(m.tint * 40)},${120 + Math.round(m.tint * 60)},${m.alpha * twinkle})`;
				ctx.shadowColor = 'rgba(255,190,90,0.9)';
				ctx.shadowBlur = 4 + m.r * 3;
				ctx.fill();
			}
		}

		let frame = 0;
		let last = 0;
		let running = false;

		function loop(time: number) {
			const dt = Math.min(0.05, (time - last) / 1000 || 0);
			last = time;
			for (const m of motes) {
				m.y -= m.vy * dt;
				if (m.y < -10) {
					m.y = h + 10;
					m.x = Math.random() * w;
				}
			}
			draw(time);
			frame = requestAnimationFrame(loop);
		}

		function start() {
			if (running || reduce) return;
			running = true;
			last = performance.now();
			frame = requestAnimationFrame(loop);
		}

		function stop() {
			running = false;
			cancelAnimationFrame(frame);
		}

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(host);

		// Only animate while the hero is on screen and the tab is visible.
		let visible = true;
		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible && !document.hidden) start();
			else stop();
		});
		io.observe(host);
		const onVisibility = () => (document.hidden || !visible ? stop() : start());
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			stop();
			ro.disconnect();
			io.disconnect();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<div class="backdrop" bind:this={host} aria-hidden="true">
	<div class="glow"></div>

	<svg class="sun" viewBox="-1000 -1000 2000 2000">
		<defs>
			<radialGradient id="ray-fade">
				<stop offset="0" stop-color="#ffd592" stop-opacity="0.16" />
				<stop offset="0.35" stop-color="#ffd592" stop-opacity="0.06" />
				<stop offset="0.8" stop-color="#ffd592" stop-opacity="0" />
			</radialGradient>
		</defs>
		<g class="rays"><path d={rays} fill="url(#ray-fade)" /></g>
	</svg>

	<svg class="mandala" viewBox="-420 -420 840 840">
		<g class="ring">
			<circle r="300" />
			<circle r="316" />
			<circle r="352" />
			<circle r="360" />
			{#each petals as transform (transform)}
				<path {transform} d="M316 0 Q334 -15 352 0 Q334 15 316 0" />
			{/each}
		</g>
		<g class="dots">
			{#each dots as dot, i (i)}
				<circle cx={dot.x} cy={dot.y} r={dot.r} />
			{/each}
		</g>
	</svg>

	<canvas bind:this={canvas}></canvas>
	<div class="vignette"></div>
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		background:
			radial-gradient(120% 80% at 0% 100%, rgb(40 70 140 / 0.18), transparent 60%),
			linear-gradient(180deg, #0c1730 0%, #08112a 50%, #04070f 100%);
		pointer-events: none;
	}

	.glow,
	.sun,
	.mandala {
		position: absolute;
		left: var(--vp-x, 72%);
		top: var(--vp-y, 46%);
		translate: -50% -50%;
	}

	.glow {
		width: min(1100px, 120vw);
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(circle, rgb(255 172 72 / 0.3) 0%, rgb(230 116 38 / 0.12) 32%, rgb(120 50 20 / 0.03) 62%, transparent 72%);
		animation: breathe 9s ease-in-out infinite;
	}

	.sun {
		width: max(1800px, 160vw);
		aspect-ratio: 1;
	}

	.rays {
		transform-origin: 0 0;
		animation: turn 240s linear infinite;
	}

	.mandala {
		width: min(820px, 110vw);
		aspect-ratio: 1;
		opacity: 0.9;
	}

	.ring {
		fill: none;
		stroke: rgb(242 194 108 / 0.2);
		stroke-width: 1.2;
		transform-origin: 0 0;
		animation: turn 300s linear infinite reverse;
	}

	.dots {
		fill: rgb(242 194 108 / 0.32);
		transform-origin: 0 0;
		animation: turn 420s linear infinite;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.vignette {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgb(0 0 0 / 0.55) 100%),
			linear-gradient(180deg, rgb(4 7 16 / 0.35) 0%, transparent 18%, transparent 80%, rgb(4 7 16 / 0.6) 100%);
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 0.85;
			scale: 1;
		}
		50% {
			opacity: 1;
			scale: 1.04;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.glow,
		.rays,
		.ring,
		.dots {
			animation: none;
		}
	}
</style>
