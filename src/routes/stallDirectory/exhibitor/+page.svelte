<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { Download, MessageCircle, ScanLine, UserCheck } from '@lucide/svelte';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import { startPolling } from '#lib/directory/poller.svelte.ts';
	import { messageTime } from '#lib/directory/time.ts';

	let { data } = $props();

	$effect(() => {
		const known = { latest: data.latest, unread: data.unread };
		return startPolling({
			inConversation: false,
			tick: async () => {
				const res = await fetch('/api/stall-directory/poll?as=exhibitor');
				if (!res.ok) return false;
				const state = (await res.json()) as { latest: string | null; unread: number };
				if (state.latest === known.latest && state.unread === known.unread) return false;
				await invalidate('stall-directory:inbox');
				return true;
			}
		});
	});
</script>

<svelte:head>
	<title>Messages · Exhibitor · Midtown Business Conclave</title>
</svelte:head>

<div class="layout">
<section class="panel" aria-labelledby="inbox-title">
	<h2 id="inbox-title">
		Messages from delegates
		{#if data.unread}<span class="badge">{data.unread} unread</span>{/if}
	</h2>
	{#if data.conversations.length}
		<ul class="list">
			{#each data.conversations as c (c.conversationId)}
				<li>
					<a class="convo" href="/stallDirectory/exhibitor/messages/{c.conversationId}">
						<Avatar name={c.delegate?.fullName ?? ''} />
						<span class="convo-text">
							<span class="convo-top">
								<strong>{c.delegate?.fullName}</strong>
								<time datetime={c.lastAt}>{messageTime(c.lastAt)}</time>
							</span>
							<span class="role">
								{c.delegate?.designation} · {c.delegate?.companyName}{#if data.multipleStalls}
									· to {c.stall ? `stall ${c.stall}` : c.businessName}{/if}{#if c.blocked} · Blocked{/if}
							</span>
							<span class="preview" class:unread={c.unread}>{c.preview}</span>
						</span>
						{#if c.unread}<span class="dot" aria-label="Unread"></span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">
			No messages yet. Delegates find your stall in the Stalls section of the visitors directory and can write to you from there.
			You’ll get an email when someone does.
		</p>
	{/if}
</section>

<aside class="summary" aria-label="At a glance">
	<div class="stat">
		<MessageCircle size={18} aria-hidden="true" />
		<span><strong>{data.conversations.length}</strong> {data.conversations.length === 1 ? 'conversation' : 'conversations'}{#if data.unread}, {data.unread} unread{/if}</span>
	</div>
	<div class="stat">
		<UserCheck size={18} aria-hidden="true" />
		<span><strong>{data.leadCount}</strong> {data.leadCount === 1 ? 'lead' : 'leads'} scanned</span>
	</div>
	<a class="ops-big-btn" href="/stallDirectory/exhibitor/leads"><ScanLine size={20} aria-hidden="true" /> Scan a delegate’s pass</a>

	{#each data.cards as card (card.id)}
		<div class="qr">
			<strong>Your stall QR{data.cards.length > 1 ? ` · ${card.stall ? `Stall ${card.stall}` : card.businessName}` : ''}</strong>
			<img src="/stallDirectory/exhibitor/qr/{card.id}" alt="QR for your stall’s contact card" width="180" height="180" loading="lazy" />
			<p>Show it at your stall. Visitors scan it to see your contact details, save you to their phone, or message you.</p>
			<div class="qr-actions">
				<a class="btn btn-secondary ops-btn-sm" href="/stallDirectory/exhibitor/qr/{card.id}?download" download><Download size={15} aria-hidden="true" /> Download QR</a>
				<a class="btn btn-ghost ops-btn-sm" href={card.path} target="_blank" rel="noopener">Open contact card</a>
			</div>
		</div>
	{/each}
</aside>
</div>

<style>
	/* Phone: the summary comes after the messages. Laptop: messages with the summary beside them. */
	.layout {
		display: grid;
		gap: var(--space-4);
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 320px;
			align-items: start;
			gap: var(--space-6);
		}
		.summary {
			position: sticky;
			top: calc(60px + var(--space-4));
		}
	}
	.summary {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}
	.stat {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-supporting);
		font-size: 14px;
	}
	.stat :global(svg) {
		color: var(--gold-ink);
	}
	.stat strong {
		color: var(--charcoal);
		font-size: 16px;
	}
	.summary .ops-big-btn {
		text-decoration: none;
	}
	.qr {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
		text-align: center;
	}
	.qr strong {
		color: var(--charcoal);
		font-size: 14.5px;
	}
	.qr img {
		width: 180px;
		height: 180px;
		padding: 8px;
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: #ffffff;
		image-rendering: pixelated;
	}
	.qr p {
		color: var(--text-supporting);
		font-size: 13px;
	}
	.qr-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
	}
	.qr-actions a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		text-decoration: none;
	}
	.panel {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--charcoal);
		font: 600 15px/1.3 var(--font-sans);
	}
	.badge {
		padding: 1px 8px;
		border-radius: 10px;
		background: var(--gold);
		color: var(--ink);
		font-size: 12px;
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
