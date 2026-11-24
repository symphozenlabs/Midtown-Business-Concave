<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Ban, EllipsisVertical, ShieldCheck } from '@lucide/svelte';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import ChatPanel from '#lib/components/directory/ChatPanel.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.delegate.fullName} · Exhibitor · Midtown Business Conclave</title>
</svelte:head>

<div class="narrow">
<header class="chat-head">
	<a class="back" href="/stallDirectory/exhibitor" aria-label="Back to messages"><ArrowLeft size={22} aria-hidden="true" /></a>
	<Avatar name={data.delegate.fullName} size={36} />
	<div class="who">
		<h1>{data.delegate.fullName}</h1>
		<p>{data.delegate.designation} · {data.delegate.companyName}</p>
	</div>
	<details class="menu">
		<summary aria-label="More options"><EllipsisVertical size={20} aria-hidden="true" /></summary>
		<div class="menu-body">
			{#if data.iBlocked}
				<form method="post" action="?/unblock" use:enhance>
					<button type="submit"><ShieldCheck size={16} aria-hidden="true" /> Unblock {data.delegate.fullName}</button>
				</form>
			{:else}
				<form method="post" action="?/block" use:enhance>
					<button type="submit"><Ban size={16} aria-hidden="true" /> Block {data.delegate.fullName}</button>
				</form>
				<p>They won’t be told. They can’t message your stall again.</p>
			{/if}
		</div>
	</details>
</header>

<ChatPanel
	messages={data.messages}
	conversationId={data.conversationId}
	pollBase="/api/stall-directory/poll?as=exhibitor"
	otherName={data.delegate.fullName}
	blocker={data.blocker}
	unblockAction="?/unblock"
	emptyText="No messages yet."
/>
</div>

<style>
	/* A conversation reads best at phone-to-tablet width, even on a laptop. */
	.narrow {
		display: grid;
		gap: var(--space-4);
		width: 100%;
		max-width: 820px;
		margin-inline: auto;
	}
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
</style>
