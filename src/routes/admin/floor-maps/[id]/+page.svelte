<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { applyAction, deserialize, enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import QRCode from 'qrcode';
	import {
		ArrowLeft,
		CircleAlert,
		CircleCheck,
		Copy,
		DoorOpen,
		Eye,
		Download,
		EyeOff,
		ExternalLink,
		LoaderCircle,
		Save,
		ScanSearch,
		Send,
		Sparkles
	} from '@lucide/svelte';
	import FloorMap3D from '#lib/components/floor-map/FloorMap3D.svelte';
	import FloorMapEditor from '#lib/components/floor-map/FloorMapEditor.svelte';
	import { analysePlanInBrowser, findRooms } from '#lib/floor-map/detect.ts';
	import { planForAi } from '#lib/floor-map/image-prep.ts';
	import { centroid, isEmptyLayout, sanitizeLayout, zoneInfo, type Layout, type Point, type Zone } from '#lib/floor-map/layout.ts';

	let { data, form } = $props();

	let title = $state(untrack(() => data.map.title));
	let scale = $state(untrack(() => data.map.scalePxPerM));
	let layout = $state<Layout>(untrack(() => structuredClone(data.map.layout)));
	let dirty = $state(false);
	let busy = $state<null | 'save' | 'publish' | 'unpublish' | 'analyse' | 'detect'>(null);
	let notice = $state<{ ok: boolean; text: string } | null>(null);
	let editor: ReturnType<typeof FloorMapEditor>;

	const published = $derived(Boolean(data.map.publishedAt));
	const unpublishedChanges = $derived(
		published && (dirty || JSON.stringify(data.map.layout) !== JSON.stringify(data.map.publishedLayout) || data.map.scalePxPerM !== data.map.publishedScale)
	);

	$effect(() => {
		const f = form as { message?: string; saved?: string } | null;
		if (f?.message) notice = { ok: false, text: f.message };
		else if (f?.saved) notice = { ok: true, text: f.saved };
	});

	beforeNavigate(({ cancel, type }) => {
		if (dirty && type !== 'leave' && !confirm('You have unsaved changes on this map. Leave without saving?')) cancel();
	});

	function onBeforeUnload(e: BeforeUnloadEvent) {
		if (dirty) e.preventDefault();
	}

	const draftFields = (formData: FormData) => {
		formData.set('title', title);
		formData.set('scale', String(scale));
		formData.set('layout', JSON.stringify($state.snapshot(layout)));
	};

	const submitter = (kind: 'save' | 'publish' | 'unpublish') =>
		(({ formData, cancel }: { formData: FormData; cancel: () => void }) => {
			if (kind === 'publish' && !layout.walls.length && !confirm('This map has no walls yet, so the 3D view will look flat. Publish anyway?')) {
				cancel();
				return;
			}
			if (kind !== 'unpublish') draftFields(formData);
			busy = kind;
			return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void> }) => {
				await update({ reset: false });
				if (result.type === 'success' && kind !== 'unpublish') dirty = false;
				busy = null;
			};
		}) as Parameters<typeof enhance>[1];

	/* ---------- analysis ---------- */

	function confirmReplace(what: string) {
		return isEmptyLayout(layout) || confirm(`Replace the current ${what} with the analysis result? You can undo this.`);
	}

	const pointIn = (p: Point, poly: Point[]) => {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const [xi, yi] = poly[i];
			const [xj, yj] = poly[j];
			if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
		}
		return inside;
	};

	/**
	 * New room outlines replace the old ones, but a room the organiser already named or
	 * described keeps its name and description when the new outline covers it.
	 */
	function mergeRooms(current: Zone[], rooms: Zone[]): Zone[] {
		const oldRooms = current.filter((z) => z.type === 'room');
		const merged = rooms.map((r) => {
			const old = oldRooms.find((o) => pointIn(centroid(o.polygon), r.polygon));
			return old ? { ...r, id: old.id, name: old.name, description: old.description, color: old.color } : r;
		});
		return [...merged, ...current.filter((z) => z.type !== 'room')];
	}

	const summary = (l: Layout) => {
		const stalls = l.zones.filter((z) => z.type === 'stall').length;
		const rooms = l.zones.filter((z) => z.type === 'room').length;
		return `${l.walls.length} walls, ${rooms} rooms, ${stalls} stalls, ${l.zones.length - stalls - rooms} other areas and ${l.markers.length} markers`;
	};

	async function analyseWithAi(auto = false): Promise<boolean> {
		if (!auto && !confirmReplace('walls, rooms, stalls and markers')) return false;
		busy = 'analyse';
		notice = auto ? { ok: true, text: 'Analysing the plan with AI: finding walls, rooms and stalls…' } : null;
		try {
			const img = await planForAi(data.imageUrl);
			const body = new FormData();
			body.set('image', img.base64);
			body.set('width', String(img.width));
			body.set('height', String(img.height));
			const res = await fetch('?/analyse', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await res.text());
			if (result.type !== 'success') {
				if (!auto) await applyAction(result);
				return false;
			}
			const analysed = result.data?.analysed as { layout: Layout; scalePxPerM: number | null };
			if (analysed.scalePxPerM) scale = Math.round(analysed.scalePxPerM * 1000) / 1000;
			const next = sanitizeLayout(analysed.layout, data.map.imageWidth, data.map.imageHeight);
			// If the AI listed no enclosed rooms, find them from its walls.
			if (!next.zones.some((z) => z.type === 'room')) {
				next.zones = mergeRooms(next.zones, await findRooms(data.imageUrl, data.map.imageWidth, data.map.imageHeight, scale, next.walls));
			}
			editor.replaceLayout(next);
			dirty = true;
			notice = {
				ok: true,
				text: `Found ${summary(next)}${analysed.scalePxPerM ? ', and the scale' : ''}. Check them against the plan, add a description to each room, then save.`
			};
			return true;
		} catch (e) {
			console.error(e);
			if (!auto) notice = { ok: false, text: 'Analysis failed. Check the connection and try again.' };
			return false;
		} finally {
			busy = null;
		}
	}

	async function detectInBrowser(auto = false) {
		if (!auto && layout.walls.length && !confirm('Replace the current walls and rooms with detected ones? Stalls, other areas and markers stay. You can undo this.')) return;
		busy = 'detect';
		notice = auto ? { ok: true, text: 'Finding walls and rooms in the plan…' } : null;
		try {
			const { walls, rooms } = await analysePlanInBrowser(data.imageUrl, data.map.imageWidth, data.map.imageHeight, scale);
			const current = $state.snapshot(layout) as Layout;
			const next: Layout = { ...current, walls, zones: mergeRooms(current.zones, rooms) };
			editor.replaceLayout(next);
			dirty = true;
			notice = walls.length
				? {
						ok: true,
						text: `Raised ${walls.length} walls and found ${rooms.length} rooms. Delete anything that is not a wall (labels, scale bar), name each room and add its description below, draw stalls with the rectangle tool, then save and publish.`
					}
				: { ok: false, text: 'No walls were found in this image. Trace them with the wall tool (W), then click "Find rooms".' };
		} catch (e) {
			console.error(e);
			notice = { ok: false, text: 'Wall detection failed on this image.' };
		} finally {
			busy = null;
		}
	}

	/** Re-finds rooms from the plan and the walls on the map, after the organiser has fixed or drawn walls. */
	async function refindRooms() {
		busy = 'detect';
		const current = $state.snapshot(layout) as Layout;
		const rooms = await findRooms(data.imageUrl, data.map.imageWidth, data.map.imageHeight, scale, current.walls).finally(() => (busy = null));
		editor.replaceLayout({ ...current, zones: mergeRooms(current.zones, rooms) });
		dirty = true;
		notice = rooms.length
			? { ok: true, text: `Found ${rooms.length} rooms. Rooms you had already named or described keep their text.` }
			: { ok: false, text: 'No enclosed rooms were found. Rooms need walls on every side; draw missing walls with the wall tool (W) and try again.' };
	}

	/* A fresh upload is analysed straight away and saved, so walls stand in 3D without extra clicks. */
	let saveForm: HTMLFormElement;
	onMount(async () => {
		if (!data.isNew || !isEmptyLayout(layout)) return;
		history.replaceState(history.state, '', location.pathname);
		const viaAi = data.aiAvailable && (await analyseWithAi(true));
		if (!viaAi) await detectInBrowser(true);
		if (dirty) saveForm.requestSubmit();
	});

	/* ---------- rooms and their descriptions ---------- */

	let roomFilter = $state<'rooms' | 'stalls'>('rooms');
	let roomQuery = $state('');
	const listed = $derived(
		layout.zones.filter(
			(z) => (roomFilter === 'stalls' ? z.type === 'stall' : z.type !== 'stall') && (!roomQuery.trim() || z.name.toLowerCase().includes(roomQuery.trim().toLowerCase()))
		)
	);
	let preview: ReturnType<typeof FloorMap3D>;

	function show(id: string) {
		editor.selectZone(id);
		preview?.focusZone(id);
	}

	/* ---------- QR ---------- */

	let qrSrc = $state<string | null>(null);
	let copied = $state(false);

	$effect(() => {
		const url = data.publicUrl;
		let cancelled = false;
		QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 640, color: { dark: '#0b1430', light: '#ffffff' } }).then((src) => {
			if (!cancelled) qrSrc = src;
		});
		return () => {
			cancelled = true;
		};
	});

	function download(href: string, name: string) {
		const a = document.createElement('a');
		a.href = href;
		a.download = name;
		a.click();
	}

	const fileBase = $derived(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'floor-map');

	async function downloadSvg() {
		const svg = await QRCode.toString(data.publicUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0b1430', light: '#ffffff' } });
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		download(url, `${fileBase}-qr.svg`);
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	/** A printable A-series poster (1240 × 1754 px): title, big QR, how to use it, the link. */
	async function downloadPoster() {
		const c = document.createElement('canvas');
		c.width = 1240;
		c.height = 1754;
		const ctx = c.getContext('2d')!;
		await document.fonts.ready;
		ctx.fillStyle = '#0c1730';
		ctx.fillRect(0, 0, c.width, c.height);
		ctx.fillStyle = '#e3b04b';
		ctx.fillRect(0, 0, c.width, 14);
		ctx.textAlign = 'center';
		ctx.fillStyle = '#e3b04b';
		ctx.font = '700 40px Montserrat, Arial, sans-serif';
		ctx.fillText('MIDTOWN BUSINESS CONCLAVE 2026', c.width / 2, 150);
		ctx.fillStyle = '#ffffff';
		ctx.font = '800 76px Montserrat, Arial, sans-serif';
		ctx.fillText(title.length > 26 ? title.slice(0, 25) + '…' : title, c.width / 2, 260);
		const qr = document.createElement('canvas');
		await QRCode.toCanvas(qr, data.publicUrl, { errorCorrectionLevel: 'M', margin: 2, width: 820, color: { dark: '#0b1430', light: '#ffffff' } });
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.roundRect(190, 340, 860, 860, 36);
		ctx.fill();
		ctx.drawImage(qr, 210, 360, 820, 820);
		ctx.fillStyle = '#ffffff';
		ctx.font = '700 56px Montserrat, Arial, sans-serif';
		ctx.fillText('Scan to explore the floor in 3D', c.width / 2, 1330);
		ctx.fillStyle = '#d8ccae';
		ctx.font = '500 36px Montserrat, Arial, sans-serif';
		ctx.fillText('Find stalls, the stage, food and exits. No app or sign-in needed.', c.width / 2, 1410);
		ctx.font = '500 28px Montserrat, Arial, sans-serif';
		ctx.fillText(data.publicUrl.replace(/^https?:\/\//, ''), c.width / 2, 1640);
		download(c.toDataURL('image/png'), `${fileBase}-qr-poster.png`);
	}

	async function copyLink() {
		await navigator.clipboard.writeText(data.publicUrl);
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}
</script>

<svelte:window onbeforeunload={onBeforeUnload} />

<svelte:head>
	<title>{title} · Floor maps · Organiser</title>
</svelte:head>

<header class="head">
	<a href="/admin/floor-maps" class="back"><ArrowLeft size={16} aria-hidden="true" /> Floor maps</a>
	<div class="title-row">
		<input class="title" bind:value={title} oninput={() => (dirty = true)} maxlength="80" aria-label="Map name" />
		{#if !published}
			<span class="ops-pill inactive">Draft</span>
		{:else if unpublishedChanges}
			<span class="ops-pill warning">Published · changes not live yet</span>
		{:else}
			<span class="ops-pill active">Published</span>
		{/if}
		{#if dirty}<span class="unsaved">Unsaved changes</span>{/if}
	</div>

	<div class="ops-head-actions">
		<form method="post" action="?/save" use:enhance={submitter('save')} bind:this={saveForm}>
			<button type="submit" class="btn btn-secondary" disabled={busy !== null}>
				{#if busy === 'save'}<LoaderCircle size={17} class="ops-spin" aria-hidden="true" />{:else}<Save size={17} aria-hidden="true" />{/if} Save draft
			</button>
		</form>
		<form method="post" action="?/publish" use:enhance={submitter('publish')}>
			<button type="submit" class="btn btn-primary" disabled={busy !== null}>
				{#if busy === 'publish'}<LoaderCircle size={17} class="ops-spin" aria-hidden="true" />{:else}<Send size={17} aria-hidden="true" />{/if}
				{published ? 'Publish changes' : 'Publish'}
			</button>
		</form>
		{#if published}
			<form method="post" action="?/unpublish" use:enhance={submitter('unpublish')}>
				<button type="submit" class="btn btn-ghost" disabled={busy !== null}><EyeOff size={17} aria-hidden="true" /> Unpublish</button>
			</form>
		{/if}
	</div>
</header>

{#if notice}
	<div class="ops-banner {notice.ok ? 'ok' : 'error'}" role={notice.ok ? 'status' : 'alert'}>
		{#if notice.ok}<CircleCheck size={16} aria-hidden="true" />{:else}<CircleAlert size={16} aria-hidden="true" />{/if}
		<p>{notice.text}</p>
	</div>
{/if}

<section class="ops-panel analyse" aria-labelledby="analyse-title">
	<div>
		<h2 id="analyse-title">Analyse the plan</h2>
		<p class="ops-hint">
			New uploads are analysed automatically: walls are raised to full height (open-topped, like a building without its roof) and enclosed rooms are found.
			{#if data.aiAvailable}AI also reads stall numbers, room names and entrances.{:else}AI analysis is off (no <code>ANTHROPIC_API_KEY</code>): the browser finds straight walls and rooms; draw stalls with the rectangle tool.{/if}
		</p>
	</div>
	<div class="ops-actions">
		{#if data.aiAvailable}
			<button type="button" class="btn btn-gold" disabled={busy !== null} onclick={() => analyseWithAi()}>
				{#if busy === 'analyse'}<LoaderCircle size={17} class="ops-spin" aria-hidden="true" /> Analysing… (up to a minute){:else}<Sparkles size={17} aria-hidden="true" /> Analyse with AI{/if}
			</button>
		{/if}
		<button type="button" class="btn btn-secondary" disabled={busy !== null} onclick={() => detectInBrowser()}>
			{#if busy === 'detect'}<LoaderCircle size={17} class="ops-spin" aria-hidden="true" /> Detecting…{:else}<ScanSearch size={17} aria-hidden="true" /> Detect walls &amp; rooms{/if}
		</button>
		<button type="button" class="btn btn-ghost" disabled={busy !== null} onclick={refindRooms} title="Find rooms again from the plan and the walls on the map">
			<DoorOpen size={17} aria-hidden="true" /> Find rooms
		</button>
	</div>
</section>

<div class="work">
	<div class="editor-wrap">
		<FloorMapEditor
			bind:this={editor}
			imageUrl={data.imageUrl}
			imageWidth={data.map.imageWidth}
			imageHeight={data.map.imageHeight}
			bind:layout
			bind:scale
			onchange={() => (dirty = true)}
		/>
	</div>

	<aside class="side">
		<section class="ops-panel tight" aria-labelledby="preview-title">
			<div class="ops-panel-head">
				<h2 id="preview-title">3D preview</h2>
				<span class="ops-hint">Live, as visitors will see it</span>
			</div>
			<div class="preview">
				<FloorMap3D bind:this={preview} imageUrl={data.imageUrl} imageWidth={data.map.imageWidth} imageHeight={data.map.imageHeight} {scale} {layout} compact />
			</div>
		</section>

		<section class="ops-panel tight" aria-labelledby="rooms-title">
			<div class="ops-panel-head">
				<h2 id="rooms-title">Rooms &amp; descriptions</h2>
				<span class="ops-hint">Visitors read these before entering 3D</span>
			</div>
			<div class="room-tools">
				<div class="seg" role="group" aria-label="Show">
					<button type="button" aria-pressed={roomFilter === 'rooms'} onclick={() => (roomFilter = 'rooms')}>
						Rooms &amp; areas ({layout.zones.filter((z) => z.type !== 'stall').length})
					</button>
					<button type="button" aria-pressed={roomFilter === 'stalls'} onclick={() => (roomFilter = 'stalls')}>
						Stalls ({layout.zones.filter((z) => z.type === 'stall').length})
					</button>
				</div>
				<input type="search" placeholder="Search" bind:value={roomQuery} aria-label="Search rooms" />
			</div>
			{#if !listed.length}
				<p class="ops-hint">
					{roomFilter === 'rooms' ? 'No rooms yet. Click "Find rooms", or draw one with the rectangle or shape tool and set its type to Room.' : 'No stalls yet. Draw them with the rectangle tool (R).'}
				</p>
			{:else}
				<ul class="rooms">
					{#each listed as z (z.id)}
						<li>
							<div class="room-head">
								<span class="swatch" style:background={z.color} aria-hidden="true"></span>
								<input class="room-name" bind:value={z.name} maxlength="60" oninput={() => (dirty = true)} aria-label="Name" placeholder={zoneInfo(z.type).label} />
								<span class="kind">{zoneInfo(z.type).label}</span>
								<button type="button" class="btn btn-ghost tiny" onclick={() => show(z.id)}><Eye size={14} aria-hidden="true" /> Show</button>
							</div>
							<textarea
								bind:value={z.description}
								maxlength="600"
								rows="2"
								oninput={() => (dirty = true)}
								placeholder="Description for visitors: what is here, who to meet, timings…"
								aria-label="Description of {z.name || zoneInfo(z.type).label}"
							></textarea>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="ops-panel tight" aria-labelledby="qr-title">
			<h2 id="qr-title">QR code for visitors</h2>
			<div class="qr-row">
				<div class="qr" class:off={!published}>
					{#if qrSrc}<img src={qrSrc} alt="QR code linking to the 3D floor map" width="640" height="640" />{/if}
				</div>
				<div class="qr-info">
					{#if published}
						<p class="ops-hint">Anyone who scans this sees the published map in 3D. No sign-in. The code stays the same when you publish changes.</p>
					{:else}
						<p class="ops-hint warn-text">Publish first: until then the QR shows "not available".</p>
					{/if}
					<div class="link">
						<code>{data.publicUrl.replace(/^https?:\/\//, '')}</code>
						<button type="button" class="btn btn-ghost tiny" onclick={copyLink}><Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}</button>
					</div>
				</div>
			</div>
			<div class="ops-actions">
				<button type="button" class="btn btn-secondary small" onclick={downloadPoster}><Download size={15} aria-hidden="true" /> Poster (PNG)</button>
				<button type="button" class="btn btn-ghost small" onclick={() => qrSrc && download(qrSrc, `${fileBase}-qr.png`)}><Download size={15} aria-hidden="true" /> QR PNG</button>
				<button type="button" class="btn btn-ghost small" onclick={downloadSvg}><Download size={15} aria-hidden="true" /> QR SVG</button>
				{#if published}
					<a class="btn btn-ghost small" href={data.publicUrl} target="_blank" rel="noopener"><ExternalLink size={15} aria-hidden="true" /> Open</a>
				{/if}
			</div>
		</section>
	</aside>
</div>

<style>
	.head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: var(--space-2) var(--space-4);
	}

	.back {
		grid-column: 1 / -1;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		color: var(--text-supporting);
		font-size: 13px;
		text-decoration: none;
	}

	.back:hover {
		color: var(--charcoal);
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.title {
		min-width: 0;
		width: min(100%, 520px);
		padding: 4px 8px;
		margin-left: -8px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		font: 600 22px/1.3 var(--font-sans);
		color: var(--charcoal);
	}

	.title:hover,
	.title:focus {
		border-color: var(--control-border);
		background: var(--white);
	}

	.unsaved {
		font-size: 13px;
		color: var(--warning);
	}

	.analyse {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		padding-block: var(--space-4);
	}

	.work {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 400px;
		gap: var(--space-4);
		align-items: start;
	}

	.editor-wrap {
		height: min(78vh, 820px);
		min-height: 520px;
	}

	.side {
		display: grid;
		gap: var(--space-4);
	}

	.tight {
		padding: var(--space-3) var(--space-4) var(--space-4);
		gap: var(--space-3);
	}

	.preview {
		height: 340px;
		border-radius: 8px;
		overflow: hidden;
	}

	.qr-row {
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
	}

	.qr {
		aspect-ratio: 1;
		padding: 6px;
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: #fff;
	}

	.qr img {
		width: 100%;
		height: auto;
		image-rendering: pixelated;
	}

	.qr.off {
		opacity: 0.45;
	}

	.qr-info {
		display: grid;
		gap: var(--space-2);
	}

	.warn-text {
		color: var(--warning);
	}

	.link {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.link code {
		overflow: hidden;
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.small {
		min-height: 34px;
		padding-inline: 10px;
		font-size: 13px;
	}

	.room-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.room-tools input {
		flex: 1;
		min-width: 120px;
		min-height: 32px;
		padding: 0 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		font: inherit;
	}

	.seg {
		display: inline-flex;
		padding: 2px;
		border-radius: 8px;
		background: var(--mist);
	}

	.seg button {
		min-height: 30px;
		padding: 0 10px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		font: 600 12px/1 var(--font-sans);
		color: var(--text-supporting);
		cursor: pointer;
	}

	.seg button[aria-pressed='true'] {
		background: var(--white);
		color: var(--charcoal);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
	}

	.rooms {
		display: grid;
		gap: 10px;
		max-height: 420px;
		margin: 0;
		padding: 0 4px 0 0;
		overflow-x: hidden;
		overflow-y: auto;
		list-style: none;
	}

	.rooms li {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
		padding: 8px;
		border: 1px solid var(--rule);
		border-radius: 8px;
	}

	.room-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.swatch {
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 4px;
	}

	.room-name {
		flex: 1;
		min-width: 0;
		min-height: 30px;
		padding: 0 8px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		font: 600 14px/1.2 var(--font-sans);
		color: var(--charcoal);
	}

	.room-name:hover,
	.room-name:focus {
		border-color: var(--control-border);
		background: var(--white);
	}

	.kind {
		font-size: 12px;
		color: var(--text-supporting);
		white-space: nowrap;
	}

	.rooms textarea {
		width: 100%;
		min-height: 48px;
		padding: 6px 8px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		font: inherit;
		font-size: 13px;
		resize: vertical;
	}

	.tiny {
		min-height: 28px;
		padding-inline: 8px;
		font-size: 12px;
	}

	@media (max-width: 1180px) {
		.work {
			grid-template-columns: minmax(0, 1fr);
		}

		.side {
			grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		}
	}

	@media (max-width: 720px) {
		.head,
		.analyse {
			grid-template-columns: minmax(0, 1fr);
		}

		.editor-wrap {
			height: 70vh;
		}
	}
</style>
