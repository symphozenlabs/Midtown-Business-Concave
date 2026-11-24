<script lang="ts">
	import { STALL_NUMBERS } from '#lib/stall-booking.ts';
	import { FLOOR, STALL_SPOTS, type Exhibitor } from '#lib/stall-directory/rules.ts';

	interface Props {
		/** Confirmed stalls; those with a stall number light up on the map. */
		exhibitors: Exhibitor[];
		/** The stall to point out. */
		selected?: number | null;
		/** Tapping a taken stall. Without it, taken stalls link to their page. */
		onselect?: (stall: number) => void;
		/** Stalls matching the search, when one is typed; the rest dim. */
		matches?: Set<number> | null;
		/** Shrink to the column instead of scrolling sideways (for a laptop side panel). */
		fit?: boolean;
	}

	let { exhibitors, selected = null, onselect, matches = null, fit = false }: Props = $props();

	const byStall = $derived(new Map(exhibitors.filter((e) => e.stall !== null).map((e) => [e.stall!, e])));

	let scroller: HTMLDivElement | undefined = $state();

	// Bring the chosen stall into view on a narrow screen, where the map scrolls sideways.
	$effect(() => {
		const spot = selected ? STALL_SPOTS[selected] : null;
		if (!spot || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
		const scale = scroller.scrollWidth / FLOOR.width;
		const left = (spot.x + spot.w / 2) * scale - scroller.clientWidth / 2;
		scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
	});
</script>

<figure class="floor">
	<div class="scroll" bind:this={scroller}>
		<div class="canvas" class:fit>
			<img src={FLOOR.src} alt="" width={FLOOR.width} height={FLOOR.height} decoding="async" draggable="false" />
			<svg viewBox="0 0 {FLOOR.width} {FLOOR.height}" role="group" aria-label="Floor map: stalls 1 to 39 around the hall">
				{#each STALL_NUMBERS as n (n)}
					{@const spot = STALL_SPOTS[n]}
					{@const e = byStall.get(n)}
					{@const dim = matches !== null && !matches.has(n)}
					{#if e}
						{#if onselect}
							<g
								class="spot taken"
								class:selected={selected === n}
								class:dim
								role="button"
								tabindex="0"
								aria-label="Stall {n}: {e.businessName}"
								aria-pressed={selected === n}
								onclick={() => onselect(n)}
								onkeydown={(ev) => {
									if (ev.key === 'Enter' || ev.key === ' ') {
										ev.preventDefault();
										onselect(n);
									}
								}}
							>
								<rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx="6" />
							</g>
						{:else}
							<a href="/stallDirectory/{e.id}" class="spot taken" class:selected={selected === n} class:dim aria-label="Stall {n}: {e.businessName}">
								<rect x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx="6" />
							</a>
						{/if}
					{:else}
						<rect class="spot free" class:dim x={spot.x} y={spot.y} width={spot.w} height={spot.h} rx="6" aria-hidden="true" />
					{/if}
				{/each}
				{#if selected && STALL_SPOTS[selected]}
					{@const s = STALL_SPOTS[selected]}
					<circle class="pin-ring" cx={s.x + s.w / 2} cy={s.y + s.h / 2} r={Math.max(s.w, s.h) * 0.75} aria-hidden="true" />
				{/if}
			</svg>
		</div>
	</div>
	<figcaption>
		<span class="key"><i class="sw taken"></i> Exhibitor</span>
		<span class="key"><i class="sw free"></i> Open stall</span>
		<span class="key"><i class="sw sel"></i> Selected</span>
		<span class="hint">Entry at the front · stage on the right</span>
	</figcaption>
</figure>

<style>
	.floor {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}
	.scroll {
		overflow-x: auto;
		border-radius: var(--radius-md);
		background: var(--ink);
		-webkit-overflow-scrolling: touch;
	}
	.canvas {
		position: relative;
		min-width: 640px;
		/* Quick taps on stalls must not select the picture (the site paints selections gold). */
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.canvas.fit {
		min-width: 0;
	}
	.canvas img {
		display: block;
		width: 100%;
		height: auto;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.spot rect,
	rect.spot {
		transition: fill 0.15s, stroke 0.15s, opacity 0.15s;
	}
	.taken rect {
		fill: rgb(227 176 75 / 0.28);
		stroke: #e3b04b;
		stroke-width: 4;
		cursor: pointer;
	}
	.taken:hover rect,
	.taken:focus-visible rect {
		fill: rgb(227 176 75 / 0.5);
		outline: none;
	}
	.taken:focus-visible {
		outline: none;
	}
	.taken:focus-visible rect {
		stroke: #ffffff;
		stroke-width: 6;
	}
	rect.free {
		fill: rgb(12 23 48 / 0.35);
		stroke: rgb(255 255 255 / 0.35);
		stroke-width: 2;
		stroke-dasharray: 8 6;
	}
	.selected rect {
		fill: rgb(227 176 75 / 0.7);
		stroke: #ffffff;
		stroke-width: 7;
	}
	.dim rect,
	rect.dim {
		opacity: 0.25;
	}
	.pin-ring {
		fill: none;
		stroke: #ffffff;
		stroke-width: 5;
		pointer-events: none;
		transform-box: fill-box;
		transform-origin: center;
		animation: ring 1.6s ease-out infinite;
	}
	@keyframes ring {
		from {
			opacity: 0.9;
			transform: scale(0.6);
		}
		to {
			opacity: 0;
			transform: scale(1.3);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pin-ring {
			animation: none;
			opacity: 0.8;
		}
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		color: var(--text-supporting);
		font-size: 12.5px;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}
	.sw.taken {
		border: 2px solid #e3b04b;
		background: rgb(227 176 75 / 0.35);
	}
	.sw.free {
		border: 2px dashed var(--control-border);
		background: var(--mist);
	}
	.sw.sel {
		border: 2px solid var(--ink);
		background: #e3b04b;
	}
	.hint {
		margin-left: auto;
	}
</style>
