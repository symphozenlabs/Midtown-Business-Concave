<script lang="ts">
	import { onMount } from 'svelte';
	import type { Action } from 'svelte/action';
	import { browser } from '$app/env';
	import { ArrowDown, CalendarDays, Clock, Handshake, Lock, MapPin, Megaphone, Presentation, Store } from '@lucide/svelte';
	import { EVENT, SALEM } from '#lib/event.ts';
	import { EVENT_TIME_ZONE, eventLabels } from '#lib/event-settings.ts';
	import { loadSiteConfig, siteConfig } from '#lib/site-config.svelte.ts';
	import { INTERESTS, type Interest } from '#lib/registration.ts';
	import { BRANCHES } from '#lib/story.ts';
	import { MAP_H, MAP_W, NEIGHBOURS, ROADS, ROUTES, TAMIL_NADU, project } from '#lib/geo/tamil-nadu.ts';
	import { onScroll, scrollToElement } from '#lib/smooth-scroll.ts';

	/*
	 * A pinned chapter driven by scroll position. The stage sticks for the
	 * section's height while `progress` runs 0 → 1. Every moving part is a paused
	 * Web Animation whose time is set from that progress, so the browser only
	 * ever changes transforms, opacity and stroke offsets: no layout, no filters.
	 * The continuous motion (pulses, glows, dust) is ordinary looping CSS on
	 * transforms and opacity, which runs on the compositor.
	 *
	 * The ground is NASA satellite imagery (Black Marble night lights, Blue
	 * Marble colour, ASTER GDEM relief), composited to this map's exact frame.
	 */

	// ---- timeline (fractions of the section's scroll) ----
	const DRAW = [0, 0.1] as const;
	const INTRO = [0, 0.12] as const;
	const BRANCH_START = 0.12;
	const BRANCH_END = 0.6;
	const CONVERGE = [0.6, 0.76] as const;
	const ZOOM = [0.76, 0.9] as const;
	const FORMATS = [0.76, 0.92] as const;
	const FINAL = [0.9, 1] as const;
	const slot = (BRANCH_END - BRANCH_START) / BRANCHES.length;
	const branchWindow = (i: number) => [BRANCH_START + i * slot, BRANCH_START + (i + 1) * slot] as const;

	// ---- geometry ----
	const pct = ([x, y]: [number, number]) => ({ x: (x / MAP_W) * 100, y: (y / MAP_H) * 100 });
	const salemPt = project(SALEM.lat, SALEM.lon);
	const salem = pct(salemPt);
	const branches = BRANCHES.map((b, i) => {
		const pt = project(b.lat, b.lon);
		// The real highway route to Salem; an arc only if the road data has no connection.
		const [x0, y0] = pt,
			[x1, y1] = salemPt;
		const mx = (x0 + x1) / 2,
			my = (y0 + y1) / 2;
		const dx = x1 - x0,
			dy = y1 - y0;
		const len = Math.hypot(dx, dy) || 1;
		const bow = (i % 2 ? -0.16 : 0.16) * len;
		const arc = `M${x0} ${y0} Q${mx - (dy / len) * bow} ${my + (dx / len) * bow} ${x1} ${y1}`;
		const route = ROUTES[b.name] ?? arc;
		return { ...b, ...pct(pt), route, window: branchWindow(i) };
	});

	// Everything outside the state, as one even-odd shape, to dim the surroundings.
	const outside = `M0 0H${MAP_W}V${MAP_H}H0Z${TAMIL_NADU}`;

	// Gold dust over the map: fixed pseudo-random positions so the server and client agree.
	const dust = Array.from({ length: 22 }, (_, i) => {
		const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
		return { x: 6 + r(1) * 88, y: 8 + r(2) * 84, size: 1.5 + r(3) * 2.5, dur: 9 + r(4) * 9, delay: -r(5) * 18, drift: 10 + r(6) * 22 };
	});

	// ---- scroll progress, shared with every scrubbed element ----
	type Listener = (p: number) => void;
	const listeners = new Set<Listener>();
	let progress = 0;
	// Read before the element actions run, so they can take their static frame.
	const reduced = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function publish(p: number) {
		if (p === progress) return;
		progress = p;
		for (const fn of listeners) fn(p);
	}

	interface ScrubOptions {
		from: number;
		to: number;
		keyframes: Keyframe[];
		/** Progress sampled when motion is reduced (defaults to the window's midpoint). */
		staticAt?: number;
	}

	const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

	/** Plays `keyframes` across [from, to] of the scroll progress. */
	const scrub: Action<HTMLElement | SVGElement, ScrubOptions> = (node, opts) => {
		const anim = node.animate(opts.keyframes, { duration: 1000, fill: 'both' });
		anim.pause();
		const update = (p: number) => {
			anim.currentTime = clamp01((p - opts.from) / (opts.to - opts.from)) * 1000;
		};
		if (reduced) {
			update(opts.staticAt ?? (opts.from + opts.to) / 2);
		} else {
			listeners.add(update);
			update(progress);
		}
		return {
			destroy() {
				listeners.delete(update);
				anim.cancel();
			}
		};
	};

	const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
	const glide = 'cubic-bezier(0.45, 0, 0.2, 1)';

	/** Fade and rise in, hold, then fade and rise out. */
	function panel(from: number, to: number, hold = true): ScrubOptions {
		const keyframes: Keyframe[] = hold
			? [
					{ opacity: 0, transform: 'translate3d(0, 20px, 0)', easing: ease, offset: 0 },
					{ opacity: 1, transform: 'translate3d(0, 0, 0)', offset: 0.2 },
					{ opacity: 1, transform: 'translate3d(0, 0, 0)', easing: ease, offset: 0.82 },
					{ opacity: 0, transform: 'translate3d(0, -24px, 0)', offset: 1 }
				]
			: [
					{ opacity: 0, transform: 'translate3d(0, 20px, 0)', easing: ease, offset: 0 },
					{ opacity: 1, transform: 'translate3d(0, 0, 0)', offset: 0.35 },
					{ opacity: 1, transform: 'translate3d(0, 0, 0)', offset: 1 }
				];
		return { from, to, keyframes, staticAt: (from + to) / 2 };
	}

	/** A line inside a panel: rises in slightly after the one before it; the panel fades it out. */
	function line(from: number, to: number, order: number): ScrubOptions {
		const start = from + order * 0.035 * (to - from);
		return {
			from: start,
			to: start + 0.28 * (to - from),
			keyframes: [
				{ opacity: 0, transform: 'translate3d(0, 26px, 0)', easing: ease },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' }
			],
			staticAt: 1
		};
	}

	// ---- camera ----
	// The map plane is scaled about its centre and translated (in % of its own
	// size) so that a chosen point lands on the centre of the frame.
	function shot(scale: number, cx: number, cy: number, damp = 1) {
		const s = 1 + (scale - 1) * damp;
		const tx = -damp * scale * (cx - 50);
		const ty = -damp * scale * (cy - 50);
		return `translate3d(${tx.toFixed(3)}%, ${ty.toFixed(3)}%, 0) scale(${s.toFixed(4)})`;
	}

	function camera(damp: number): ScrubOptions {
		const at = (offset: number, scale: number, cx: number, cy: number, easing = glide): Keyframe => ({
			offset: Math.min(1, Math.max(0, offset)),
			transform: shot(scale, cx, cy, damp),
			easing
		});
		const keyframes: Keyframe[] = [
			// Establishing shot: a touch tight and low, settling as the outline draws.
			at(0, 1.12, 50, 56),
			at(DRAW[1] + 0.02, 1, 50, 50)
		];
		for (const b of branches) {
			const [a] = b.window;
			// Fly to the city, hold on it, then pan on to the next one.
			keyframes.push(at(a + 0.4 * slot, 1.55, b.x, b.y), at(a + 0.88 * slot, 1.55, b.x, b.y));
		}
		keyframes.push(
			// Pull back to the whole state for the convergence…
			at(CONVERGE[0] + 0.3 * (CONVERGE[1] - CONVERGE[0]), 1, 50, 50),
			at(ZOOM[0], 1, 50, 50),
			// …then push in on Salem and keep creeping until the end.
			at(ZOOM[1], 2.3, salem.x, salem.y, 'linear'),
			at(1, 2.45, salem.x, salem.y)
		);
		return { from: 0, to: 1, keyframes, staticAt: 0.11 };
	}

	const outlineDraw: ScrubOptions = {
		from: DRAW[0],
		to: DRAW[1],
		keyframes: [{ strokeDashoffset: 1, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }, { strokeDashoffset: 0 }],
		staticAt: 1
	};
	const contextFade: ScrubOptions = {
		from: 0.02,
		to: 0.12,
		keyframes: [{ opacity: 0 }, { opacity: 1 }],
		staticAt: 1
	};
	// The surroundings start dark and reveal with the drawing; they dim again for the zoom.
	const outsideDim: ScrubOptions = {
		from: 0,
		to: 1,
		keyframes: [
			{ opacity: 0.85, offset: 0 },
			{ opacity: 0.5, offset: DRAW[1], easing: glide },
			{ opacity: 0.5, offset: ZOOM[0] },
			{ opacity: 0.75, offset: ZOOM[1] },
			{ opacity: 0.75, offset: 1 }
		],
		staticAt: 0.5
	};

	function nodeAnim(i: number): ScrubOptions {
		const [a] = branches[i].window;
		// Light up as the camera arrives; fade as the map zooms in on Salem.
		const on = a + 0.25 * slot,
			off = ZOOM[0] - 0.02;
		const end = ZOOM[0] + 0.03;
		const k = (p: number) => (p - on) / (end - on);
		return {
			from: on,
			to: end,
			keyframes: [
				{ opacity: 0, transform: 'scale(0.5)', easing: ease, offset: 0 },
				{ opacity: 1, transform: 'scale(1)', offset: Math.min(0.999, k(on + 0.03)) },
				{ opacity: 1, transform: 'scale(1)', offset: Math.min(0.999, k(off)) },
				{ opacity: 0, transform: 'scale(1)', offset: 1 }
			],
			staticAt: off - 0.01
		};
	}

	function routeAnim(i: number): ScrubOptions {
		const stagger = (i / branches.length) * 0.025;
		return {
			from: CONVERGE[0] + 0.005 + stagger,
			to: CONVERGE[0] + 0.085 + stagger,
			keyframes: [{ strokeDashoffset: 1, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }, { strokeDashoffset: 0 }],
			staticAt: 1
		};
	}

	const pulsesAnim: ScrubOptions = {
		from: CONVERGE[0] + 0.1,
		to: CONVERGE[0] + 0.15,
		keyframes: [{ opacity: 0 }, { opacity: 1 }],
		staticAt: 1
	};

	const hubAnim: ScrubOptions = {
		from: CONVERGE[0] + 0.05,
		to: CONVERGE[0] + 0.11,
		keyframes: [
			{ opacity: 0, transform: 'scale(0.5)', easing: ease },
			{ opacity: 1, transform: 'scale(1)' }
		],
		staticAt: 1
	};

	const dimAnim: ScrubOptions = {
		from: ZOOM[0],
		to: ZOOM[1],
		keyframes: [{ opacity: 0 }, { opacity: 0.6 }],
		staticAt: 0
	};
	const hintAnim: ScrubOptions = {
		from: 0,
		to: 0.04,
		keyframes: [{ opacity: 1 }, { opacity: 0 }],
		staticAt: 1
	};

	// Cards only enter, staggered; the panel's own fade takes them out.
	function cardAnim(i: number): ScrubOptions {
		const start = FORMATS[0] + 0.015 + i * 0.012;
		return {
			from: start,
			to: start + 0.04,
			keyframes: [
				{ opacity: 0, transform: 'translate3d(0, 20px, 0)', easing: ease },
				{ opacity: 1, transform: 'translate3d(0, 0, 0)' }
			],
			staticAt: 1
		};
	}

	/** Keeps the pulse layer (laid out in map units) scaled to the rendered map. */
	const fitMapUnits: Action<HTMLElement> = (node) => {
		const ro = new ResizeObserver(([entry]) => {
			node.style.setProperty('--k', String(entry.contentRect.width / MAP_W));
		});
		ro.observe(node);
		return { destroy: () => ro.disconnect() };
	};

	let section: HTMLElement;
	let stage: HTMLElement;

	onMount(() => {
		loadSiteConfig();
		if (reduced) return;

		let inView = false;
		const update = () => {
			if (!inView) return;
			const rect = section.getBoundingClientRect();
			const distance = rect.height - stage.offsetHeight;
			publish(distance > 0 ? clamp01(-rect.top / distance) : 0);
		};

		// Only do work while the chapter is near the viewport.
		const io = new IntersectionObserver(
			([entry]) => {
				inView = entry.isIntersecting;
				if (inView) update();
			},
			{ rootMargin: '25% 0px' }
		);
		io.observe(section);

		// Subscribe a frame late so the smooth scroller exists.
		let off = () => {};
		const frame = requestAnimationFrame(() => {
			off = onScroll(update);
			update();
		});
		window.addEventListener('resize', update);

		return () => {
			cancelAnimationFrame(frame);
			io.disconnect();
			off();
			window.removeEventListener('resize', update);
		};
	});

	function toRegister() {
		const el = document.getElementById('register');
		if (el) scrollToElement(el, -24);
	}

	// The schedule set on the admin Configuration page (prerendered with the defaults).
	const when = $derived(eventLabels(siteConfig.event));
	const month = $derived(
		new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: EVENT_TIME_ZONE }).format(new Date(siteConfig.event.startsAt))
	);
	const facts = $derived([
		{ icon: CalendarDays, value: when.dateLabel },
		{ icon: Clock, value: when.timeLabel },
		{ icon: MapPin, value: EVENT.venue }
	]);
</script>

{#snippet interestIcon(value: Interest)}
	{#if value === 'networking'}<Handshake size={20} strokeWidth={1.75} />
	{:else if value === 'private-meetings'}<Lock size={20} strokeWidth={1.75} />
	{:else if value === 'workshops'}<Presentation size={20} strokeWidth={1.75} />
	{:else if value === 'b2b-stalls'}<Store size={20} strokeWidth={1.75} />
	{:else}<Megaphone size={20} strokeWidth={1.75} />{/if}
{/snippet}

<section class="story on-ink" class:static={reduced} bind:this={section} aria-labelledby="story-title">
	<div class="stage" bind:this={stage}>
		<div class="container grid">
			<div class="copy">
				<article class="panel intro" use:scrub={panel(INTRO[0], INTRO[1])}>
					<span class="eyebrow">Across Tamil Nadu</span>
					<h2 id="story-title">One state, many engines.</h2>
					<p>
						Tamil Nadu's entrepreneurs have built strong businesses in their own cities. This {month}, they come together
						in one room.
					</p>
					<span class="hint" use:scrub={hintAnim} aria-hidden="true"><ArrowDown size={16} /> Scroll</span>
				</article>

				{#each branches as b, i (b.name)}
					{@const [a, z] = b.window}
					<article class="panel" use:scrub={panel(a, z)}>
						<span class="eyebrow" use:scrub={line(a, z, 0)}>
							<span class="num">0{i + 1}</span> / 0{branches.length} · {b.region}
						</span>
						<h3 use:scrub={line(a, z, 1)}>{b.name}</h3>
						<p use:scrub={line(a, z, 2)}>{b.note}</p>
						<p class="joining" use:scrub={line(a, z, 3)}>Entrepreneurs from {b.name} are joining us in Salem.</p>
					</article>
				{/each}

				<article class="panel" use:scrub={panel(CONVERGE[0], CONVERGE[1])}>
					<span class="eyebrow" use:scrub={line(CONVERGE[0], CONVERGE[1], 0)}>{when.shortDate}</span>
					<h3 use:scrub={line(CONVERGE[0], CONVERGE[1], 1)}>All roads lead to Salem.</h3>
					<p use:scrub={line(CONVERGE[0], CONVERGE[1], 2)}>{EVENT.tagline}</p>
				</article>

				<article class="panel formats" use:scrub={panel(FORMATS[0], FORMATS[1])}>
					<span class="eyebrow" use:scrub={line(FORMATS[0], FORMATS[1], 0)}>One day in Salem</span>
					<h3 use:scrub={line(FORMATS[0], FORMATS[1], 1)}>Five ways to grow.</h3>
					<ul class="cards">
						{#each INTERESTS as item, i (item.value)}
							<li use:scrub={cardAnim(i)}>
								<span class="card-icon">{@render interestIcon(item.value)}</span>
								<span class="card-text">
									<strong>{item.label}</strong>
									<span>{item.description}</span>
								</span>
							</li>
						{/each}
					</ul>
				</article>

				<article class="panel final" use:scrub={panel(FINAL[0], FINAL[1], false)}>
					<span class="eyebrow" use:scrub={line(FINAL[0], FINAL[1], 0)}>Your seat</span>
					<h3 use:scrub={line(FINAL[0], FINAL[1], 1)}>Be in the room.</h3>
					<ul class="facts" use:scrub={line(FINAL[0], FINAL[1], 2)}>
						{#each facts as fact (fact.value)}
							<li><fact.icon size={18} strokeWidth={1.75} aria-hidden="true" /> {fact.value}</li>
						{/each}
					</ul>
					<div use:scrub={line(FINAL[0], FINAL[1], 3)}>
						<button type="button" class="btn btn-gold" onclick={toRegister}>
							Reserve your seat <ArrowDown size={18} aria-hidden="true" />
						</button>
					</div>
				</article>
			</div>

			<div class="map-col" aria-hidden="true">
				<div class="map-layer" use:fitMapUnits>
					<!-- Near plane: the ground and everything attached to it. -->
					<div class="plane near" use:scrub={camera(1)}>
						<img class="ground" src="/story/satellite.webp" alt="" width="2000" height="2160" decoding="async" />

						<svg class="base" viewBox="0 0 {MAP_W} {MAP_H}">
							<path d={outside} fill-rule="evenodd" class="outside" use:scrub={outsideDim} />
							<g use:scrub={contextFade}>
								<path d={NEIGHBOURS} class="neighbour" />
								<path d={ROADS} class="road" />
							</g>
							<path d={TAMIL_NADU} class="outline-soft" />
						</svg>

						<svg class="overlay" viewBox="0 0 {MAP_W} {MAP_H}">
							<path d={TAMIL_NADU} class="outline" pathLength="1" use:scrub={outlineDraw} />
							{#each branches as b, i (b.name)}
								<!-- A dark underlay keeps the gold legible over the brightest city lights. -->
								<path d={b.route} class="route shadow" pathLength="1" use:scrub={routeAnim(i)} />
								<path d={b.route} class="route" pathLength="1" use:scrub={routeAnim(i)} />
							{/each}
						</svg>

						<!-- Pulses travelling along the highways into Salem. Laid out in map units, scaled to fit. -->
						<div class="pulses" use:scrub={pulsesAnim}>
							{#each branches as b, i (b.name)}
								<span class="pulse" style="offset-path: path('{b.route}'); animation-delay: {-i * 0.9}s"></span>
								<span class="pulse" style="offset-path: path('{b.route}'); animation-delay: {-i * 0.9 - 1.6}s"></span>
							{/each}
						</div>

						{#each branches as b, i (b.name)}
							<div class="node {b.side}" class:edge={b.x > 70} style="left: {b.x}%; top: {b.y}%" use:scrub={nodeAnim(i)}>
								<span class="glow"></span>
								<span class="dot"></span>
								<span class="label">{b.name}</span>
							</div>
						{/each}

						<div class="node hub right" style="left: {salem.x}%; top: {salem.y}%" use:scrub={hubAnim}>
							<span class="glow"></span>
							<span class="ring"></span>
							<span class="ring second"></span>
							<span class="dot"></span>
							<span class="label">Salem</span>
						</div>
					</div>

					<!-- Far plane: dust in front of the ground, moving a little less than the camera. -->
					<div class="plane dust" use:scrub={camera(0.8)}>
						{#each dust as d, i (i)}
							<span
								style="left: {d.x}%; top: {d.y}%; width: {d.size}px; height: {d.size}px; --dur: {d.dur}s; --delay: {d.delay}s; --drift: {d.drift}px"
							></span>
						{/each}
					</div>
				</div>
				<div class="dim" use:scrub={dimAnim}></div>
				<p class="credit">
					<span class="long">Satellite imagery: NASA Black Marble, Blue Marble and ASTER GDEM (METI/NASA)</span>
					<span class="short">Imagery: NASA</span>
				</p>
			</div>
		</div>
	</div>
</section>

<style>
	.story {
		position: relative;
		/* Scroll distance for the chapter: the stage stays pinned for all but one screen of it. */
		height: 700svh;
		background:
			radial-gradient(70% 55% at 75% 40%, rgb(255 172 72 / 0.12), transparent 70%),
			linear-gradient(180deg, #04070f 0%, #0a1330 18%, #0a1330 82%, #04070f 100%);
		color: var(--on-ink-soft);
	}

	.stage {
		position: sticky;
		top: 0;
		height: 100svh;
		overflow: hidden;
		contain: layout paint style;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		align-items: center;
		gap: clamp(var(--space-8), 4vw, 64px);
		height: 100%;
	}

	/* ---- copy ---- */
	.copy {
		display: grid;
		align-items: center;
		min-height: 0;
	}

	.panel {
		grid-area: 1 / 1;
		display: grid;
		gap: var(--space-4);
		justify-items: start;
		opacity: 0;
		will-change: transform, opacity;
	}

	.panel.intro {
		opacity: 1;
	}

	.panel > * {
		will-change: transform, opacity;
	}

	.eyebrow {
		color: var(--gold);
	}

	.num {
		font-variant-numeric: tabular-nums;
		color: var(--on-ink);
	}

	h2,
	h3 {
		font: var(--text-display);
		font-size: clamp(34px, min(4.2vw, 6.5svh), 60px);
		line-height: 1.06;
		color: var(--on-ink);
		max-width: 12ch;
	}

	.panel p {
		max-width: 40ch;
		font: var(--text-lead);
		font-size: clamp(16px, min(1.3vw, 2.3svh), 19px);
		color: var(--on-ink-soft);
	}

	.joining {
		color: var(--gold);
	}

	.hint {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--space-4);
		font: 600 12px/1 var(--font-sans);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgb(246 236 216 / 0.6);
	}

	.hint :global(svg) {
		animation: nudge 1.6s ease-in-out infinite;
	}

	@keyframes nudge {
		50% {
			transform: translateY(4px);
		}
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		width: 100%;
		max-width: 560px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.cards li {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: rgb(255 255 255 / 0.05);
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.22);
		opacity: 0;
		will-change: transform, opacity;
	}

	.cards li:last-child {
		grid-column: 1 / -1;
	}

	.card-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: linear-gradient(135deg, #fff3cc, #e0a13f 55%, #b26e1c);
		color: var(--ink);
	}

	.card-text {
		display: grid;
		gap: 2px;
	}

	.card-text strong {
		color: var(--on-ink);
		font-weight: 600;
		font-size: 15px;
	}

	.card-text span {
		font-size: 13px;
		line-height: 1.45;
		color: var(--on-ink-soft);
	}

	.facts {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.facts li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font: var(--text-ui);
		color: var(--on-ink);
	}

	.facts :global(svg) {
		color: var(--gold);
		flex: none;
	}

	.final .btn {
		margin-top: var(--space-2);
	}

	/* ---- map ---- */
	.map-col {
		--map-h: 92svh;
		position: relative;
		display: grid;
		place-items: center;
		height: var(--map-h);
		overflow: hidden;
		border-radius: var(--radius-lg);
		background: #060a1c;
	}

	/* Exactly the imagery's shape (markers are placed in % of it) and never smaller
	   than the column, so the ground covers the frame edge to edge. */
	.map-layer {
		position: relative;
		flex: none;
		width: max(100%, calc(var(--map-h) * 1000 / 1080));
		aspect-ratio: 1000 / 1080;
	}

	.plane {
		position: absolute;
		inset: 0;
		will-change: transform;
		transform-origin: 50% 50%;
	}

	.ground {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.base,
	.overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	.outside {
		fill: #060a1c;
	}

	.neighbour {
		fill: none;
		stroke: rgb(240 196 112 / 0.22);
		stroke-width: 1;
	}

	.road {
		fill: none;
		stroke: rgb(255 214 140 / 0.22);
		stroke-width: 1;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.outline-soft {
		fill: none;
		stroke: rgb(240 196 112 / 0.3);
		stroke-width: 1.2;
	}

	.outline {
		fill: none;
		stroke: var(--gold);
		stroke-width: 2.4;
		stroke-linejoin: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		vector-effect: non-scaling-stroke;
	}

	.route {
		fill: none;
		stroke: rgb(250 214 130 / 0.95);
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		vector-effect: non-scaling-stroke;
	}

	.route.shadow {
		stroke: rgb(6 10 28 / 0.6);
		stroke-width: 7;
	}

	/* Travelling pulses: a box in map units, scaled to the rendered map by --k. */
	.pulses {
		position: absolute;
		left: 0;
		top: 0;
		width: 1000px;
		height: 1080px;
		transform: scale(var(--k, 0.7));
		transform-origin: 0 0;
		opacity: 0;
		pointer-events: none;
	}

	.pulse {
		position: absolute;
		left: 0;
		top: 0;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #fff3cc;
		box-shadow:
			0 0 0 3px rgb(255 220 150 / 0.35),
			0 0 14px 4px rgb(255 190 90 / 0.8);
		offset-rotate: 0deg;
		offset-anchor: 50% 50%;
		animation: travel 3.2s linear infinite;
		will-change: offset-distance, opacity;
	}

	@keyframes travel {
		0% {
			offset-distance: 0%;
			opacity: 0;
		}
		8% {
			opacity: 1;
		}
		88% {
			opacity: 1;
		}
		100% {
			offset-distance: 100%;
			opacity: 0;
		}
	}

	/* A zero-size anchor on the geography; everything hangs off its centre. */
	.node {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		will-change: transform, opacity;
	}

	.glow,
	.ring,
	.dot,
	.label {
		position: absolute;
		left: 0;
		top: 0;
		translate: -50% -50%;
	}

	.glow,
	.ring,
	.dot {
		border-radius: 50%;
	}

	.glow {
		width: 72px;
		height: 72px;
		background: radial-gradient(circle, rgb(255 190 90 / 0.55) 0%, rgb(255 170 60 / 0.18) 40%, transparent 70%);
		animation: breathe 3.4s ease-in-out infinite;
	}

	@keyframes breathe {
		50% {
			transform: scale(1.25);
			opacity: 0.75;
		}
	}

	.dot {
		width: 12px;
		height: 12px;
		background: radial-gradient(circle at 35% 30%, #fff3cc, #e9b556 60%, #b26e1c);
		box-shadow: 0 0 0 3px rgb(11 20 48 / 0.9);
	}

	.hub .glow {
		width: 120px;
		height: 120px;
		animation-duration: 2.6s;
	}

	.hub .dot {
		width: 16px;
		height: 16px;
	}

	.ring {
		width: 28px;
		height: 28px;
		border: 1.5px solid rgb(247 208 125 / 0.9);
		animation: pulse 2.4s ease-out infinite;
	}

	.ring.second {
		animation-delay: -1.2s;
	}

	@keyframes pulse {
		from {
			transform: scale(0.8);
			opacity: 0.9;
		}
		to {
			transform: scale(2.8);
			opacity: 0;
		}
	}

	.label {
		translate: 16px -50%;
		white-space: nowrap;
		font: 600 clamp(11px, 1.1vw, 14px) / 1 var(--font-sans);
		letter-spacing: 0.06em;
		color: var(--on-ink);
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
	}

	.node.left .label {
		translate: calc(-100% - 16px) -50%;
	}

	.hub .label {
		translate: 22px calc(-50% - 14px);
		font-weight: 700;
		color: var(--gold-bright);
	}

	/* Gold dust drifting up through the frame. */
	.dust {
		pointer-events: none;
	}

	.dust span {
		position: absolute;
		border-radius: 50%;
		background: #ffd592;
		box-shadow: 0 0 6px 1px rgb(255 190 90 / 0.7);
		opacity: 0;
		animation: drift var(--dur) ease-in-out var(--delay) infinite;
		will-change: transform, opacity;
	}

	@keyframes drift {
		0% {
			transform: translate3d(0, var(--drift), 0);
			opacity: 0;
		}
		20% {
			opacity: 0.8;
		}
		50% {
			transform: translate3d(6px, 0, 0);
		}
		80% {
			opacity: 0.6;
		}
		100% {
			transform: translate3d(-4px, calc(var(--drift) * -1), 0);
			opacity: 0;
		}
	}

	.dim {
		position: absolute;
		inset: 0;
		background: radial-gradient(55% 55% at 50% 50%, transparent 28%, rgb(4 7 15 / 0.92) 100%);
		opacity: 0;
		pointer-events: none;
	}

	.credit {
		position: absolute;
		right: var(--space-3);
		bottom: var(--space-2);
		font: 500 10px/1.3 var(--font-sans);
		letter-spacing: 0.04em;
		color: rgb(246 236 216 / 0.4);
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
	}

	.credit .short {
		display: none;
	}

	/* ---- narrow screens: map on top, words below ---- */
	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 52svh) minmax(0, 1fr);
			align-items: stretch;
			gap: var(--space-4);
			padding-block: var(--space-4) var(--space-6);
		}

		.map-col {
			--map-h: 52svh;
			order: -1;
		}

		.copy {
			align-items: start;
		}

		h2,
		h3 {
			font-size: clamp(28px, 7vw, 40px);
		}

		.panel p {
			font-size: 15px;
		}

		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--space-2);
		}

		.cards li {
			align-items: center;
			padding: var(--space-2) var(--space-3);
		}

		.card-text span {
			display: none;
		}

		.card-text strong {
			font-size: 13px;
		}

		.card-icon {
			width: 30px;
			height: 30px;
		}

		.card-icon :global(svg) {
			width: 16px;
			height: 16px;
		}

		.formats h3 {
			font-size: clamp(24px, 6vw, 32px);
		}

		.glow {
			width: 48px;
			height: 48px;
		}

		.hub .glow {
			width: 80px;
			height: 80px;
		}

		.label {
			font-size: 11px;
		}

		.node.edge .label {
			translate: calc(-100% - 14px) -50%;
		}

		.hub .label {
			translate: -50% 26px;
		}

		.credit {
			font-size: 9px;
		}

		.credit .long {
			display: none;
		}

		.credit .short {
			display: inline;
		}
	}

	/* ---- reduced motion: the chapter reads top to bottom, nothing pinned or looping ---- */
	.story.static {
		height: auto;
		padding-block: clamp(var(--section-space-min), 9vw, var(--section-space-max));
	}

	.static .stage {
		position: static;
		height: auto;
		overflow: visible;
		contain: none;
	}

	.static .grid {
		align-items: start;
		height: auto;
	}

	.static .copy {
		gap: var(--space-12);
	}

	.static .panel {
		grid-area: auto;
		opacity: 1;
	}

	.static .map-col {
		position: sticky;
		top: var(--space-6);
		--map-h: min(88svh, 720px);
	}

	.static .hint,
	.static .dim,
	.static .pulses,
	.static .dust,
	.static .ring {
		display: none;
	}

	.static .glow,
	.static .hint :global(svg) {
		animation: none;
	}
</style>
