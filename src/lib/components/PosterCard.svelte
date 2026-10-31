<script lang="ts">
	import { onMount } from 'svelte';
	import { LoaderCircle, Move, RotateCcw } from '@lucide/svelte';
	import {
		POSTER_K,
		analysePhoto,
		limitFraming,
		loadImage,
		loadPosterAssets,
		renderPoster,
		type PhotoMeta,
		type PosterAssets,
		type PosterState
	} from '#lib/poster/renderer.ts';
	import { resolvedIndustry, type RegistrationDraft } from '#lib/registration.ts';
	import { siteConfig } from '#lib/site-config.svelte.ts';

	interface Props {
		draft: RegistrationDraft;
		photoUrl: string | null;
		zoom: number;
		dx: number;
		dy: number;
		/** Lock the framing once the poster has been sent with the registration. */
		locked?: boolean;
	}

	let { draft, photoUrl, zoom = $bindable(), dx = $bindable(), dy = $bindable(), locked = false }: Props = $props();

	let canvas: HTMLCanvasElement;
	let assets = $state<PosterAssets | null>(null);
	let photo = $state<HTMLImageElement | null>(null);
	let photoMeta = $state<PhotoMeta | null>(null);
	let dragging = $state(false);
	const adjustable = $derived(!!photo && !locked);

	const name = $derived(draft.fullName.trim());
	const posterState = $derived<PosterState>({
		name,
		title: draft.designation.trim(),
		company: draft.companyName.trim(),
		// Mirrors the poster maker: the placeholder pill shows until a name is typed.
		category: resolvedIndustry(draft) || (name ? '' : null),
		photo,
		photoMeta,
		zoom,
		dx,
		dy,
		event: siteConfig.event
	});

	onMount(() => {
		loadPosterAssets().then((a) => (assets = a));
	});

	// New photo: analyse it (cut-out or full photo) and reset the framing.
	$effect(() => {
		const url = photoUrl;
		if (!url) {
			photo = null;
			photoMeta = null;
			return;
		}
		let cancelled = false;
		loadImage(url).then((img) => {
			if (cancelled) return;
			photoMeta = analysePhoto(img);
			photo = img;
		});
		return () => {
			cancelled = true;
		};
	});

	let frame = 0;
	$effect(() => {
		const st = posterState;
		const a = assets;
		if (!a) return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => renderPoster(canvas, st, a));
		return () => cancelAnimationFrame(frame);
	});

	// Drag to reposition, in the poster maker's units.
	let drag: { x: number; y: number; dx: number; dy: number } | null = null;

	function onPointerDown(event: PointerEvent) {
		if (!adjustable) return;
		drag = { x: event.clientX, y: event.clientY, dx, dy };
		canvas.setPointerCapture(event.pointerId);
		dragging = true;
	}

	function onPointerMove(event: PointerEvent) {
		if (!drag) return;
		const s = canvas.width / canvas.clientWidth / POSTER_K;
		// Stop at the arch's edge: the photo can never be dragged out of it.
		const kept = limitFraming({
			...posterState,
			dx: Math.round(drag.dx + (event.clientX - drag.x) * s),
			dy: Math.round(drag.dy + (event.clientY - drag.y) * s)
		});
		dx = kept.dx;
		dy = kept.dy;
	}

	// Sliders and zoom changes: settle the offsets on what is actually shown.
	$effect(() => {
		if (!photo || dragging) return;
		const kept = limitFraming(posterState);
		if (kept.dx !== dx) dx = kept.dx;
		if (kept.dy !== dy) dy = kept.dy;
	});

	function onPointerUp() {
		drag = null;
		dragging = false;
	}

	function resetFraming() {
		zoom = 1;
		dx = 0;
		dy = 0;
	}

	const label = $derived(
		`Poster preview: I am attending Midtown Business Conclave. ${name || 'Your name'}, ${
			draft.designation.trim() || 'designation'
		}, ${draft.companyName.trim() || 'company'}.`
	);
</script>

<div class="poster-card">
	<div class="frame" class:loading={!assets} role="group" aria-label="Poster preview">
		<p class="visually-hidden">{label}</p>
		<canvas
			bind:this={canvas}
			width="1080"
			height="1920"
			class:draggable={adjustable}
			class:dragging
			aria-hidden="true"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		></canvas>
		{#if !assets}
			<span class="loading-text"><LoaderCircle size={18} class="spin" aria-hidden="true" /> Loading your poster…</span>
		{/if}
		{#if adjustable && !dragging}
			<span class="drag-hint" aria-hidden="true"><Move size={14} /> Drag to reposition</span>
		{/if}
	</div>

	{#if adjustable}
		<div class="controls">
			<label>
				<span>Zoom</span>
				<input type="range" min="0.5" max="2.2" step="0.01" bind:value={zoom} />
			</label>
			<label>
				<span>Left / right</span>
				<input type="range" min="-260" max="260" step="1" bind:value={dx} />
			</label>
			<label>
				<span>Up / down</span>
				<input type="range" min="-360" max="360" step="1" bind:value={dy} />
			</label>
			<button type="button" class="reset" onclick={resetFraming}><RotateCcw size={14} aria-hidden="true" /> Reset</button>
		</div>
	{/if}

</div>

<style>
	.poster-card {
		display: grid;
		gap: var(--space-4);
		justify-items: center;
		width: 100%;
	}

	.frame {
		position: relative;
		width: 100%;
		/* Keep the whole 9:16 poster inside the viewport while it sticks. */
		max-width: min(380px, calc((100svh - 200px) * 9 / 16));
		min-width: 220px;
		border-radius: 12px;
		background: #070b16;
		box-shadow:
			0 0 0 1px rgb(240 196 112 / 0.35),
			0 24px 60px -20px rgb(7 11 22 / 0.55);
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: auto;
		touch-action: pan-y;
	}

	canvas.draggable {
		cursor: grab;
		touch-action: none;
	}

	canvas.dragging {
		cursor: grabbing;
	}

	.loading .loading-text,
	.loading-text {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: #f6ecd8;
		font: var(--text-caption);
	}

	.drag-hint {
		position: absolute;
		left: 50%;
		top: 46%;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 999px;
		background: rgb(6 8 13 / 0.72);
		color: #f6ecd8;
		font: 600 12px/1 var(--font-sans);
		transform: translate(-50%, -50%);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--duration-disclosure) var(--ease-out);
	}

	.frame:hover .drag-hint {
		opacity: 1;
	}

	.controls {
		display: grid;
		gap: var(--space-2);
		width: 100%;
		max-width: 380px;
	}

	.controls label {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr);
		align-items: center;
		gap: var(--space-3);
		font: 500 13px/1.3 var(--font-sans);
		color: var(--text-supporting);
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--gold-ink);
	}

	.reset {
		justify-self: end;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--gold-ink);
		font: 600 13px/1.3 var(--font-sans);
		cursor: pointer;
	}

	.reset:hover {
		background: var(--gold-tint);
	}

</style>
