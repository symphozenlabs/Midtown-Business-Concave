<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { CircleAlert, Search } from '@lucide/svelte';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import DirectoryState from '#lib/components/directory/DirectoryState.svelte';
	import NotifyBanner from '#lib/components/directory/NotifyBanner.svelte';
	import PersonRow from '#lib/components/directory/PersonRow.svelte';
	import StallRow from '#lib/components/directory/StallRow.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { startPolling } from '#lib/directory/poller.svelte.ts';
	import { BLOCKER_TEXT, matchesSearch } from '#lib/directory/rules.ts';
	import { matchesStall } from '#lib/stall-directory/rules.ts';
	import { messageTime } from '#lib/directory/time.ts';

	let { data } = $props();

	let query = $state('');
	let stallQuery = $state('');
	const TABS = ['people', 'stalls', 'messages'] as const;
	const tab = $derived(TABS.find((t) => t === page.url.searchParams.get('tab')) ?? 'people');
	const shown = $derived(data.state === 'open' ? data.people.filter((p) => matchesSearch(p, query)) : []);
	const shownStalls = $derived(data.state === 'open' ? data.exhibitors.filter((e) => matchesStall(e, stallQuery)) : []);
	const unread = $derived(data.state === 'open' ? data.unread + data.stallUnread : 0);

	/** Conversations with people and with stalls, newest first. */
	const inbox = $derived(
		data.state !== 'open'
			? []
			: [
					...data.conversations.map((c) => ({
						key: `p-${c.personId}`,
						href: `/visitorDirectory/${c.personId}`,
						name: c.fullName,
						role: `${c.designation} · ${c.companyName}`,
						lastAt: c.lastAt,
						preview: c.preview,
						unread: c.unread
					})),
					...data.stallConversations.map((c) => ({
						key: `s-${c.conversationId}`,
						href: `/visitorDirectory/stalls/${c.bookingId}`,
						name: c.businessName,
						role: c.stall ? `Exhibitor · Stall ${c.stall}` : 'Exhibitor · Stall to be announced',
						lastAt: c.lastAt,
						preview: c.preview,
						unread: c.unread
					}))
				].sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
	);

	// New messages from people or stalls: refresh the Messages list and its unread count.
	$effect(() => {
		if (data.state !== 'open') return;
		const known = {
			people: { latest: data.latest, unread: data.unread },
			stalls: { latest: data.stallLatest, unread: data.stallUnread }
		};
		const stallMessaging = data.stallMessaging;
		const changed = async (url: string, was: { latest: string | null; unread: number }) => {
			const res = await fetch(url);
			if (!res.ok) return false;
			const state = (await res.json()) as { latest: string | null; unread: number };
			return state.latest !== was.latest || state.unread !== was.unread;
		};
		return startPolling({
			inConversation: false,
			tick: async () => {
				const [people, stalls] = await Promise.all([
					changed('/api/directory/poll', known.people),
					stallMessaging ? changed('/api/stall-directory/poll?as=delegate', known.stalls) : false
				]);
				if (!people && !stalls) return false;
				await invalidate('directory:list');
				return true;
			}
		});
	});
</script>

<svelte:head>
	<title>Visitors directory · Midtown Business Conclave</title>
	<link rel="manifest" href="/visitor-directory.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/directory-180.png" />
</svelte:head>

<PublicShell subtitle="Visitors directory">
	{#if data.state !== 'open'}
		<DirectoryState screen={data.state} />
	{:else}
		<header class="dir-head">
			<h1>Visitors directory</h1>
			<p>
				{data.people.length} {data.people.length === 1 ? 'person' : 'people'} registered · {data.exhibitors.length}
				{data.exhibitors.length === 1 ? 'stall' : 'stalls'}
			</p>
			<nav class="tabs" aria-label="Directory">
				<a href="?tab=people" aria-current={tab === 'people' ? 'page' : undefined}>People</a>
				<a href="?tab=stalls" aria-current={tab === 'stalls' ? 'page' : undefined}>Stalls</a>
				<a href="?tab=messages" aria-current={tab === 'messages' ? 'page' : undefined}>
					Messages{#if unread}<span class="badge" aria-label="{unread} unread">{unread}</span>{/if}
				</a>
			</nav>
		</header>

		{#if data.push}
			<NotifyBanner publicKey={data.push.publicKey} />
		{/if}

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
		{:else if tab === 'stalls'}
			<section class="panel" aria-label="Stalls">
				<label class="search">
					<Search size={18} aria-hidden="true" />
					<input type="search" bind:value={stallQuery} placeholder="Search by business, name or stall number" aria-label="Search by business, name or stall number" autocomplete="off" />
				</label>
				{#if shownStalls.length}
					<ul class="list">
						{#each shownStalls as exhibitor (exhibitor.id)}
							<StallRow {exhibitor} canMessage={data.stallMessaging} />
						{/each}
					</ul>
				{:else if stallQuery.trim()}
					<p class="empty">No stall matches “{stallQuery.trim()}”.</p>
				{:else}
					<p class="empty">Stalls appear here once the organisers confirm them.</p>
				{/if}
			</section>
		{:else}
			<section class="panel" aria-label="Messages">
				{#if inbox.length}
					<ul class="list">
						{#each inbox as c (c.key)}
							<li>
								<a class="convo" href={c.href}>
									<Avatar name={c.name} />
									<span class="convo-text">
										<span class="convo-top">
											<strong>{c.name}</strong>
											<time datetime={c.lastAt}>{messageTime(c.lastAt)}</time>
										</span>
										<span class="role">{c.role}</span>
										<span class="preview" class:unread={c.unread}>{c.preview}</span>
									</span>
									{#if c.unread}<span class="dot" aria-label="Unread"></span>{/if}
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">No conversations yet. Tap the message icon next to someone or a stall to start one.</p>
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
