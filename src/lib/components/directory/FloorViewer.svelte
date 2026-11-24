<script lang="ts">
	import { MessageCircle, Minus, UserPlus, Plus, RotateCcw, X } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { lockPageScroll } from '#lib/smooth-scroll.ts';
	import { STALL_NUMBERS } from '#lib/stall-booking.ts';
	import { FLOOR, SIDE_LABEL, STALL_SPOTS, stallSide } from '#lib/stall-directory/rules.ts';

	/**
	 * The floor layout full screen: fits the window with no scrolling, zooms between
	 * 1× and 4× (buttons, wheel, pinch, double tap) and pans by dragging. Hovering a
	 * stall names it; tapping one opens its details, with a message button for a
	 * confirmed stall and "choose as preferred" for an open one.
	 */
	interface Props {
		open: boolean;
		/** Confirmed stalls with their business. `own`: the signed-in exhibitor's stall. */
		exhibitors: { id: string; stall: number; businessName: string; own?: boolean; cardPath?: string }[];
		/** Picks an open stall as the booking preference; leave out to hide that button. */
		onpick?: (stall: number) => void;
		preferred?: number | null;
		/** A stall to show selected when the viewer opens. */
		focus?: number | null;
		/** Show a Message button on confirmed stalls (not for exhibitors browsing). */
		canMessage?: boolean;
		onclose: () => void;
	}

	let { open, exhibitors, onpick, preferred = null, focus = null, canMessage = true, onclose }: Props = $props();

	const MIN = 1;
	const MAX = 4;
	const STEP = 1.5;

	let dialog: HTMLDialogElement | undefined = $state();
	let stage: HTMLDivElement | undefined = $state();
	let stageW = $state(0);
	let stageH = $state(0);
	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let hover = $state<{ n: number; x: number; y: number } | null>(null);
	let picked = $state<number | null>(null);

	const byStall = $derived(new Map(exhibitors.map((e) => [e.stall, e])));
	const ratio = FLOOR.width / FLOOR.height;
	// The layout fitted inside the window at 1×.
	const baseW = $derived(Math.max(1, Math.min(stageW, stageH * ratio)));
	const baseH = $derived(baseW / ratio);

	function clampPan(s: number, x: number, y: number) {
		const maxX = Math.max(0, (baseW * s - stageW) / 2);
		const maxY = Math.max(0, (baseH * s - stageH) / 2);
		return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
	}

	/** Zooms to `next`, keeping the point (px, py) from the stage centre where it is. */
	function zoomTo(next: number, px = 0, py = 0) {
		const s = Math.min(MAX, Math.max(MIN, next));
		const k = s / scale;
		const p = clampPan(s, px - (px - tx) * k, py - (py - ty) * k);
		scale = s;
		tx = p.x;
		ty = p.y;
	}

	const reset = () => {
		scale = 1;
		tx = 0;
		ty = 0;
	};

	/** A point from a pointer or wheel event, relative to the stage centre. */
	function local(e: { clientX: number; clientY: number }) {
		const r = stage!.getBoundingClientRect();
		return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
	}

	// Open and close with the page frozen behind.
	$effect(() => {
		if (!open || !dialog) return;
		reset();
		picked = untrack(() => focus);
		hover = null;
		if (!dialog.open) dialog.showModal();
		const unlock = lockPageScroll();
		return () => {
			unlock();
			if (dialog?.open) dialog.close();
		};
	});

	// Wheel zoom needs a non-passive listener so the page never scrolls.
	$effect(() => {
		if (!stage) return;
		const el = stage;
		const onwheel = (e: WheelEvent) => {
			e.preventDefault();
			const p = local(e);
			zoomTo(scale * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), p.x, p.y);
		};
		el.addEventListener('wheel', onwheel, { passive: false });
		return () => el.removeEventListener('wheel', onwheel);
	});

	// Keep the pan inside the edges when the window resizes.
	$effect(() => {
		void stageW;
		void stageH;
		const p = clampPan(scale, tx, ty);
		tx = p.x;
		ty = p.y;
	});

	/* ---------- drag and pinch ---------- */

	const pointers = new Map<number, { x: number; y: number }>();
	let gesture: { dist: number; scale: number; mid: { x: number; y: number } } | null = null;
	let moved = 0;
	let lastTap = 0;

	function onpointerdown(e: PointerEvent) {
		if ((e.target as Element).closest('.card, .tools')) return;
		// No pointer capture yet: a plain tap must still reach the stall under it.
		pointers.set(e.pointerId, local(e));
		moved = 0;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
		}
	}

	function onpointermove(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const now = local(e);
		pointers.set(e.pointerId, now);
		if (pointers.size === 2 && gesture) {
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			zoomTo((gesture.scale * dist) / gesture.dist, mid.x, mid.y);
			const p = clampPan(scale, tx + mid.x - gesture.mid.x, ty + mid.y - gesture.mid.y);
			tx = p.x;
			ty = p.y;
			gesture.mid = mid;
			moved += 10;
		} else if (pointers.size === 1) {
			const dx = now.x - prev.x;
			const dy = now.y - prev.y;
			moved += Math.abs(dx) + Math.abs(dy);
			// A drag: keep receiving moves even when the pointer leaves the stage.
			if (moved > 6 && !stage?.hasPointerCapture(e.pointerId)) stage?.setPointerCapture(e.pointerId);
			if (scale > 1) {
				const p = clampPan(scale, tx + dx, ty + dy);
				tx = p.x;
				ty = p.y;
			}
		}
	}

	function onpointerup(e: PointerEvent) {
		const at = pointers.get(e.pointerId);
		pointers.delete(e.pointerId);
		if (pointers.size < 2) gesture = null;
		if (!at || moved > 6 || pointers.size) return;
		// Double tap on the floor (not a stall) zooms in, or back out at the limit.
		if (!(e.target as Element).closest('.spot')) {
			const t = Date.now();
			if (t - lastTap < 300) {
				zoomTo(scale >= MAX - 0.01 ? 1 : scale * 2, at.x, at.y);
				lastTap = 0;
			} else {
				lastTap = t;
				picked = null;
			}
		}
	}

	function choose(n: number) {
		if (moved > 6) return;
		picked = picked === n ? null : n;
		hover = null;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === '+' || e.key === '=') zoomTo(scale * STEP);
		else if (e.key === '-' || e.key === '_') zoomTo(scale / STEP);
		else if (e.key === '0') reset();
		else return;
		e.preventDefault();
	}

	const pickedInfo = $derived(picked ? { n: picked, e: byStall.get(picked) ?? null, side: stallSide(picked) } : null);
</script>

<dialog
	class="viewer"
	bind:this={dialog}
	aria-label="Stall layout"
	onclose={onclose}
	oncancel={(e) => {
		// Esc closes the stall card first, then the viewer.
		if (picked) {
			e.preventDefault();
			picked = null;
		}
	}}
	{onkeydown}
>
	<div
		class="stage"
		bind:this={stage}
		bind:clientWidth={stageW}
		bind:clientHeight={stageH}
		class:zoomed={scale > 1}
		role="application"
		aria-label="Floor layout. Use plus and minus to zoom."
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={onpointerup}
	>
		<div class="canvas" style:width="{baseW}px" style:height="{baseH}px" style:transform="translate({tx}px, {ty}px) scale({scale})">
			<img src={FLOOR.src} alt="Floor layout with stall numbers 1 to 39" width={FLOOR.width} height={FLOOR.height} draggable="false" />
			<svg viewBox="0 0 {FLOOR.width} {FLOOR.height}" aria-label="Stalls">
				{#each STALL_NUMBERS as n (n)}
					{@const s = STALL_SPOTS[n]}
					{@const ex = byStall.get(n)}
					<g
						class="spot"
						class:taken={!!ex}
						class:picked={picked === n}
						class:mine={preferred === n}
						role="button"
						tabindex="0"
						aria-label={ex ? `Stall ${n}: ${ex.businessName}` : `Stall ${n}: open`}
						onclick={() => choose(n)}
						onkeydown={(ev) => {
							if (ev.key === 'Enter' || ev.key === ' ') {
								ev.preventDefault();
								picked = n;
							}
						}}
						onpointerenter={(ev) => ev.pointerType === 'mouse' && (hover = { n, ...local(ev) })}
						onpointermove={(ev) => ev.pointerType === 'mouse' && hover?.n === n && (hover = { n, ...local(ev) })}
						onpointerleave={() => hover?.n === n && (hover = null)}
						onfocus={() => (hover = null)}
					>
						<rect x={s.x} y={s.y} width={s.w} height={s.h} rx="6" />
					</g>
				{/each}
			</svg>
		</div>

		{#if hover && hover.n !== picked}
			{@const ex = byStall.get(hover.n)}
			<div class="tip" style:left="calc(50% + {hover.x}px)" style:top="calc(50% + {hover.y}px)" aria-hidden="true">
				<strong>Stall {hover.n}</strong>
				<span>{ex ? ex.businessName : 'Open · available to book'}</span>
			</div>
		{/if}
	</div>

	<div class="tools" role="toolbar" aria-label="Zoom">
		<button type="button" onclick={() => zoomTo(scale / STEP)} disabled={scale <= MIN + 0.001} aria-label="Zoom out"><Minus size={20} aria-hidden="true" /></button>
		<span class="level" aria-live="polite">{Math.round(scale * 100)}%</span>
		<button type="button" onclick={() => zoomTo(scale * STEP)} disabled={scale >= MAX - 0.001} aria-label="Zoom in"><Plus size={20} aria-hidden="true" /></button>
		<button type="button" onclick={reset} disabled={scale === 1 && tx === 0 && ty === 0} aria-label="Fit to screen"><RotateCcw size={18} aria-hidden="true" /></button>
	</div>

	<button type="button" class="close" onclick={() => dialog?.close()} aria-label="Close"><X size={22} aria-hidden="true" /></button>

	{#if pickedInfo}
		<div class="card" role="dialog" aria-label="Stall {pickedInfo.n}">
			<span class="num" class:open={!pickedInfo.e}>{pickedInfo.n}</span>
			<div class="who">
				<strong>{pickedInfo.e ? pickedInfo.e.businessName : `Stall ${pickedInfo.n} is open`}</strong>
				<span>
					{pickedInfo.e ? `${pickedInfo.e.own ? 'Your stall' : 'Stall'} ${pickedInfo.n}` : 'Available to book'}{#if pickedInfo.side}{' · '}{SIDE_LABEL[pickedInfo.side]}{/if}
				</span>
			</div>
			{#if pickedInfo.e?.cardPath && !pickedInfo.e.own}
				<a class="act act-alt" href={pickedInfo.e.cardPath} aria-label="Save {pickedInfo.e.businessName}’s contact">
					<UserPlus size={18} aria-hidden="true" /> Save contact
				</a>
			{/if}
			{#if pickedInfo.e?.own}
				<a class="act" href="/stallDirectory/exhibitor">My stall</a>
			{:else if pickedInfo.e && canMessage}
				<a class="act" href="/stallDirectory/{pickedInfo.e.id}" aria-label="Message {pickedInfo.e.businessName}">
					<MessageCircle size={19} aria-hidden="true" /> Message
				</a>
			{:else if onpick}
				<button
					type="button"
					class="act"
					onclick={() => {
						onpick(pickedInfo.n);
						dialog?.close();
					}}
				>
					{preferred === pickedInfo.n ? 'Your preference' : 'Choose as preferred'}
				</button>
			{/if}
			<button type="button" class="card-x" onclick={() => (picked = null)} aria-label="Close stall details"><X size={16} aria-hidden="true" /></button>
		</div>
	{/if}
</dialog>

<style>
	.viewer {
		width: 100vw;
		max-width: none;
		height: 100dvh;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: rgb(6 11 26 / 0.96);
		color: var(--on-ink);
		overflow: hidden;
		overscroll-behavior: contain;
	}
	.viewer::backdrop {
		background: rgb(6 11 26 / 0.9);
	}
	.stage {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		cursor: default;
	}
	.stage.zoomed {
		cursor: grab;
	}
	.stage.zoomed:active {
		cursor: grabbing;
	}
	.canvas {
		position: relative;
		transform-origin: center;
		will-change: transform;
	}
	.canvas img {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.spot {
		cursor: pointer;
		outline: none;
	}
	.spot rect {
		fill: rgb(255 255 255 / 0);
		stroke: rgb(255 255 255 / 0);
		stroke-width: 4;
		transition: fill 0.12s, stroke 0.12s;
	}
	.spot.taken rect {
		fill: rgb(227 176 75 / 0.22);
		stroke: rgb(227 176 75 / 0.9);
	}
	.spot:hover rect,
	.spot:focus-visible rect {
		fill: rgb(227 176 75 / 0.35);
		stroke: #ffffff;
	}
	.spot.mine rect {
		stroke: #ffffff;
		stroke-dasharray: 10 6;
	}
	.spot.picked rect {
		fill: rgb(227 176 75 / 0.6);
		stroke: #ffffff;
		stroke-width: 7;
	}
	.tip {
		position: absolute;
		z-index: 2;
		display: grid;
		gap: 1px;
		max-width: 240px;
		padding: 7px 10px;
		border-radius: 8px;
		background: #ffffff;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
		color: var(--charcoal);
		font-size: 13px;
		pointer-events: none;
		transform: translate(14px, 14px);
	}
	.tip strong {
		color: var(--gold-ink);
		font-size: 12px;
	}
	.tools {
		position: absolute;
		left: 50%;
		bottom: calc(16px + env(safe-area-inset-bottom));
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		background: rgb(6 11 26 / 0.85);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.15);
		transform: translateX(-50%);
	}
	.tools button,
	.close {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--on-ink);
		cursor: pointer;
	}
	.tools button:hover:not(:disabled) {
		background: rgb(255 255 255 / 0.12);
	}
	.tools button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.level {
		min-width: 48px;
		font: 600 13px/1 var(--font-sans);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	.close {
		position: absolute;
		top: calc(12px + env(safe-area-inset-top));
		right: 12px;
		z-index: 3;
		background: rgb(6 11 26 / 0.85);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.15);
	}
	.tools button:focus-visible,
	.close:focus-visible,
	.act-alt {
		border: 1px solid rgb(255 255 255 / 0.35);
		background: transparent;
		color: var(--on-ink);
	}
	.act:focus-visible,
	.card-x:focus-visible {
		outline: 2px solid var(--focus-ring-inverse);
		outline-offset: 2px;
	}
	.card {
		position: absolute;
		left: 50%;
		bottom: calc(76px + env(safe-area-inset-bottom));
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 12px;
		width: min(440px, calc(100vw - 24px));
		padding: 12px 40px 12px 12px;
		border-radius: 14px;
		background: #ffffff;
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
		color: var(--charcoal);
		transform: translateX(-50%);
	}
	.num {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 8px;
		background: var(--ink);
		color: var(--gold);
		font: 700 16px/1 var(--font-sans);
	}
	.num.open {
		background: var(--mist);
		color: var(--text-supporting);
	}
	.who {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.who strong {
		font-size: 15px;
		overflow-wrap: anywhere;
	}
	.who span {
		color: var(--text-supporting);
		font-size: 12.5px;
	}
	.act {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		background: var(--gold);
		color: var(--ink);
		font: 600 13.5px var(--font-sans);
		text-decoration: none;
		cursor: pointer;
	}
	.card-x {
		position: absolute;
		top: 6px;
		right: 6px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-supporting);
		cursor: pointer;
	}
	@media (max-width: 480px) {
		.card {
			flex-wrap: wrap;
		}
		.act {
			flex: 1 1 100%;
			justify-content: center;
		}
	}
</style>
