<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let {
		open = $bindable(false),
		title,
		description,
		wide = false,
		children
	}: { open?: boolean; title: string; description?: string; wide?: boolean; children: Snippet } = $props();

	let dialog: HTMLDialogElement;
	const id = `dialog-${Math.random().toString(36).slice(2, 8)}`;

	// The native modal dialog traps focus, closes on Escape and restores focus afterwards.
	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	/** A click on the backdrop (the dialog element itself, outside the card) closes it. */
	function onclick(event: MouseEvent) {
		if (event.target === dialog) open = false;
	}
</script>

<dialog bind:this={dialog} class="ops-dialog" class:wide aria-labelledby="{id}-title" onclose={() => (open = false)} {onclick}>
	<div class="card">
		<header>
			<div>
				<h2 id="{id}-title">{title}</h2>
				{#if description}<p class="ops-hint">{description}</p>{/if}
			</div>
			<button type="button" class="close" aria-label="Close" onclick={() => (open = false)}>
				<X size={18} aria-hidden="true" />
			</button>
		</header>
		{#if open}
			{@render children()}
		{/if}
	</div>
</dialog>

<style>
	.ops-dialog {
		width: min(560px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--charcoal);
		box-shadow: 0 24px 64px rgb(12 23 48 / 0.28);
	}

	.ops-dialog.wide {
		width: min(820px, calc(100vw - 32px));
	}

	.ops-dialog[open] {
		animation: rise 180ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.ops-dialog::backdrop {
		background: rgb(12 23 48 / 0.45);
	}

	.card {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-6) var(--space-6);
		font-size: 14px;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		font: 600 18px/1.3 var(--font-sans);
	}

	.close {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		margin: -4px -8px 0 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-supporting);
		cursor: pointer;
	}

	.close:hover {
		background: var(--paper);
		color: var(--charcoal);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ops-dialog[open] {
			animation: none;
		}
	}
</style>
