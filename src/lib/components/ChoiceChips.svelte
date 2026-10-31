<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';
	import { Check, CircleAlert } from '@lucide/svelte';

	interface Option {
		value: T;
		label: string;
		description?: string;
	}

	interface Props {
		id: string;
		legend: string;
		options: readonly Option[];
		/** Single choice: a value. Multiple: an array. */
		value: T | '' | T[];
		multiple?: boolean;
		required?: boolean;
		help?: string;
		error?: string | null;
		variant?: 'chip' | 'card';
		icon?: Snippet<[T]>;
		/** Multiple only: a last option that ticks (or clears) every other one. */
		all?: { label: string; description?: string; icon?: Snippet };
		onchange?: () => void;
	}

	let {
		id,
		legend,
		options,
		value = $bindable(),
		multiple = false,
		required = false,
		help,
		error = null,
		variant = 'chip',
		icon,
		all,
		onchange
	}: Props = $props();

	function isChecked(v: T) {
		return Array.isArray(value) ? value.includes(v) : value === v;
	}

	function toggle(v: T) {
		if (multiple && Array.isArray(value)) {
			value = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
		} else {
			value = v;
		}
		onchange?.();
	}

	const allChecked = $derived(Array.isArray(value) && options.every((o) => value.includes(o.value)));

	function toggleAll() {
		value = allChecked ? [] : options.map((o) => o.value);
		onchange?.();
	}

	const describedBy = $derived(
		[help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
	);
</script>

<fieldset class="group" {id} tabindex="-1" aria-describedby={describedBy}>
	<legend class="legend">
		{legend}
		{#if required}
			<span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span>
		{:else}
			<span class="optional">Optional</span>
		{/if}
	</legend>
	{#if help}<p class="help" id="{id}-help">{help}</p>{/if}

	<div class="options {variant}">
		{#each options as option (option.value)}
			{@const checked = isChecked(option.value)}
			<label class="option" class:checked>
				<input
					type={multiple ? 'checkbox' : 'radio'}
					name={id}
					value={option.value}
					{checked}
					onchange={() => toggle(option.value)}
				/>
				{#if icon}
					<span class="icon" aria-hidden="true">{@render icon(option.value)}</span>
				{/if}
				<span class="text">
					<span class="option-label">{option.label}</span>
					{#if option.description}<span class="option-desc">{option.description}</span>{/if}
				</span>
				{#if multiple || variant === 'card'}
					<span class="tick" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
				{/if}
			</label>
		{/each}
		{#if all && multiple}
			<label class="option" class:checked={allChecked}>
				<input type="checkbox" checked={allChecked} onchange={toggleAll} />
				{#if all.icon}
					<span class="icon" aria-hidden="true">{@render all.icon()}</span>
				{/if}
				<span class="text">
					<span class="option-label">{all.label}</span>
					{#if all.description}<span class="option-desc">{all.description}</span>{/if}
				</span>
				<span class="tick" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
			</label>
		{/if}
	</div>

	{#if error}
		<p class="error" id="{id}-error"><CircleAlert size={16} strokeWidth={2} aria-hidden="true" />{error}</p>
	{/if}
</fieldset>

<style>
	.group {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.group:focus {
		outline: none;
	}

	.legend {
		display: block;
		padding: 0;
		margin-bottom: var(--space-3);
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.req {
		color: var(--gold-ink);
	}

	.optional {
		margin-left: var(--space-2);
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.help {
		margin-top: calc(var(--space-2) * -1);
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.options.card {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 248px), 1fr));
		gap: var(--space-3);
	}

	.option {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		padding: var(--space-2) var(--space-4);
		background: var(--white);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		color: var(--charcoal);
		font: var(--text-ui);
		font-size: 15px;
		cursor: pointer;
		user-select: none;
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out),
			transform var(--duration-feedback) var(--ease-out);
	}

	.option:hover {
		border-color: var(--charcoal);
	}

	.option:active {
		transform: scale(0.98);
	}

	.option.checked {
		background: var(--gold-tint);
		border-color: var(--gold-ink);
	}

	.option:has(input:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.card .option {
		align-items: flex-start;
		gap: var(--space-3);
		min-height: 0;
		padding: var(--space-4);
		padding-right: calc(var(--space-4) + 24px);
		border-radius: var(--radius-sm);
	}

	.option-desc {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		background: var(--mist);
		color: var(--charcoal);
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			color var(--duration-feedback) var(--ease-out);
	}

	.checked .icon {
		background: var(--ink);
		color: var(--gold);
	}

	.tick {
		display: grid;
		place-items: center;
		flex: none;
		width: 18px;
		height: 18px;
		border: 1px solid var(--control-border);
		border-radius: 50%;
		color: transparent;
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out),
			color var(--duration-feedback) var(--ease-out);
	}

	.card .tick {
		position: absolute;
		top: var(--space-4);
		right: var(--space-4);
	}

	.checked .tick {
		background: var(--gold-ink);
		border-color: var(--gold-ink);
		color: var(--white);
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font: var(--text-caption);
		color: var(--danger);
	}

	.error :global(svg) {
		margin-top: 2px;
		flex: none;
	}
</style>
