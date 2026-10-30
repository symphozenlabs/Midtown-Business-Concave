<script lang="ts">
	import { Check } from '@lucide/svelte';
	import type { Step } from '#lib/registration.ts';

	interface Props {
		steps: Step[];
		current: number;
		/** Furthest step the delegate has unlocked; earlier steps can be revisited. */
		reached: number;
		onselect: (index: number) => void;
	}

	let { steps, current, reached, onselect }: Props = $props();

	const progress = $derived(steps.length > 1 ? current / (steps.length - 1) : 0);
</script>

<nav class="route" aria-label="Registration progress">
	<div class="track" aria-hidden="true">
		<span class="fill" style="transform: scaleX({progress})"></span>
	</div>
	<ol>
		{#each steps as step, i (step.id)}
			{@const done = i < current}
			{@const here = i === current}
			<li class:done class:here>
				<button
					type="button"
					disabled={i > reached || here}
					aria-current={here ? 'step' : undefined}
					onclick={() => onselect(i)}
				>
					<span class="stop">
						{#if done}<Check size={14} strokeWidth={3} aria-hidden="true" />{:else}{i + 1}{/if}
					</span>
					<span class="label">
						{step.label}
						<span class="visually-hidden">{done ? '(complete)' : here ? '(current step)' : ''}</span>
					</span>
				</button>
			</li>
		{/each}
	</ol>
</nav>

<style>
	.route {
		position: relative;
	}

	.track {
		position: absolute;
		top: 15px;
		left: 16px;
		right: 16px;
		height: 2px;
		background: var(--rule);
		overflow: hidden;
	}

	.fill {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, var(--gold-ink), var(--gold));
		transform-origin: left;
		transition: transform var(--duration-entrance-max) var(--ease-out);
	}

	ol {
		position: relative;
		display: flex;
		justify-content: space-between;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li:first-child button {
		align-items: flex-start;
	}

	li:last-child button {
		align-items: flex-end;
	}

	button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	button:disabled {
		cursor: default;
	}

	.stop {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1.5px solid var(--control-border);
		background: var(--paper);
		color: var(--text-supporting);
		font: 600 13px/1 var(--font-sans);
		font-variant-numeric: tabular-nums;
		transition:
			background-color var(--duration-disclosure) var(--ease-out),
			border-color var(--duration-disclosure) var(--ease-out),
			color var(--duration-disclosure) var(--ease-out),
			transform var(--duration-feedback) var(--ease-out);
	}

	.done .stop {
		background: var(--gold-ink);
		border-color: var(--gold-ink);
		color: var(--white);
	}

	.here .stop {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--gold);
		box-shadow: 0 0 0 4px var(--gold-tint);
	}

	button:not(:disabled):hover .stop {
		transform: scale(1.08);
	}

	.label {
		font: 500 13px/1.3 var(--font-sans);
		color: var(--text-supporting);
	}

	.here .label,
	.done .label {
		color: var(--charcoal);
	}
</style>
