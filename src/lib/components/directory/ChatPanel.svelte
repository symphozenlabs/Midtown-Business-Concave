<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { CircleAlert, SendHorizontal } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { startPolling } from '#lib/directory/poller.svelte.ts';
	import { MESSAGE_MAX } from '#lib/directory/rules.ts';
	import { messageTime } from '#lib/directory/time.ts';
	import { STALL_BLOCKER_TEXT, type StallBlocker } from '#lib/stall-directory/rules.ts';
	import type { ChatMessage } from '#lib/server/directory/messages.ts';

	/**
	 * A stall directory conversation: the thread, polling for new messages, and the
	 * compose box posting to the page's ?/send action. Same behaviour as the visitors
	 * directory conversation screen.
	 */
	interface Props {
		messages: ChatMessage[];
		conversationId: string | null;
		/** The poll endpoint for this side (delegate or exhibitor). */
		pollBase: string;
		otherName: string;
		blocker: StallBlocker | null;
		emptyText: string;
		/** Shown under the banner when the exhibitor blocked this delegate. */
		unblockAction?: string;
	}

	let { messages: initial, conversationId, pollBase, otherName, blocker, emptyText, unblockAction }: Props = $props();

	let extra = $state<ChatMessage[]>([]);
	let body = $state('');
	let sending = $state(false);
	let error = $state('');
	let composeForm: HTMLFormElement | undefined = $state();

	const newKey = () =>
		typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
					(Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)
				);
	let draftKey = $state(newKey());

	const messages = $derived.by(() => {
		const byId = new Map<number, ChatMessage>();
		for (const m of [...initial, ...extra]) byId.set(m.id, m);
		return [...byId.values()].sort((a, b) => a.id - b.id);
	});

	$effect(() => {
		void messages.length;
		tick().then(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
	});

	$effect(() => {
		const id = conversationId;
		let latest: string | null | undefined;
		return startPolling({
			inConversation: true,
			tick: async () => {
				if (!id) {
					const res = await fetch(pollBase);
					if (!res.ok) return false;
					const state = (await res.json()) as { latest: string | null };
					const changed = latest !== undefined && state.latest !== latest;
					latest = state.latest;
					if (changed) await invalidateAll();
					return changed;
				}
				const after = messages.at(-1)?.id ?? 0;
				const res = await fetch(`${pollBase}${pollBase.includes('?') ? '&' : '?'}conversation=${id}&after=${after}`);
				if (!res.ok) return false;
				const state = (await res.json()) as { messages?: ChatMessage[] };
				if (!state.messages?.length) return false;
				extra = [...extra, ...state.messages];
				if (blocker && state.messages.some((m) => !m.mine)) await invalidateAll();
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

	const hard = $derived(blocker !== null && blocker !== 'wait-for-reply' && blocker !== 'daily-limit');
</script>

<p class="private">Phone numbers and emails stay private.</p>

{#if messages.length}
	<ol class="thread" aria-label="Messages">
		{#each messages as m (m.id)}
			<li class={m.mine ? 'mine' : 'theirs'}>
				<span class="visually-hidden">{m.mine ? 'You' : otherName}:</span>
				<p>{m.body}</p>
				<time datetime={m.at}>{messageTime(m.at)}</time>
			</li>
		{/each}
	</ol>
{:else}
	<p class="empty">{emptyText}</p>
{/if}

<div class="compose">
	{#if hard && blocker}
		<div class="ops-banner warn" role="status">
			<CircleAlert size={18} aria-hidden="true" />
			<p>{STALL_BLOCKER_TEXT[blocker]}</p>
		</div>
		{#if blocker === 'you-blocked' && unblockAction}
			<form method="post" action={unblockAction} use:enhance>
				<button type="submit" class="btn btn-secondary">Unblock</button>
			</form>
		{/if}
	{:else}
		{#if blocker}
			<p class="limit">{STALL_BLOCKER_TEXT[blocker]}</p>
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
						const sent = result.data?.message as ChatMessage | undefined;
						if (sent) extra = [...extra, sent];
						await update({ reset: false });
					} else if (result.type === 'failure') {
						error = String(result.data?.message ?? 'Not sent. Try again.');
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
			<label class="visually-hidden" for="message-body">Message to {otherName}</label>
			<textarea
				id="message-body"
				name="body"
				bind:value={body}
				{onkeydown}
				rows="2"
				maxlength={MESSAGE_MAX}
				placeholder="Write a message"
				disabled={blocker !== null}
				required
			></textarea>
			<button type="submit" class="send" disabled={sending || !body.trim() || blocker !== null} aria-label="Send">
				<SendHorizontal size={20} aria-hidden="true" />
			</button>
		</form>
	{/if}
</div>

<style>
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
