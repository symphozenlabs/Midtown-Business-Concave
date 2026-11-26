<script lang="ts">
	import { page } from '$app/state';
	import { ChevronRight, Expand, Map as MapIcon, MapPin, MessageCircle, Search, Store, UserPlus } from '@lucide/svelte';
	import Avatar from './Avatar.svelte';
	import FloorMap from './FloorMap.svelte';
	import FloorViewer from './FloorViewer.svelte';
	import { FLOOR, SIDE_LABEL, matchesStall, stallSide, type Exhibitor } from '#lib/stall-directory/rules.ts';

	/**
	 * The stall list with search and the floor map: beside the list on a laptop, behind a
	 * map card on a phone. Used by the exhibitor's Stalls tab.
	 */
	interface Props {
		/** Every confirmed stall. */
		exhibitors: Exhibitor[];
		/** The signed-in exhibitor's own stalls: left out of the list, marked on the map. */
		mine?: string[];
		/** Delegates can message stalls; exhibitors browsing other stalls can't. */
		canMessage?: boolean;
		/** Each stall's contact card, by booking id: the "Save contact" button. */
		cards?: Record<string, string>;
	}

	let { exhibitors, mine: mineIds = [], canMessage = true, cards = {} }: Props = $props();

	let query = $state('');
	let mapOpen = $state(false);
	/** The stall to point out: from a row's pin, a tap on the map, or ?stall=. */
	let focus = $state<number | null>(Number(page.url.searchParams.get('stall')) || null);

	const mine = $derived(new Set(mineIds));
	const listed = $derived(exhibitors.filter((e) => !mine.has(e.id)));
	/** The signed-in exhibitor's own stalls, shown apart from the list so it never looks empty by mistake. */
	const own = $derived(exhibitors.filter((e) => mine.has(e.id)));
	const shown = $derived(listed.filter((e) => matchesStall(e, query)));
	const onMap = $derived(
		exhibitors.flatMap((e) =>
			e.stall ? [{ id: e.id, stall: e.stall, businessName: e.businessName, own: mine.has(e.id), cardPath: cards[e.id] }] : []
		)
	);
	const matches = $derived(query.trim() ? new Set(shown.flatMap((e) => (e.stall ? [e.stall] : []))) : null);
	const chosen = $derived(focus ? exhibitors.find((e) => e.stall === focus) ?? null : null);

	/** On a laptop the map is already beside the list: point the stall out there. */
	const sideMapShown = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 960px)').matches;

	function openMap(stall: number | null = null) {
		focus = stall;
		mapOpen = true;
	}

	function showStall(stall: number) {
		if (sideMapShown()) focus = stall;
		else openMap(stall);
	}
</script>

<div class="layout">
	<div class="main">
		<button type="button" class="map-card" onclick={() => openMap(focus)} aria-label="Open the floor map">
			<img src={FLOOR.src} alt="" width={FLOOR.width} height={FLOOR.height} loading="lazy" decoding="async" />
			<span class="map-text">
				<strong><MapIcon size={16} aria-hidden="true" /> Floor map</strong>
				<span>See where every stall is. Tap a stall for who’s there.</span>
			</span>
			<ChevronRight size={20} aria-hidden="true" />
		</button>

		<section class="panel" aria-label="Exhibitors">
			{#each own as e (e.id)}
				<div class="row own">
					<Avatar name={e.businessName} />
					<div class="who">
						<strong>{e.businessName}</strong>
						<span>Your stall · {e.stall ? `Stall ${e.stall}` : 'Stall to be announced'}</span>
					</div>
					{#if e.stall}
						<button type="button" class="icon" onclick={() => showStall(e.stall!)} aria-label="Show your stall on the floor map">
							<MapPin size={18} aria-hidden="true" />
						</button>
					{/if}
					<a class="icon" href="/stallDirectory/exhibitor" aria-label="Your stall: open your messages and leads"><Store size={18} aria-hidden="true" /></a>
				</div>
			{/each}
			<label class="search">
				<Search size={18} aria-hidden="true" />
				<input type="search" bind:value={query} placeholder="Search by business, name or stall number" aria-label="Search by business, name or stall number" autocomplete="off" />
			</label>
			{#if shown.length}
				<ul class="list">
					{#each shown as e (e.id)}
						<li class="row" class:on={e.stall !== null && e.stall === focus}>
							<Avatar name={e.businessName} />
							{#if canMessage}
								<a class="who" href="/visitorDirectory/stalls/{e.id}">
									<strong>{e.businessName}</strong>
									<span>{e.stall ? `Stall ${e.stall}` : 'Stall to be announced'} · {e.contactName}</span>
								</a>
							{:else}
								<div class="who">
									<strong>{e.businessName}</strong>
									<span>{e.stall ? `Stall ${e.stall}` : 'Stall to be announced'} · {e.contactName}</span>
								</div>
							{/if}
							{#if e.stall}
								<button type="button" class="icon" onclick={() => showStall(e.stall!)} aria-label="Show {e.businessName} on the floor map">
									<MapPin size={18} aria-hidden="true" />
								</button>
							{/if}
							{#if cards[e.id]}
								<a class="icon" href={cards[e.id]} aria-label="Save {e.businessName}’s contact" title="Save contact"><UserPlus size={18} aria-hidden="true" /></a>
							{/if}
							{#if canMessage}
								<a class="icon" href="/visitorDirectory/stalls/{e.id}" aria-label="Message {e.businessName}"><MessageCircle size={18} aria-hidden="true" /></a>
							{/if}
						</li>
					{/each}
				</ul>
			{:else if query.trim()}
				<p class="empty">No stall matches “{query.trim()}”.</p>
			{:else}
				<p class="empty">
					{own.length ? 'No other exhibitors yet. Other stalls appear here once the organisers confirm them.' : 'Exhibitors appear here once their stall is confirmed.'}
				</p>
			{/if}
		</section>
	</div>

	<!-- Laptop: the floor map stays beside the list. On a phone it opens from the map card. -->
	<aside class="side" aria-label="Floor map">
		<section class="panel map-panel">
			<div class="map-head">
				<strong><MapIcon size={16} aria-hidden="true" /> Floor map</strong>
				<button type="button" class="enlarge" onclick={() => openMap(focus)}><Expand size={15} aria-hidden="true" /> Enlarge</button>
			</div>
			<FloorMap {exhibitors} selected={focus} {matches} fit onselect={(n) => (focus = focus === n ? null : n)} />
			{#if chosen && chosen.stall}
				{@const side = stallSide(chosen.stall)}
				<div class="chosen" role="status">
					<Avatar name={chosen.businessName} />
					<div class="who">
						<strong>{chosen.businessName}</strong>
						<span>{mine.has(chosen.id) ? 'Your stall' : 'Stall'} {chosen.stall}{#if side}{' · '}{SIDE_LABEL[side]}{/if}</span>
					</div>
					{#if !mine.has(chosen.id) && cards[chosen.id]}
						<a class="icon" href={cards[chosen.id]} aria-label="Save {chosen.businessName}’s contact" title="Save contact"><UserPlus size={18} aria-hidden="true" /></a>
					{/if}
					{#if mine.has(chosen.id)}
						<a class="icon" href="/stallDirectory/exhibitor" aria-label="Your stall: open your messages and leads"><Store size={18} aria-hidden="true" /></a>
					{:else if canMessage}
						<a class="icon" href="/visitorDirectory/stalls/{chosen.id}" aria-label="Message {chosen.businessName}"><MessageCircle size={18} aria-hidden="true" /></a>
					{/if}
				</div>
			{:else}
				<p class="hint"><MapPin size={14} aria-hidden="true" /> Tap a gold stall, or the pin next to an exhibitor.</p>
			{/if}
		</section>
	</aside>
</div>

<FloorViewer open={mapOpen} exhibitors={onMap} {focus} {canMessage} onclose={() => (mapOpen = false)} />

<style>
	/* Phone: one column, the map opens from the map card. Laptop: list and map side by side. */
	.layout,
	.main {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}
	.side {
		display: none;
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) minmax(380px, 1.15fr);
			align-items: start;
			gap: var(--space-6);
		}
		.side {
			display: block;
			position: sticky;
			top: calc(60px + var(--space-4));
		}
		.main .map-card {
			display: none;
		}
	}
	.map-card {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2);
		padding-right: var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
		color: var(--text-supporting);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.map-card:hover {
		border-color: var(--gold);
	}
	.map-card:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.map-card img {
		flex: none;
		width: 96px;
		height: 68px;
		border-radius: var(--radius-sm);
		object-fit: cover;
	}
	.map-text {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}
	.map-text strong,
	.map-head strong {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--charcoal);
		font-size: 15px;
	}
	.map-text span {
		font-size: 13px;
	}
	.panel {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}
	.map-panel {
		gap: var(--space-3);
	}
	.map-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.enlarge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--control-border);
		border-radius: 999px;
		background: var(--white);
		color: var(--charcoal);
		font: 600 13px var(--font-sans);
		cursor: pointer;
	}
	.enlarge:hover {
		border-color: var(--gold);
	}
	.enlarge:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		color: var(--text-supporting);
	}
	.search:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.search input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--charcoal);
		font: 400 16px var(--font-sans);
		outline: none;
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: var(--space-3) 0;
		border-top: 1px solid var(--rule);
	}
	.row:first-child {
		border-top: 0;
	}
	.row.own {
		margin: 0 calc(-1 * var(--space-2)) 4px;
		padding: var(--space-2);
		border: 1px solid var(--gold);
		border-radius: var(--radius-md);
		background: var(--gold-tint);
	}
	.row.on {
		margin-inline: calc(-1 * var(--space-2));
		padding-inline: var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
	}
	.row > :global(:first-child) {
		margin-right: var(--space-2);
	}
	.who {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}
	.who strong {
		color: var(--charcoal);
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.who span {
		overflow: hidden;
		color: var(--text-supporting);
		font-size: 13px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.who:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.icon {
		display: grid;
		place-items: center;
		flex: none;
		/* Small, borderless actions so the business name keeps the room on a phone. */
		width: 36px;
		height: 36px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--gold-ink);
		cursor: pointer;
	}
	.icon:hover {
		background: var(--gold-tint);
	}
	.icon:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--gold);
		border-radius: var(--radius-md);
		background: var(--gold-tint);
	}
	.hint {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-supporting);
		font-size: 13px;
	}
	.empty {
		padding: var(--space-4) 0;
		color: var(--text-supporting);
		font-size: 14.5px;
	}
</style>
