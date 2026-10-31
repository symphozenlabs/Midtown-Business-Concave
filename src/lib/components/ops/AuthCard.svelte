<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		eyebrow: string;
		title: string;
		intro?: string;
		/** Inside the signed-in shell: no full-page backdrop. */
		inline?: boolean;
		children: Snippet;
	}

	let { eyebrow, title, intro, inline = false, children }: Props = $props();
</script>

<!-- Same card as the organiser sign-in (/login). -->
<main class="auth" class:inline>
	<section class="card" aria-labelledby="auth-title">
		{#if !inline}
			<img src="/poster/mbc.webp" alt="Midtown Business Conclave" width="1655" height="747" class="logo" />
		{/if}
		<div class="head">
			<span class="eyebrow">{eyebrow}</span>
			<h1 id="auth-title">{title}</h1>
			{#if intro}<p>{intro}</p>{/if}
		</div>
		{@render children()}
	</section>
</main>

<style>
	.auth {
		display: grid;
		place-items: center;
		min-height: 100svh;
		padding: var(--space-6) var(--gutter-phone);
		background:
			radial-gradient(60% 50% at 50% 0%, rgb(255 172 72 / 0.18), transparent 70%),
			linear-gradient(180deg, #0c1730, #04070f);
	}

	.auth.inline {
		min-height: 0;
		padding: var(--space-4);
		background: none;
	}

	.card {
		display: grid;
		gap: var(--space-6);
		width: 100%;
		max-width: 420px;
		padding: clamp(var(--space-6), 5vw, 40px);
		background: var(--white);
		border-radius: var(--radius-lg);
	}

	.inline .card {
		border: 1px solid var(--rule);
	}

	.logo {
		width: 180px;
		height: auto;
		margin-inline: auto;
		padding: 12px 18px;
		border-radius: var(--radius-md);
		background: #0c1730;
		box-sizing: content-box;
	}

	.head {
		display: grid;
		gap: var(--space-2);
	}

	h1 {
		font: var(--text-h3);
	}

	.head p {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.card :global(form) {
		display: grid;
		gap: var(--space-4);
	}

	.card :global(.btn) {
		width: 100%;
		margin-top: var(--space-2);
	}

	.card :global(.alert) {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.card :global(.alert.ok) {
		background: var(--success-tint);
		color: var(--success);
	}

	.card :global(.alert svg) {
		flex: none;
		margin-top: 2px;
	}

	.card :global(.alert p) {
		font: var(--text-caption);
		color: var(--charcoal);
	}

	.card :global(.links) {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font: var(--text-caption);
	}

	.card :global(.links a) {
		color: var(--gold-ink);
	}
</style>
