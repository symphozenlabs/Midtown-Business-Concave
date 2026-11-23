<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, Ban, CircleAlert, EllipsisVertical, SendHorizontal, ShieldCheck } from '@lucide/svelte';
	import { tick } from 'svelte';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import DirectoryState from '#lib/components/directory/DirectoryState.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { startPolling } from '#lib/directory/poller.svelte.ts';
	import { BLOCKER_TEXT, MESSAGE_MAX } from '#lib/directory/rules.ts';
	import { messageTime } from '#lib/directory/time.ts';
	import type { ChatMessage } from '#lib/server/directory/messages.ts';

	let { data } = $props();

	/** Messages that arrived by polling since the last page load. */
	let extra = $state<ChatMessage[]>([]);
	let body = $state('');
	let sending = $state(false);
	/** One key per draft: a resent post of the same draft is stored once. */
	const newKey = () =>
		typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
					(Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)
				);
	let draftKey = $state(newKey());
	let error = $state('');
	let composeForm: HTMLFormElement | undefined = $state();

	const messages = $derived.by(() => {
		if (data.state !== 'open') return [];
		const byId = new Map<number, ChatMessage>();
		for (const m of [...data.messages, ...extra]) byId.set(m.id, m);
		return [...byId.values()].sort((a, b) => a.id - b.id);
	});

	// Newest message in view.
	$effect(() => {
		void messages.length;
		tick().then(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
	});

	$effect(() => {
		if (data.state !== 'open') return;
		const conversationId = data.conversationId;
		let latest: string | null | undefined;
		return startPolling({
			inConversation: true,
			tick: async () => {
				if (!conversationId) {
					// No conversation yet: reload once one appears (they wrote first).
					const res = await fetch('/api/directory/poll');
					if (!res.ok) return false;
					const state = (await res.json()) as { latest: string | null };
					const changed = latest !== undefined && state.latest !== latest;
					latest = state.latest;
					if (changed) await invalidateAll();
					return changed;
				}
				const after = messages.at(-1)?.id ?? 0;
				const res = await fetch(`/api/directory/poll?conversation=${conversationId}&after=${after}`);
				if (!res.ok) return false;
				const state = (await res.json()) as { messages?: ChatMessage[] };
				if (!state.messages?.length) return false;
				extra = [...extra, ...state.messages];
				// Their reply can lift a limit ("once they reply"): fetch the current state.
				if (data.state === 'open' && data.blocker && state.messages.some((m) => !m.mine)) await invalidateAll();
				return true;
			}
		});
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (!sending) composeForm?.requestSubmit();
		}
	}
</script>

<svelte:head>
	<title>{data.state === 'open' ? `${data.person.fullName} · ` : ''}Visitors directory · Midtown Business Conclave</title>
	<link rel="manifest" href="/visitor-directory.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/directory-180.png" />
</svelte:head>

<PublicShell subtitle="Visitors directory">
	{#if data.state !== 'open'}
		<DirectoryState screen={data.state} />
	{:else}
		<header class="chat-head">
			<a class="back" href="/visitorDirectory?tab=messages" aria-label="Back to messages"><ArrowLeft size={22} aria-hidden="true" /></a>
			<Avatar name={data.person.fullName} size={36} />
			<div class="who">
				<h1>{data.person.fullName}</h1>
				<p>{data.person.designation} · {data.person.companyName}</p>
			</div>
			<details class="menu">
				<summary aria-label="More options"><EllipsisVertical size={20} aria-hidden="true" /></summary>
				<div class="menu-body">
					{#if data.iBlocked}
						<form method="post" action="?/unblock" use:enhance>
							<button type="submit"><ShieldCheck size={16} aria-hidden="true" /> Unblock {data.person.fullName}</button>
						</form>
					{:else}
						<form method="post" action="?/block" use:enhance>
							<button type="submit"><Ban size={16} aria-hidden="true" /> Block {data.person.fullName}</button>
						</form>
						<p>They won’t be told. You’ll both disappear from each other’s list.</p>
					{/if}
				</div>
			</details>
		</header>

		<p class="private">Your phone number and email stay private.</p>

		{#if messages.length}
			<ol class="thread" aria-label="Messages">
				{#each messages as m (m.id)}
					<li class={m.mine ? 'mine' : 'theirs'}>
						<span class="visually-hidden">{m.mine ? 'You' : data.person.fullName}:</span>
						<p>{m.body}</p>
						<time datetime={m.at}>{messageTime(m.at)}</time>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="empty">Say hello. Introduce yourself and suggest where to meet at the conclave.</p>
		{/if}

		<div class="compose">
			{#if data.blocker && data.blocker !== 'wait-for-reply' && data.blocker !== 'daily-limit'}
				<div class="ops-banner warn" role="status">
					<CircleAlert size={18} aria-hidden="true" />
					<p>{BLOCKER_TEXT[data.blocker]}</p>
				</div>
				{#if data.blocker === 'you-blocked'}
					<form method="post" action="?/unblock" use:enhance>
						<button type="submit" class="btn btn-secondary">Unblock</button>
					</form>
				{/if}
			{:else}
				{#if data.blocker}
					<p class="limit">{BLOCKER_TEXT[data.blocker]}</p>
				{/if}
				{#if error}
					<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{error}</p></div>
				{/if}
				<form
					bind:this={composeForm}
					method="post"
					action="?/send"
					use:enhance={() => {
						sending = true;
						error = '';
						return async ({ result, update }) => {
							sending = false;
							if (result.type === 'success') {
								body = '';
								draftKey = newKey();
								// Show it at once; the reload that follows brings the rest.
								const sent = result.data?.message as ChatMessage | undefined;
								if (sent) extra = [...extra, sent];
								await update({ reset: false });
							} else if (result.type === 'failure') {
								error = String(result.data?.message ?? 'Not sent. Try again.');
								// Being blocked or switched off meanwhile: show the current state.
								await invalidateAll();
							} else if (result.type === 'error') {
								error = 'Not sent. Check your connection and try again.';
							} else {
								await update();
							}
						};
					}}
				>
					<input type="hidden" name="key" value={draftKey} />
					<label class="visually-hidden" for="message-body">Message to {data.person.fullName}</label>
					<textarea
						id="message-body"
						name="body"
						bind:value={body}
						{onkeydown}
						rows="2"
						maxlength={MESSAGE_MAX}
						placeholder="Write a message"
						disabled={data.blocker !== null}
						required
					></textarea>
					<button type="submit" class="send" disabled={sending || !body.trim() || data.blocker !== null} aria-label="Send">
						<SendHorizontal size={20} aria-hidden="true" />
					</button>
				</form>
			{/if}
		</div>
	{/if}
</PublicShell>

<style>
	.chat-head {
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
	.who {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.who h1 {
		color: var(--on-ink);
		font: 600 16px/1.3 var(--font-sans);
		overflow-wrap: anywhere;
	}
	.who p {
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.menu {
		position: relative;
		flex: none;
	}
	.menu summary {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--on-ink);
		cursor: pointer;
		list-style: none;
	}
	.menu summary::-webkit-details-marker {
		display: none;
	}
	.back:focus-visible,
	.menu summary:focus-visible {
		outline: 2px solid var(--focus-ring-inverse);
		outline-offset: 2px;
	}
	.menu-body {
		position: absolute;
		top: 48px;
		right: 0;
		z-index: 3;
		display: grid;
		gap: var(--space-2);
		width: 240px;
		padding: var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
		color: var(--text-supporting);
		font-size: 13px;
	}
	.menu-body button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 44px;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--danger);
		font: 600 14px var(--font-sans);
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.menu-body button:hover {
		background: var(--danger-tint);
	}
	.private {
		justify-self: center;
		padding: 6px 12px;
		border-radius: var(--radius-md);
		background: var(--white);
		color: var(--text-supporting);
		font-size: 12.5px;
		text-align: center;
	}
	.thread {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.thread li {
		max-width: 82%;
		padding: 8px 12px;
		border-radius: 14px;
	}
	.thread p {
		font-size: 15px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.thread time {
		display: block;
		margin-top: 2px;
		font-size: 11px;
		opacity: 0.75;
	}
	.theirs {
		align-self: flex-start;
		border: 1px solid var(--rule);
		border-bottom-left-radius: 4px;
		background: var(--white);
		color: var(--charcoal);
	}
	.mine {
		align-self: flex-end;
		border-bottom-right-radius: 4px;
		background: var(--ink);
		color: var(--on-ink);
	}
	.empty {
		padding: var(--space-6) var(--space-2);
		color: var(--text-supporting);
		text-align: center;
	}
	.compose {
		position: sticky;
		bottom: 0;
		display: grid;
		gap: var(--space-2);
		margin: 0 calc(-1 * var(--space-4));
		padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
		border-top: 1px solid var(--rule);
		background: var(--mist);
	}
	.compose form {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.compose textarea {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		max-height: 160px;
		padding: 10px 14px;
		border: 1px solid var(--control-border);
		border-radius: 20px;
		background: var(--white);
		color: var(--charcoal);
		font: 400 16px/1.4 var(--font-sans);
		resize: vertical;
	}
	.compose textarea:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.send {
		display: grid;
		place-items: center;
		flex: none;
		width: 46px;
		height: 46px;
		border: 0;
		border-radius: 50%;
		background: var(--gold);
		color: var(--ink);
		cursor: pointer;
	}
	.send:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.send:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.limit {
		color: var(--text-supporting);
		font-size: 13.5px;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
