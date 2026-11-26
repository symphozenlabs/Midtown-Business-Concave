<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import ChatPanel from '#lib/components/directory/ChatPanel.svelte';
	import DirectoryState from '#lib/components/directory/DirectoryState.svelte';
	import FloorMap from '#lib/components/directory/FloorMap.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { STALLS_TAB_PATH, SIDE_LABEL, stallSide } from '#lib/stall-directory/rules.ts';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.state === 'open' ? `${data.exhibitor.businessName} · ` : ''}Visitors directory · Midtown Business Conclave</title>
</svelte:head>

<PublicShell subtitle="Visitors directory" wide={data.state === 'open'}>
	{#if data.state !== 'open'}
		<DirectoryState screen={data.state} />
	{:else}
	{@const e = data.exhibitor}
	{@const side = e.stall ? stallSide(e.stall) : null}
	<div class="layout">
	<div class="main">
	<header class="stall-head">
		<a class="back" href={STALLS_TAB_PATH} aria-label="Back to the stalls"><ArrowLeft size={22} aria-hidden="true" /></a>
		<span class="num" class:none={e.stall === null} aria-hidden="true">{e.stall ?? '–'}</span>
		<div class="who">
			<h1>{e.businessName}</h1>
			<p>{e.stall ? `Stall ${e.stall}` : 'Stall to be announced'} · {e.contactName}</p>
		</div>
	</header>

	{#if e.stall}
		<details class="panel map phone-only" open={!data.chat || data.chat.messages.length === 0}>
			<summary>Where to find them{#if side}: <span>{SIDE_LABEL[side]}</span>{/if}</summary>
			<FloorMap exhibitors={data.exhibitors} selected={e.stall} />
		</details>
	{/if}

	{#if data.chat}
		<ChatPanel
			messages={data.chat.messages}
			conversationId={data.chat.conversationId}
			pollBase="/api/stall-directory/poll?as=delegate"
			otherName={e.businessName}
			blocker={data.chat.blocker}
			emptyText="Say hello. Tell them what you’d like to know, or when you’ll drop by stall {e.stall ?? ''}."
		/>
	{/if}
	</div>

	<!-- Laptop: where the stall is, beside the conversation. -->
	{#if e.stall}
		<aside class="side panel" aria-label="Where to find them">
			<strong class="side-title">Where to find them</strong>
			{#if side}<p class="side-sub">Stall {e.stall} · {SIDE_LABEL[side]}</p>{/if}
			<FloorMap exhibitors={data.exhibitors} selected={e.stall} fit />
		</aside>
	{/if}
	</div>
	{/if}
</PublicShell>

<style>
	/* Phone: one column with the map folded above the chat. Laptop: chat and map side by side. */
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
			grid-template-columns: minmax(0, 1fr) minmax(340px, 0.9fr);
			align-items: start;
			gap: var(--space-6);
		}
		.side {
			display: grid;
			position: sticky;
			top: calc(60px + var(--space-4));
		}
		.main .phone-only {
			display: none;
		}
	}
	.side-title {
		color: var(--charcoal);
		font-size: 15px;
	}
	.side-sub {
		margin-top: -8px;
		color: var(--text-supporting);
		font-size: 13px;
	}
	.stall-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--ink);
		color: var(--on-ink-soft);
	}
	.back {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		margin: -4px;
		color: var(--on-ink);
	}
	.back:focus-visible {
		outline: 2px solid var(--focus-ring-inverse);
		outline-offset: 2px;
	}
	.num {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--gold);
		color: var(--ink);
		font: 700 15px/1 var(--font-sans);
	}
	.num.none {
		background: rgb(255 255 255 / 0.15);
		color: var(--on-ink);
	}
	.who {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.who h1 {
		color: var(--on-ink);
		font: 600 17px/1.3 var(--font-sans);
		overflow-wrap: anywhere;
	}
	.who p {
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}
	.map summary {
		color: var(--charcoal);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.map summary span {
		color: var(--text-supporting);
		font-weight: 400;
	}
	.map[open] summary {
		margin-bottom: var(--space-3);
	}
</style>
