<script lang="ts">
	import { MessageCircle } from '@lucide/svelte';
	import type { DirectoryPerson } from '#lib/server/directory/people.ts';
	import Avatar from './Avatar.svelte';

	let { person }: { person: DirectoryPerson } = $props();
</script>

<li class="row">
	<Avatar name={person.fullName} />
	<div class="who">
		<strong>{person.fullName}</strong>
		<span>{person.designation} · {person.companyName}</span>
	</div>
	{#if person.takesMessages}
		<a class="msg" href="/visitorDirectory/{person.id}" aria-label="Message {person.fullName}">
			<MessageCircle size={20} aria-hidden="true" />
		</a>
	{:else}
		<button type="button" class="msg off" disabled>Not taking messages</button>
	{/if}
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--rule);
	}
	.row:first-child {
		border-top: 0;
	}
	.who {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}
	.who strong {
		color: var(--charcoal);
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.who span {
		color: var(--text-supporting);
		font-size: 13.5px;
		overflow-wrap: anywhere;
	}
	.msg {
		display: grid;
		place-items: center;
		flex: none;
		min-width: 44px;
		height: 44px;
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		color: var(--gold-ink);
	}
	.msg:hover {
		background: var(--gold-tint);
	}
	.msg:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.msg.off {
		max-width: 96px;
		height: auto;
		min-height: 44px;
		padding: 4px 8px;
		border-color: var(--rule);
		background: var(--mist);
		color: var(--text-supporting);
		font: 500 11.5px/1.25 var(--font-sans);
		text-align: center;
		cursor: not-allowed;
	}
</style>
