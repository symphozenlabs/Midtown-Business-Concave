<script lang="ts">
	import { page } from '$app/state';
	import { CircleAlert, LogOut } from '@lucide/svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';

	let { data, children } = $props();

	const stallLabel = $derived(
		data.exhibitor.stalls
			.map((s) => (s.stall ? `Stall ${s.stall}` : 'Stall to be announced'))
			.join(' · ')
	);
	const section = $derived(
		page.url.pathname.startsWith('/stallDirectory/exhibitor/leads')
			? 'leads'
			: page.url.pathname.startsWith('/stallDirectory/exhibitor/stalls')
				? 'stalls'
				: 'messages'
	);
	// A conversation has its own header.
	const inConversation = $derived(page.url.pathname.startsWith('/stallDirectory/exhibitor/messages/'));
</script>

<PublicShell subtitle="Exhibitor · {data.exhibitor.businessName}" wide>
	{#if !inConversation}
		<header class="exh-head">
			<div class="title-row">
				<div>
					<h1>{data.exhibitor.businessName}</h1>
					<p>{stallLabel} · {data.exhibitor.contactName}</p>
				</div>
				<form method="post" action="/stallDirectory/exhibitor/logout">
					<button type="submit" class="out"><LogOut size={16} aria-hidden="true" /> Sign out</button>
				</form>
			</div>
			<nav class="tabs" aria-label="Exhibitor">
				<a href="/stallDirectory/exhibitor" aria-current={section === 'messages' ? 'page' : undefined}>Messages</a>
				<a href="/stallDirectory/exhibitor/leads" aria-current={section === 'leads' ? 'page' : undefined}>Leads</a>
				<a href="/stallDirectory/exhibitor/stalls" aria-current={section === 'stalls' ? 'page' : undefined}>Stalls</a>
			</nav>
		</header>
	{/if}

	{#if !data.ready}
		<div class="ops-banner warn" role="status">
			<CircleAlert size={18} aria-hidden="true" />
			<p>Messages and leads open closer to the event.</p>
		</div>
	{:else}
		{@render children()}
	{/if}
</PublicShell>

<style>
	.exh-head {
		display: grid;
		gap: 2px;
		padding: var(--space-4) var(--space-4) 0;
		border-radius: var(--radius-md);
		background: var(--ink);
		color: var(--on-ink-soft);
	}
	.title-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.exh-head h1 {
		font: 500 24px/1.2 var(--font-display);
		color: var(--on-ink);
		overflow-wrap: anywhere;
	}
	.exh-head p {
		font-size: 13.5px;
	}
	.out {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid rgb(255 255 255 / 0.25);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--on-ink);
		font: 600 13px var(--font-sans);
		cursor: pointer;
		white-space: nowrap;
	}
	.out:focus-visible,
	.tabs a:focus-visible {
		outline: 2px solid var(--focus-ring-inverse);
		outline-offset: 2px;
	}
	.tabs {
		display: flex;
		gap: var(--space-6);
		margin-top: var(--space-3);
	}
	.tabs a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		border-bottom: 2px solid transparent;
		color: var(--on-ink-soft);
		font-size: 14.5px;
		font-weight: 600;
		text-decoration: none;
	}
	.tabs a[aria-current='page'] {
		border-color: var(--gold);
		color: var(--on-ink);
	}
</style>
