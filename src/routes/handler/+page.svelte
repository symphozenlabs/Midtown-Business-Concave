<script lang="ts">
	import { ChevronRight, CircleAlert } from '@lucide/svelte';
	import CategoryIcon from '#lib/components/ops/CategoryIcon.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Your desks · Event handler · Midtown Business Conclave</title>
</svelte:head>

<main class="ops-wrap">
	{#if data.desks.length === 0}
		<div class="ops-banner warn" role="status">
			<CircleAlert size={18} aria-hidden="true" />
			<p>No desk is assigned to your account yet. Ask the event administrator to assign one.</p>
		</div>
	{:else}
		<div>
			<span class="ops-eyebrow">Choose your desk</span>
			<h1 class="ops-title">Your desks</h1>
		</div>
		<nav class="desks" aria-label="Your desks">
			{#each data.desks as desk (desk.href)}
				<a class="desk" href={desk.href}>
					<span class="icon"><CategoryIcon category={desk.category} size={28} /></span>
					<span class="text">
						<strong>{desk.title}</strong>
						<span>{desk.context || desk.description}</span>
						{#if desk.eventName}<span>{desk.eventName}</span>{/if}
					</span>
					<ChevronRight size={22} aria-hidden="true" />
				</a>
			{/each}
		</nav>
	{/if}
</main>

<style>
	.desks {
		display: grid;
		gap: var(--space-3);
	}

	.desk {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-height: 88px;
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
		color: var(--charcoal);
		text-decoration: none;
	}

	.desk:hover {
		border-color: var(--charcoal);
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-md);
		background: var(--ink);
		color: var(--gold);
	}

	.text {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.text strong {
		font: 600 19px/1.25 var(--font-sans);
		letter-spacing: 0.03em;
	}

	.text span {
		font-size: 14px;
		color: var(--text-supporting);
	}
</style>
