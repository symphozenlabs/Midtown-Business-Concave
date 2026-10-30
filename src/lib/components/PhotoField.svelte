<script lang="ts">
	import { Camera, CircleAlert, ImageUp, LoaderCircle, RefreshCw, Trash2 } from '@lucide/svelte';
	import { PhotoError, preparePhoto } from '#lib/image.ts';

	interface Props {
		id: string;
		blob: Blob | null;
		url: string | null;
		error?: string | null;
		onchange?: () => void;
	}

	let { id, blob = $bindable(), url = $bindable(), error = null, onchange }: Props = $props();

	let input: HTMLInputElement;
	let dragging = $state(false);
	let processing = $state(false);
	let localError = $state<string | null>(null);

	const message = $derived(localError ?? error);

	async function handle(file: File | undefined) {
		if (!file) return;
		processing = true;
		localError = null;
		try {
			const prepared = await preparePhoto(file);
			if (url) URL.revokeObjectURL(url);
			blob = prepared;
			url = URL.createObjectURL(prepared);
			onchange?.();
		} catch (e) {
			localError = e instanceof PhotoError ? e.message : 'We could not read that image. Try a JPG or PNG.';
		} finally {
			processing = false;
			input.value = '';
		}
	}

	function remove() {
		if (url) URL.revokeObjectURL(url);
		blob = null;
		url = null;
		onchange?.();
		input.focus();
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		handle(event.dataTransfer?.files[0]);
	}
</script>

<div class="field" class:has-error={!!message}>
	<span class="label" id="{id}-label">
		Your photo <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span>
	</span>

	<div
		class="zone"
		class:dragging
		class:filled={!!url}
		role="group"
		aria-labelledby="{id}-label"
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={onDrop}
	>
		<div class="avatar" aria-hidden="true">
			{#if url}
				<img src={url} alt="" />
			{:else if processing}
				<LoaderCircle size={28} class="spin" />
			{:else}
				<Camera size={28} strokeWidth={1.5} />
			{/if}
		</div>

		<div class="body">
			{#if processing}
				<p class="title">Preparing your photo…</p>
				<p class="hint">Getting it ready for your poster.</p>
			{:else if url}
				<p class="title">Looks good</p>
				<p class="hint">Drag it on your poster to reposition, or use the zoom.</p>
				<div class="actions">
					<button type="button" class="btn btn-secondary small" onclick={() => input.click()}>
						<RefreshCw size={16} aria-hidden="true" /> Replace
					</button>
					<button type="button" class="btn btn-ghost small" onclick={remove}>
						<Trash2 size={16} aria-hidden="true" /> Remove
					</button>
				</div>
			{:else}
				<p class="title">Drop a clear headshot here</p>
				<p class="hint">
					A well-lit, front-facing head-and-shoulders photo works best. JPG, PNG or WebP, up to 15 MB. A PNG with
					a transparent background sits on the poster's studio backdrop.
				</p>
				<div class="actions">
					<button
						type="button"
						class="btn btn-secondary small"
						id={id}
						aria-describedby={message ? `${id}-error` : undefined}
						onclick={() => input.click()}
					>
						<ImageUp size={16} aria-hidden="true" /> Choose a photo
					</button>
				</div>
			{/if}
		</div>

		<input
			bind:this={input}
			class="visually-hidden"
			type="file"
			accept="image/jpeg,image/png,image/webp"
			tabindex="-1"
			aria-hidden="true"
			onchange={(e) => handle(e.currentTarget.files?.[0])}
		/>
	</div>

	{#if message}
		<p class="error" id="{id}-error"><CircleAlert size={16} strokeWidth={2} aria-hidden="true" />{message}</p>
	{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--space-2);
	}

	.label {
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.req {
		color: var(--gold-ink);
	}

	.zone {
		display: flex;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-4);
		border: 1px dashed var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out);
	}

	.zone.dragging {
		background: var(--gold-tint);
		border-color: var(--gold-ink);
		border-style: solid;
	}

	.zone.filled {
		border-style: solid;
	}

	.has-error .zone {
		border-color: var(--danger);
	}

	.avatar {
		position: relative;
		display: grid;
		place-items: center;
		flex: none;
		width: 88px;
		height: 88px;
		border-radius: 50%;
		background: var(--mist);
		color: var(--text-supporting);
		overflow: hidden;
	}

	.filled .avatar {
		outline: 2px solid var(--gold);
		outline-offset: 3px;
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar :global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.body {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.title {
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.hint {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.small {
		min-height: 40px;
		padding-inline: var(--space-4);
		font-size: 15px;
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

	@media (max-width: 420px) {
		.zone {
			flex-wrap: wrap;
			gap: var(--space-4);
		}

		.avatar {
			width: 72px;
			height: 72px;
		}
	}
</style>
