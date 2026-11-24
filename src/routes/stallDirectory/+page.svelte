<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import StallBrowser from '#lib/components/directory/StallBrowser.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { startPolling } from '#lib/directory/poller.svelte.ts';
	import { messageTime } from '#lib/directory/time.ts';

	let { data } = $props();

	const tab = $derived(data.delegate && page.url.searchParams.get('tab') === 'messages' ? 'messages' : 'stalls');

	// A signed-in delegate: refresh Messages and its unread count when an exhibitor replies.
	$effect(() => {
		if (!data.delegate || !data.messaging) return;
		const known = { latest: data.latest, unread: data.unread };
		return startPolling({
			inConversation: false,
			tick: async () => {
				const res = await fetch('/api/stall-directory/poll?as=delegate');
				if (!res.ok) return false;
				const state = (await res.json()) as { latest: string | null; unread: number };
				if (state.latest === known.latest && state.unread === known.unread) return false;
				await invalidate('stall-directory:list');
				return true;
			}
		});
	});
</script>

<svelte:head>
	<title>Stall directory · Midtown Business Conclave</title>
	<meta name="description" content="Find every exhibitor at the Midtown Business Conclave on the floor map, and message them." />
</svelte:head>

<PublicShell subtitle="Stall directory" wide>
	<header class="dir-head">
		<h1>Stall directory</h1>
		<p>{data.exhibitors.length} {data.exhibitors.length === 1 ? 'exhibitor' : 'exhibitors'} at the conclave</p>
		{#if data.delegate}
			<nav class="tabs" aria-label="Stall directory">
				<a href="?tab=stalls" aria-current={tab === 'stalls' ? 'page' : undefined}>Stalls</a>
				<a href="?tab=messages" aria-current={tab === 'messages' ? 'page' : undefined}>
					Messages{#if data.unread}<span class="badge" aria-label="{data.unread} unread">{data.unread}</span>{/if}
				</a>
			</nav>
		{:else}
			<div class="tabs-spacer"></div>
		{/if}
	</header>

	{#if tab === 'stalls'}
		<StallBrowser exhibitors={data.exhibitors} mine={data.mine} canMessage={data.messaging} />
	{:else}
		<section class="panel" aria-label="Messages">
			{#if data.conversations.length}
				<ul class="list">
					{#each data.conversations as c (c.conversationId)}
						<li>
							<a class="convo" href="/stallDirectory/{c.bookingId}">
								<Avatar name={c.businessName} />
								<span class="convo-text">
									<span class="convo-top">
										<strong>{c.businessName}</strong>
										<time datetime={c.lastAt}>{messageTime(c.lastAt)}</time>
									</span>
									<span class="role">{c.stall ? `Stall ${c.stall}` : 'Stall to be announced'}</span>
									<span class="preview" class:unread={c.unread}>{c.preview}</span>
								</span>
								{#if c.unread}<span class="dot" aria-label="Unread"></span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">No conversations yet. Tap the message icon next to a stall to start one.</p>
			{/if}
		</section>
	{/if}
</PublicShell>

<style>
	.dir-head {
		display: grid;
		gap: 2px;
		padding: var(--space-4) var(--space-4) 0;
		border-radius: var(--radius-md);
		background: var(--ink);
		color: var(--on-ink-soft);
	}
	@media (min-width: 960px) {
		.dir-head {
			padding-inline: var(--space-6);
		}
	}
	.dir-head h1 {
		font: 500 26px/1.2 var(--font-display);
		color: var(--on-ink);
	}
	.dir-head p {
		font-size: 13.5px;
	}
	.tabs {
		display: flex;
		gap: var(--space-6);
		margin-top: var(--space-3);
	}
	.tabs-spacer {
		height: var(--space-4);
	}
	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
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
	.tabs a:focus-visible {
		outline: 2px solid var(--focus-ring-inverse);
		outline-offset: 2px;
	}
	.badge {
		display: inline-block;
		min-width: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background: var(--gold);
		color: var(--ink);
		font-size: 12px;
		line-height: 20px;
		text-align: center;
	}
	/* Conversations read best at a comfortable width, even on a laptop. */
	.panel {
		display: grid;
		gap: var(--space-2);
		width: 100%;
		max-width: 820px;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.convo {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--rule);
		color: inherit;
		text-decoration: none;
	}
	li:first-child .convo {
		border-top: 0;
	}
	.convo:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.convo-text {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}
	.convo-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.convo-top strong {
		color: var(--charcoal);
		font-size: 15px;
		overflow-wrap: anywhere;
	}
	.convo-top time {
		flex: none;
		color: var(--text-supporting);
		font-size: 12px;
	}
	.role {
		color: var(--text-supporting);
		font-size: 13px;
	}
	.preview {
		overflow: hidden;
		color: var(--text-supporting);
		font-size: 13.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.preview.unread {
		color: var(--charcoal);
		font-weight: 600;
	}
	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--gold-ink);
	}
	.empty {
		padding: var(--space-4) 0;
		color: var(--text-supporting);
		font-size: 14.5px;
	}
</style>
