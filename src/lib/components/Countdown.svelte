<script lang="ts">
	import { loadSiteConfig, siteConfig } from '#lib/site-config.svelte.ts';

	let parts = $state<{ value: number; unit: string; short: string }[] | null>(null);
	let label = $state('');

	function update(startsAt: string, endsAt: string) {
		const start = new Date(startsAt).getTime();
		const end = new Date(endsAt).getTime();
		const now = Date.now();

		if (now >= end) {
			parts = null;
			label = 'Thank you for joining us';
			return;
		}
		if (now >= start) {
			parts = null;
			label = 'Happening now in Salem';
			return;
		}

		const mins = Math.floor((start - now) / 60000);
		const days = Math.floor(mins / 1440);
		const hours = Math.floor((mins % 1440) / 60);
		parts = [
			{ value: days, unit: days === 1 ? 'day' : 'days', short: 'd' },
			{ value: hours, unit: hours === 1 ? 'hour' : 'hours', short: 'h' },
			{ value: mins % 60, unit: 'min', short: 'm' }
		];
		label = `${days} days, ${hours} hours and ${mins % 60} minutes to go`;
	}

	// Browser only (the page is prerendered); re-runs when the live schedule arrives.
	$effect(() => {
		loadSiteConfig();
		const { startsAt, endsAt } = siteConfig.event;
		update(startsAt, endsAt);
		const id = setInterval(() => update(startsAt, endsAt), 30_000);
		return () => clearInterval(id);
	});
</script>

{#if parts}
	<div class="countdown" role="timer" aria-label={label}>
		{#each parts as part (part.unit)}
			<span class="part" aria-hidden="true">
				<span class="value">{String(part.value).padStart(2, '0')}</span>
				<span class="unit long">{part.unit}</span><span class="unit short">{part.short}</span>
			</span>
		{/each}
		<span class="to-go" aria-hidden="true">to go</span>
	</div>
{:else if label}
	<p class="countdown live">{label}</p>
{/if}

<style>
	.countdown {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
		color: var(--on-ink-soft);
	}

	.part {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}

	.value {
		font: 500 28px/1 var(--font-display);
		color: var(--on-ink);
		font-variant-numeric: tabular-nums lining-nums;
	}

	.unit,
	.to-go {
		font: 500 12px/1 var(--font-sans);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.short {
		display: none;
	}

	/* Phones: 28d 17h 53m to go */
	@media (max-width: 600px) {
		.countdown {
			gap: var(--space-3);
		}

		.long {
			display: none;
		}

		.short {
			display: inline;
		}

		.part {
			gap: 2px;
		}
	}

	.live {
		font: var(--text-ui);
		color: var(--gold);
	}
</style>
