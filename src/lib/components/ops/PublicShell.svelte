<script lang="ts">
	import '#lib/ops/ops.css';
	import type { Snippet } from 'svelte';

	/**
	 * `wide` lets a page use a laptop's width (up to about 1200px) for side-by-side
	 * layouts; the default keeps a single phone-width column.
	 */
	let { subtitle, wide = false, children }: { subtitle: string; wide?: boolean; children: Snippet } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="theme-color" content="#0c1730" />
</svelte:head>

<div class="ops-shell">
	<header class="ops-top">
		<a href="/" aria-label="Midtown Business Conclave home"><img src="/poster/mbc.webp" alt="" width="1655" height="747" /></a>
		<div class="ops-who">
			<strong>Midtown Business Conclave</strong>
			<span>{subtitle}</span>
		</div>
	</header>
	<main class="ops-wrap" class:ops-wrap-wide={wide}>
		{@render children()}
	</main>
</div>
