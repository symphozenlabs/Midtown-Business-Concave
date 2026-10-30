<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { CircleAlert } from '@lucide/svelte';

	interface Props {
		id: string;
		label: string;
		value: string;
		required?: boolean;
		help?: string;
		error?: string | null;
		type?: HTMLInputAttributes['type'];
		autocomplete?: HTMLInputAttributes['autocomplete'];
		inputmode?: HTMLInputAttributes['inputmode'];
		placeholder?: string;
		maxlength?: number;
		prefix?: string;
		multiline?: boolean;
		rows?: number;
		showCount?: boolean;
		onblur?: () => void;
		oninput?: (value: string) => void;
	}

	let {
		id,
		label,
		value = $bindable(),
		required = false,
		help,
		error = null,
		type = 'text',
		autocomplete,
		inputmode,
		placeholder,
		maxlength,
		prefix,
		multiline = false,
		rows = 3,
		showCount = false,
		onblur,
		oninput
	}: Props = $props();

	const describedBy = $derived(
		[help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field" class:has-error={!!error}>
	<label for={id} class="label">
		{label}
		{#if required}
			<span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span>
		{:else}
			<span class="optional">Optional</span>
		{/if}
	</label>

	<div class="control">
		{#if prefix}<span class="prefix" aria-hidden="true">{prefix}</span>{/if}
		{#if multiline}
			<textarea
				{id}
				name={id}
				bind:value
				{rows}
				{placeholder}
				{maxlength}
				{required}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={describedBy}
				onblur={() => onblur?.()}
				oninput={() => oninput?.(value)}
			></textarea>
		{:else}
			<input
				{id}
				name={id}
				{type}
				bind:value
				{autocomplete}
				{inputmode}
				{placeholder}
				{maxlength}
				{required}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={describedBy}
				onblur={() => onblur?.()}
				oninput={() => oninput?.(value)}
			/>
		{/if}
	</div>

	{#if error}
		<p class="error" id="{id}-error"><CircleAlert size={16} strokeWidth={2} aria-hidden="true" />{error}</p>
	{:else if help || (showCount && maxlength)}
		<div class="help-row">
			{#if help}<p class="help" id="{id}-help">{help}</p>{/if}
			{#if showCount && maxlength}
				<span class="count" aria-hidden="true">{value.length}/{maxlength}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.field {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		min-width: 0;
	}

	.label {
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
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

	.control {
		display: flex;
		align-items: stretch;
		background: var(--white);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		transition: border-color var(--duration-feedback) var(--ease-out);
	}

	.control:hover,
	.control:focus-within {
		border-color: var(--charcoal);
	}

	.control:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.has-error .control {
		border-color: var(--danger);
	}

	.prefix {
		display: flex;
		align-items: center;
		padding: 0 var(--space-3) 0 var(--space-4);
		border-right: 1px solid var(--rule);
		color: var(--text-supporting);
		font-variant-numeric: tabular-nums;
	}

	input,
	textarea {
		flex: 1;
		min-width: 0;
		width: 100%;
		min-height: calc(var(--control-height) - 2px);
		padding: 0 var(--space-4);
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--charcoal);
		font-size: 16px;
	}

	textarea {
		padding-block: var(--space-3);
		resize: vertical;
		line-height: 1.5;
	}

	input:focus,
	textarea:focus {
		outline: none;
	}

	input::placeholder,
	textarea::placeholder {
		color: #8b8f86;
	}

	.help-row {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.help,
	.count {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.count {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
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
