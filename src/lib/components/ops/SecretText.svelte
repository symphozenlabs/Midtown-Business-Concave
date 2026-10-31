<script lang="ts">
	import { Check, Copy, Eye, EyeOff } from '@lucide/svelte';

	/**
	 * A value with a copy button. Passwords stay masked until the organiser chooses
	 * to see them (copy works either way); masked={false} for a plain username.
	 */
	let { value, label = 'password', masked = true }: { value: string; label?: string; masked?: boolean } = $props();

	let shown = $state(false);
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<span class="secret">
	<code class:masked={masked && !shown}>{!masked || shown ? value : '••••••••••'}</code>
	{#if masked}
		<button type="button" class="icon" onclick={() => (shown = !shown)} aria-label="{shown ? 'Hide' : 'Show'} {label}" title={shown ? 'Hide' : 'Show'}>
			{#if shown}<EyeOff size={14} aria-hidden="true" />{:else}<Eye size={14} aria-hidden="true" />{/if}
		</button>
	{/if}
	<button type="button" class="icon" onclick={copy} aria-label="Copy {label}" title="Copy">
		{#if copied}<Check size={14} aria-hidden="true" />{:else}<Copy size={14} aria-hidden="true" />{/if}
	</button>
</span>

<style>
	.secret {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		max-width: 100%;
	}

	code {
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--paper);
		color: var(--charcoal);
		font: 12px/1.5 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		/* Usernames and passwords are short; breaking them inside a table column is unreadable. */
		white-space: nowrap;
	}

	code.masked {
		letter-spacing: 1px;
		color: var(--text-supporting);
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-supporting);
		cursor: pointer;
	}

	.icon:hover {
		background: var(--paper);
		color: var(--charcoal);
	}
</style>
