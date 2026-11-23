<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { CircleAlert, Search } from '@lucide/svelte';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import DirectoryState from '#lib/components/directory/DirectoryState.svelte';
	import PersonRow from '#lib/components/directory/PersonRow.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { startPolling } from '#lib/directory/poller.svelte.ts';
	import { BLOCKER_TEXT, matchesSearch } from '#lib/directory/rules.ts';
	import { messageTime } from '#lib/directory/time.ts';

	let { data } = $props();

	let query = $state('');
	const tab = $derived(page.url.searchParams.get('tab') === 'messages' ? 'messages' : 'people');
	const shown = $derived(data.state === 'open' ? data.people.filter((p) => matchesSearch(p, query)) : []);

	// New messages: refresh the Messages list and its unread count.
	$effect(() => {
		if (data.state !== 'open') return;
		const known = { latest: data.latest, unread: data.unread };
		return startPolling({
			inConversation: false,
			tick: async () => {
				const res = await fetch('/api/directory/poll');
				if (!res.ok) return false;
				const state = (await res.json()) as { latest: string | null; unread: number };
				if (state.latest === known.latest && state.unread === known.unread) return false;
				await invalidate('directory:list');
				return true;
			}
		});
	});
</script>

<svelte:head>
	<title>Visitors directory · Midtown Business Conclave</title>
</svelte:head>

<PublicShell subtitle="Visitors directory">
	{#if data.state !== 'open'}
		<DirectoryState screen={data.state} />
	{:else}
		<header class="dir-head">
			<h1>Visitors directory</h1>
			<p>{data.people.length} {data.people.length === 1 ? 'person' : 'people'} registered</p>
			<nav class="tabs" aria-label="Directory">
				<a href="?tab=people" aria-current={tab === 'people' ? 'page' : undefined}>People</a>
				<a href="?tab=messages" aria-current={tab === 'messages' ? 'page' : undefined}>
					Messages{#if data.unread}<span class="badge" aria-label="{data.unread} unread">{data.unread}</span>{/if}
				</a>
			</nav>
		</header>

		{#if data.me.flags.adminMessagesOff}
			<div class="ops-banner warn" role="status"><CircleAlert size={18} aria-hidden="true" /><p>{BLOCKER_TEXT['admin-off']}</p></div>
		{:else if data.me.flags.messagesOff}
			<div class="ops-banner warn" role="status"><CircleAlert size={18} aria-hidden="true" /><p>{BLOCKER_TEXT['self-off']}</p></div>
		{/if}

		{#if tab === 'people'}
			<section class="panel" aria-label="People">
				<label class="search">
					<Search size={18} aria-hidden="true" />
					<input type="search" bind:value={query} placeholder="Search by name or company" aria-label="Search by name or company" autocomplete="off" />
				</label>
				{#if shown.length}
					<ul class="list">
						{#each shown as person (person.id)}
							<PersonRow {person} />
						{/each}
					</ul>
				{:else if query.trim()}
					<p class="empty">No one matches “{query.trim()}”.</p>
				{:else}
					<p class="empty">No one else is listed yet.</p>
				{/if}
			</section>
		{:else}
			<section class="panel" aria-label="Messages">
				{#if data.conversations.length}
					<ul class="list">
						{#each data.conversations as c (c.personId)}
							<li>
								<a class="convo" href="/visitorDirectory/{c.personId}">
									<Avatar name={c.fullName} />
									<span class="convo-text">
										<span class="convo-top">
											<strong>{c.fullName}</strong>
											<time datetime={c.lastAt}>{messageTime(c.lastAt)}</time>
										</span>
										<span class="role">{c.designation} · {c.companyName}</span>
										<span class="preview" class:unread={c.unread}>{c.preview}</span>
									</span>
									{#if c.unread}<span class="dot" aria-label="Unread"></span>{/if}
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">No conversations yet. Tap the message icon next to someone to start one.</p>
				{/if}
			</section>
		{/if}
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
	.panel {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
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
		overflow-wrap: anywhere;
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
