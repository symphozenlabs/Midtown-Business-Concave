<script lang="ts">
	import { tick } from 'svelte';
	import { ArrowLeft, Box, ChevronDown, ChevronRight, MapPinOff, Search } from '@lucide/svelte';
	import FloorMap3D from '#lib/components/floor-map/FloorMap3D.svelte';
	import { zoneInfo } from '#lib/floor-map/layout.ts';

	let { data } = $props();

	/** Visitors first see the rooms and what each one is for, then step into 3D. */
	let entered = $state(false);
	/** The room whose description is open in the list. */
	let openId = $state<string | null>(null);
	let query = $state('');
	let stallsOpen = $state(false);
	let viewer = $state<ReturnType<typeof FloorMap3D>>();

	type Item = { id: string; name: string; kind: string; color: string; description: string };
	const toItem = (z: { id: string; name: string; type: string; color: string; description: string }): Item => ({
		id: z.id,
		name: z.name || zoneInfo(z.type).label,
		kind: zoneInfo(z.type).label,
		color: z.color,
		description: z.description
	});
	const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, undefined, { numeric: true });

	const rooms = $derived(data.found ? data.layout.zones.filter((z) => z.type !== 'stall').map(toItem) : []);
	const stalls = $derived(data.found ? data.layout.zones.filter((z) => z.type === 'stall').map(toItem).sort(byName) : []);
	const q = $derived(query.trim().toLowerCase());
	const match = (i: Item) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
	const shownRooms = $derived(rooms.filter(match));
	const shownStalls = $derived(stalls.filter(match));

	async function enter(focusId?: string) {
		entered = true;
		window.scrollTo({ top: 0 });
		if (!focusId) return;
		await tick();
		viewer?.focusZone(focusId);
	}
</script>

<svelte:head>
	<title>{data.found ? `${data.title} · 3D floor map` : 'Floor map not available'} · Midtown Business Conclave</title>
	<meta name="robots" content="noindex" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

{#snippet card(item: Item)}
	{@const isOpen = openId === item.id}
	<li class="card" class:open={isOpen}>
		<!-- Tapping the room title shows (or hides) its description. -->
		<button type="button" class="title" aria-expanded={isOpen} aria-controls="desc-{item.id}" onclick={() => (openId = isOpen ? null : item.id)}>
			<span class="swatch" style:background={item.color} aria-hidden="true"></span>
			<span class="text">
				<strong>{item.name}</strong>
				<small>{item.kind}</small>
			</span>
			<ChevronDown size={18} aria-hidden="true" class="chev" />
		</button>
		{#if isOpen}
			<div class="more" id="desc-{item.id}">
				{#if item.description}<p class="desc">{item.description}</p>{:else}<p class="desc none">No description yet.</p>{/if}
				<button type="button" class="go" onclick={() => enter(item.id)}>
					<Box size={16} aria-hidden="true" /> Show {item.name} in 3D <ChevronRight size={16} aria-hidden="true" />
				</button>
			</div>
		{/if}
	</li>
{/snippet}

{#if !data.found}
	<div class="missing">
		<MapPinOff size={40} aria-hidden="true" />
		<h1>This floor map is not available</h1>
		<p>The organisers may be updating it. Please try again shortly, or ask at the help desk.</p>
		<a href="/">Midtown Business Conclave 2026</a>
	</div>
{:else if !entered}
	<div class="intro">
		<header class="bar">
			<img src="/poster/mbc.webp" alt="Midtown Business Conclave" width="1655" height="747" />
			<div class="titles">
				<strong>{data.title}</strong>
				<span>Floor map</span>
			</div>
		</header>

		<main class="list-wrap">
			<section class="hero">
				<img class="plan" src={data.imageUrl} alt="Floor plan of {data.title}" />
				<button type="button" class="enter" onclick={() => enter()}>
					<Box size={20} aria-hidden="true" /> Explore in 3D
				</button>
				<p class="lead">Turn and zoom the venue in 3D. Tap a room name below to read about it, then jump straight to it.</p>
			</section>

			{#if rooms.length || stalls.length}
				<label class="search">
					<Search size={16} aria-hidden="true" />
					<input type="search" placeholder="Find a room, area or stall" bind:value={query} aria-label="Find a room, area or stall" />
				</label>
			{/if}

			{#if rooms.length}
				<section aria-labelledby="rooms-h">
					<h2 id="rooms-h">Rooms &amp; areas</h2>
					{#if shownRooms.length}
						<ul class="cards">
							{#each shownRooms as item (item.id)}{@render card(item)}{/each}
						</ul>
					{:else}
						<p class="none">No room matches “{query}”.</p>
					{/if}
				</section>
			{/if}

			{#if stalls.length}
				<section aria-labelledby="stalls-h">
					<button type="button" class="fold" aria-expanded={stallsOpen || Boolean(q)} onclick={() => (stallsOpen = !stallsOpen)}>
						<h2 id="stalls-h">Stalls ({stalls.length})</h2>
						<ChevronDown size={18} aria-hidden="true" />
					</button>
					{#if stallsOpen || q}
						{#if shownStalls.length}
							<ul class="cards">
								{#each shownStalls as item (item.id)}{@render card(item)}{/each}
							</ul>
						{:else}
							<p class="none">No stall matches “{query}”.</p>
						{/if}
					{/if}
				</section>
			{/if}
		</main>
	</div>
{:else}
	<div class="page">
		<header class="bar">
			<button type="button" class="back" onclick={() => (entered = false)}>
				<ArrowLeft size={16} aria-hidden="true" /> Rooms
			</button>
			<div class="titles">
				<strong>{data.title}</strong>
				<span>3D floor map</span>
			</div>
		</header>
		<main class="stage">
			<FloorMap3D
				bind:this={viewer}
				imageUrl={data.imageUrl}
				imageWidth={data.imageWidth}
				imageHeight={data.imageHeight}
				scale={data.scale}
				layout={data.layout}
			/>
		</main>
	</div>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px max(14px, env(safe-area-inset-left));
		background: #0c1730;
		color: #fff;
	}

	.bar img {
		width: 78px;
		height: auto;
	}

	.titles {
		display: grid;
		min-width: 0;
		line-height: 1.25;
	}

	.titles strong {
		overflow: hidden;
		font-size: 15px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.titles span {
		font-size: 12px;
		color: #d8ccae;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		padding: 0 12px;
		border: 1px solid rgb(227 176 75 / 0.6);
		border-radius: 10px;
		background: transparent;
		color: #fff;
		font: 600 13px/1 var(--font-sans, system-ui);
		cursor: pointer;
	}

	/* ---------- rooms list ---------- */

	.intro {
		min-height: 100svh;
		background: #f4f5f1;
	}

	.list-wrap {
		display: grid;
		gap: 20px;
		max-width: 760px;
		margin: 0 auto;
		padding: 16px 14px 48px;
	}

	.hero {
		display: grid;
		gap: 12px;
		padding: 12px;
		border-radius: 16px;
		background: #fff;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.06);
	}

	.plan {
		width: 100%;
		max-height: 300px;
		object-fit: contain;
		border-radius: 10px;
		background: #eef1f5;
	}

	.enter {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 52px;
		border: 0;
		border-radius: 12px;
		background: #e3b04b;
		color: #0c1730;
		font: 700 17px/1 var(--font-sans, system-ui);
		cursor: pointer;
	}

	.enter:hover {
		background: #c9952f;
	}

	.lead {
		margin: 0;
		font-size: 14px;
		color: #475569;
		text-align: center;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid #cbd5e1;
		border-radius: 12px;
		background: #fff;
		color: #64748b;
	}

	.search input {
		flex: 1;
		min-height: 46px;
		border: 0;
		outline: none;
		background: transparent;
		font: inherit;
		font-size: 15px;
		color: #111827;
	}

	h2 {
		margin: 0 0 10px;
		font: 700 16px/1.3 var(--font-sans, system-ui);
		color: #0c1730;
	}

	.fold {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: #0c1730;
		cursor: pointer;
	}

	.fold h2 {
		margin: 0;
	}

	.fold[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}

	.fold + :global(.cards),
	.fold + .none {
		margin-top: 10px;
	}

	.cards {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		overflow: hidden;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		background: #fff;
	}

	.card.open {
		border-color: #e3b04b;
	}

	.title {
		display: grid;
		grid-template-columns: 14px minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 14px;
		border: 0;
		background: none;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.title :global(.chev) {
		color: #6b7280;
		transition: transform 160ms ease;
	}

	.title[aria-expanded='true'] :global(.chev) {
		transform: rotate(180deg);
	}

	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 4px;
	}

	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.text strong {
		font-size: 16px;
		color: #111827;
	}

	.text small {
		font-size: 12px;
		color: #6b7280;
	}

	.more {
		display: grid;
		gap: 12px;
		padding: 0 14px 14px 40px;
	}

	.desc {
		margin: 0;
		font-size: 14px;
		line-height: 1.55;
		color: #374151;
		white-space: pre-line;
	}

	.desc.none {
		color: #9ca3af;
	}

	.go {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: 6px;
		min-height: 40px;
		padding: 0 14px;
		border: 0;
		border-radius: 10px;
		background: #0c1730;
		color: #fff;
		font: 600 13px/1 var(--font-sans, system-ui);
		cursor: pointer;
	}

	.none {
		margin: 0;
		color: #6b7280;
		font-size: 14px;
	}

	/* ---------- 3D ---------- */

	.page {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100svh;
		background: #0c1730;
	}

	.stage {
		position: relative;
		min-height: 0;
	}

	.missing {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 12px;
		min-height: 100svh;
		padding: 24px;
		background: #0c1730;
		color: #fff;
		text-align: center;
	}

	.missing h1 {
		font-size: 22px;
		color: #fff;
	}

	.missing p {
		max-width: 380px;
		color: #d8ccae;
	}

	.missing a {
		color: #e3b04b;
	}
</style>
