<script lang="ts">
	import '#lib/ops/ops.css';
	import type { Snippet } from 'svelte';

	let { subtitle, children }: { subtitle: string; children: Snippet } = $props();
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
	<main class="ops-wrap">
		{@render children()}
	</main>
</div>
