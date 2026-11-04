<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, ExternalLink, ImageUp, LayoutTemplate, LoaderCircle, Map as MapIcon, Pencil, Trash2 } from '@lucide/svelte';
	import OpsDialog from '#lib/components/ops/OpsDialog.svelte';
	import { PlanError, preparePlan } from '#lib/floor-map/image-prep.ts';

	let { data, form } = $props();

	let uploading = $state(false);
	let preparing = $state(false);
	let problem = $state<string | null>(null);
	let prepared = $state<{ blob: Blob; width: number; height: number; preview: string } | null>(null);
	let confirmDelete = $state<{ id: string; title: string } | null>(null);
	let deleteOpen = $state(false);

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

	async function choose(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		problem = null;
		if (prepared) URL.revokeObjectURL(prepared.preview);
		prepared = null;
		if (!file) return;
		preparing = true;
		try {
			const result = await preparePlan(file);
			prepared = { ...result, preview: URL.createObjectURL(result.blob) };
		} catch (err) {
			problem = err instanceof PlanError ? err.message : 'This image could not be prepared. Try another file.';
			input.value = '';
		} finally {
			preparing = false;
		}
	}

	const message = $derived((form as { message?: string } | null)?.message ?? null);
</script>

<svelte:head>
	<title>Floor maps · Organiser · Midtown Business Conclave</title>
</svelte:head>

<header class="ops-page-head">
	<div>
		<h1>Floor maps</h1>
		<p class="ops-hint">Upload a floor plan, trace stalls and walls, then share a QR that opens it in 3D. No sign-in for visitors.</p>
	</div>
	{#if data.available}
		<dl class="ops-counts">
			<div><dt>Maps</dt><dd>{data.maps.length}</dd></div>
			<div><dt>Published</dt><dd>{data.maps.filter((m) => m.publishedAt).length}</dd></div>
		</dl>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>Floor maps need the database (<code>DATABASE_URL</code>). In local development without one, a sample map is kept in memory.</p>
	</div>
{:else}
	{#if message}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{message}</p></div>
	{/if}

	<div class="ops-layout">
		<section class="ops-panel" aria-labelledby="maps-title">
			<div class="ops-panel-head">
				<h2 id="maps-title">Your maps</h2>
				<form method="post" action="?/sample" use:enhance>
					<button type="submit" class="btn btn-ghost small"><LayoutTemplate size={16} aria-hidden="true" /> Add sample stall map</button>
				</form>
			</div>

			{#if !data.maps.length}
				<div class="empty">
					<MapIcon size={28} aria-hidden="true" />
					<p>No floor maps yet. Upload a plan, or add the sample stall map to see how it works.</p>
				</div>
			{:else}
				<ul class="maps">
					{#each data.maps as m (m.id)}
						<li>
							<a class="thumb" href="/admin/floor-maps/{m.id}" aria-label="Edit {m.title}">
								<img src={m.imageUrl} alt="" loading="lazy" />
							</a>
							<div class="info">
								<div class="title-row">
									<a href="/admin/floor-maps/{m.id}" class="title">{m.title}</a>
									{#if !m.publishedAt}
										<span class="ops-pill inactive">Draft</span>
									{:else if m.unpublishedChanges}
										<span class="ops-pill warning">Published · changes waiting</span>
									{:else}
										<span class="ops-pill active">Published</span>
									{/if}
								</div>
								<p class="ops-hint">
									{m.counts.stalls} stalls · {m.counts.zones - m.counts.stalls} other areas · {m.counts.walls} walls · {m.counts.markers} markers
								</p>
								<p class="ops-hint">Updated {when.format(new Date(m.updatedAt))}</p>
								<div class="ops-actions">
									<a class="btn btn-secondary small" href="/admin/floor-maps/{m.id}"><Pencil size={15} aria-hidden="true" /> Edit &amp; QR</a>
									{#if m.publishedAt}
										<a class="btn btn-ghost small" href={m.publicUrl} target="_blank" rel="noopener"><ExternalLink size={15} aria-hidden="true" /> Public view</a>
									{/if}
									<button type="button" class="btn btn-ghost small danger" onclick={() => {
											confirmDelete = { id: m.id, title: m.title };
											deleteOpen = true;
										}}>
										<Trash2 size={15} aria-hidden="true" /> Delete
									</button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="ops-panel" aria-labelledby="upload-title">
			<h2 id="upload-title">Upload a floor plan</h2>
			{#if !data.canUpload}
				<div class="ops-banner warn" role="status">
					<CircleAlert size={16} aria-hidden="true" />
					<p>Image storage (R2) is not set up, so plans cannot be uploaded. The sample stall map still works.</p>
				</div>
			{/if}
			<form
				method="post"
				action="?/upload"
				enctype="multipart/form-data"
				class="upload"
				use:enhance={({ formData, cancel }) => {
					if (!prepared) {
						problem = 'Choose the floor plan image first.';
						cancel();
						return;
					}
					formData.set('image', prepared.blob, `plan.${prepared.blob.type.split('/')[1] ?? 'webp'}`);
					formData.set('width', String(prepared.width));
					formData.set('height', String(prepared.height));
					uploading = true;
					return async ({ update }) => {
						await update();
						uploading = false;
					};
				}}
			>
				<label class="ops-label">
					<span>Map name</span>
					<input name="title" required maxlength="80" placeholder="Stall floor map · Hall A" />
				</label>
				<label class="ops-label">
					<span>Floor plan image</span>
					<input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/svg+xml,.heic,.heif" onchange={choose} disabled={!data.canUpload} />
					<small class="ops-hint">PNG, JPG, WebP, SVG or iPhone HEIC. A clear, top-down plan works best.</small>
				</label>
				<label class="ops-label">
					<span>Width of the plan in metres <small>(optional)</small></span>
					<input name="widthMetres" type="number" min="2" max="2000" step="0.5" placeholder="e.g. 40" />
					<small class="ops-hint">Sets the real-world size. You can also calibrate it in the editor.</small>
				</label>

				{#if preparing}
					<p class="ops-hint"><LoaderCircle size={14} class="ops-spin" aria-hidden="true" /> Preparing the image…</p>
				{:else if prepared}
					<figure class="preview">
						<img src={prepared.preview} alt="Chosen floor plan" />
						<figcaption>{prepared.width} × {prepared.height} px · {(prepared.blob.size / 1024 / 1024).toFixed(1)} MB</figcaption>
					</figure>
				{/if}
				{#if problem}
					<p class="error" role="alert">{problem}</p>
				{/if}

				<button type="submit" class="btn btn-primary" disabled={uploading || preparing || !data.canUpload}>
					{#if uploading}<LoaderCircle size={18} class="ops-spin" aria-hidden="true" /> Uploading…{:else}<ImageUp size={18} aria-hidden="true" /> Upload and open editor{/if}
				</button>
			</form>
		</section>
	</div>
{/if}

{#if confirmDelete}
	<OpsDialog bind:open={deleteOpen} title="Delete {confirmDelete.title}?">
		<p>The map, its image and its QR link are removed. Printed QR codes for it will stop working.</p>
		<form method="post" action="?/delete" use:enhance={() => async ({ update }) => {
				await update();
				deleteOpen = false;
			}}>
			<input type="hidden" name="id" value={confirmDelete.id} />
			<div class="ops-actions">
				<button type="button" class="btn btn-ghost" onclick={() => (deleteOpen = false)}>Cancel</button>
				<button type="submit" class="btn btn-primary danger-fill"><Trash2 size={16} aria-hidden="true" /> Delete map</button>
			</div>
		</form>
	</OpsDialog>
{/if}

<style>
	.small {
		min-height: 36px;
		padding-inline: var(--space-3);
		font-size: 13px;
	}

	.empty {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-8) var(--space-4);
		color: var(--text-supporting);
		text-align: center;
	}

	.maps {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.maps li {
		display: grid;
		grid-template-columns: 180px minmax(0, 1fr);
		gap: var(--space-4);
		padding: var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
	}

	.thumb {
		display: block;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		border-radius: 6px;
		background: var(--mist);
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.info {
		display: grid;
		align-content: start;
		gap: 4px;
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.title {
		font-weight: 600;
		font-size: 16px;
		color: var(--charcoal);
		text-decoration: none;
	}

	.title:hover {
		text-decoration: underline;
	}

	.info .ops-actions {
		margin-top: var(--space-2);
	}

	.danger {
		color: var(--danger);
	}

	.danger-fill {
		background: var(--danger);
	}

	.upload {
		display: grid;
		gap: var(--space-4);
	}

	.preview {
		margin: 0;
		display: grid;
		gap: 4px;
	}

	.preview img {
		width: 100%;
		max-height: 220px;
		object-fit: contain;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--mist);
	}

	.preview figcaption {
		font-size: 12px;
		color: var(--text-supporting);
	}

	.error {
		color: var(--danger);
		font-size: 13px;
	}

	@media (max-width: 640px) {
		.maps li {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
