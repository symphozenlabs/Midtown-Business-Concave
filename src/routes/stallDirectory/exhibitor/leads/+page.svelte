<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { CircleAlert, CircleCheck, Download, Keyboard, Mail, Phone, ScanLine, Search, Trash2, UserCheck } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import QrScanner from '#lib/components/ops/QrScanner.svelte';
	import type { Lead } from '#lib/server/stall-directory/store.ts';

	let { data, form } = $props();

	type Result = { kind: 'ok'; lead: Lead; isNew: boolean } | { kind: 'error'; message: string };

	let scanning = $state(false);
	let busy = $state(false);
	let result = $state<Result | null>(null);
	let code = $state('');
	let query = $state('');
	// The first stall to start with; the exhibitor can switch.
	let stallId = $state(untrack(() => data.stalls[0]?.id ?? ''));

	const when = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.leads;
		return data.leads.filter((l) => [l.fullName, l.companyName, l.designation, l.city, l.note].join(' ').toLowerCase().includes(q));
	});

	/** Whether the last lookup came from the camera, so "Try again" reopens it. */
	let fromCamera = $state(false);

	async function save(text: string, camera = false) {
		if (busy) return;
		busy = true;
		fromCamera = camera;
		try {
			const res = await fetch('/api/stall-directory/lead', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text, bookingId: stallId })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				result = { kind: 'ok', lead: body.lead, isNew: body.isNew };
				navigator.vibrate?.(60);
				await invalidate('stall-directory:leads');
			} else {
				result = { kind: 'error', message: body.message ?? 'That did not work. Try again.' };
			}
		} catch {
			result = { kind: 'error', message: 'No connection. Check your internet and try again.' };
		} finally {
			busy = false;
			// The scan is looked up: switch the camera off until the next one.
			if (camera) scanning = false;
		}
	}

	function scanAgain() {
		result = null;
		scanning = true;
	}

	function onManual(e: SubmitEvent) {
		e.preventDefault();
		if (code.trim()) save(code.trim()).then(() => (code = ''));
	}
</script>

<svelte:head>
	<title>Leads · Exhibitor · Midtown Business Conclave</title>
</svelte:head>

<div class="layout">
<section class="panel scan" aria-labelledby="scan-title">
	<div class="panel-head">
		<h2 id="scan-title"><ScanLine size={18} aria-hidden="true" /> Scan a delegate’s pass</h2>
		{#if data.stalls.length > 1}
			<label class="stall-pick">
				For
				<select bind:value={stallId}>
					{#each data.stalls as s (s.id)}
						<option value={s.id}>{s.stall ? `Stall ${s.stall}` : s.businessName}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>
	<p class="ops-muted">Ask the delegate to show the QR on their ID card or pass. They’re added to your leads with their contact details.</p>

	{#if scanning}
		<QrScanner onscan={(text) => save(text, true)} paused={busy || result !== null} />
		<button type="button" class="btn btn-secondary" onclick={() => ((scanning = false), (result = null))}>Stop camera</button>
	{:else}
		<button type="button" class="ops-big-btn" onclick={() => ((scanning = true), (result = null))}>
			<ScanLine size={20} aria-hidden="true" /> Start scanning
		</button>
	{/if}

	{#if result?.kind === 'ok'}
		<div class="card" role="status">
			<div class="card-top">
				<UserCheck size={20} aria-hidden="true" />
				<strong>{result.isNew ? 'Lead saved' : 'Already in your leads'}</strong>
			</div>
			<p class="name">{result.lead.fullName}</p>
			<p class="ops-muted">{result.lead.designation} · {result.lead.companyName}{result.lead.city ? ` · ${result.lead.city}` : ''}</p>
			<p class="contact">
				<a href="tel:{result.lead.phone}"><Phone size={15} aria-hidden="true" /> {result.lead.phone}</a>
				<a href="mailto:{result.lead.email}"><Mail size={15} aria-hidden="true" /> {result.lead.email}</a>
			</p>
			<button type="button" class="btn btn-primary" onclick={scanAgain}><ScanLine size={16} aria-hidden="true" /> Scan next</button>
		</div>
	{:else if result?.kind === 'error'}
		<div class="ops-banner error" role="alert">
			<CircleAlert size={18} aria-hidden="true" />
			<p>{result.message}</p>
		</div>
		<button type="button" class="btn btn-secondary" onclick={() => (fromCamera ? scanAgain() : (result = null))}>Try again</button>
	{/if}

	<form class="manual" onsubmit={onManual}>
		<label for="manual-code"><Keyboard size={15} aria-hidden="true" /> Camera not working? Type the registration number</label>
		<div class="row">
			<input id="manual-code" bind:value={code} placeholder="MBC-XXXXXX" autocomplete="off" autocapitalize="characters" maxlength="20" />
			<button type="submit" class="btn btn-secondary" disabled={busy || !code.trim()}>Add</button>
		</div>
	</form>
</section>

<section class="panel" aria-labelledby="leads-title">
	<div class="panel-head">
		<h2 id="leads-title">Your leads <span class="count">{data.leads.length}</span></h2>
		{#if data.leads.length}
			<a class="btn btn-secondary ops-btn-sm" href="/stallDirectory/exhibitor/leads/export" download><Download size={15} aria-hidden="true" /> Download CSV</a>
		{/if}
	</div>

	{#if form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{form.message}</p></div>
	{:else if form?.success}
		<div class="ops-banner ok" role="status"><CircleCheck size={18} aria-hidden="true" /><p>{form.success}</p></div>
	{/if}

	{#if data.leads.length > 5}
		<label class="search">
			<Search size={17} aria-hidden="true" />
			<input type="search" bind:value={query} placeholder="Search leads" aria-label="Search leads" autocomplete="off" />
		</label>
	{/if}

	{#if shown.length}
		<ul class="leads">
			{#each shown as l (l.bookingId + l.registrationId)}
				<li>
					<div class="lead-top">
						<div>
							<strong>{l.fullName}</strong>
							<span class="ops-muted">{l.designation} · {l.companyName}</span>
						</div>
						<time datetime={l.scannedAt}>{when.format(new Date(l.scannedAt))}{data.stalls.length > 1 && l.stall ? ` · stall ${l.stall}` : ''}</time>
					</div>
					<p class="contact">
						<a href="tel:{l.phone}"><Phone size={14} aria-hidden="true" /> {l.phone}</a>
						<a href="mailto:{l.email}"><Mail size={14} aria-hidden="true" /> {l.email}</a>
					</p>
					<form method="post" action="?/note" class="note" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="bookingId" value={l.bookingId} />
						<input type="hidden" name="registrationId" value={l.registrationId} />
						<label class="visually-hidden" for="note-{l.registrationId}">Note about {l.fullName}</label>
						<input id="note-{l.registrationId}" name="note" value={l.note} maxlength="300" placeholder="Add a note, e.g. wants a quote by Monday" />
						<button type="submit" class="btn btn-ghost ops-btn-sm">Save</button>
					</form>
					<form method="post" action="?/remove" use:enhance>
						<input type="hidden" name="bookingId" value={l.bookingId} />
						<input type="hidden" name="registrationId" value={l.registrationId} />
						<button type="submit" class="remove"><Trash2 size={14} aria-hidden="true" /> Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else if query.trim()}
		<p class="empty">No lead matches “{query.trim()}”.</p>
	{:else}
		<p class="empty">No leads yet. Scan a delegate’s pass to add one.</p>
	{/if}
</section>
</div>

<style>
	/* Phone: scanner above the list. Laptop: scanner beside the list, staying in view. */
	.layout {
		display: grid;
		gap: var(--space-4);
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
			align-items: start;
			gap: var(--space-6);
		}
		.scan {
			position: sticky;
			top: calc(60px + var(--space-4));
		}
	}
	/* Wide screens: two lead cards per row. */
	@media (min-width: 1180px) {
		.leads {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: var(--space-6);
		}
		.leads li:nth-child(2) {
			border-top: 0;
		}
	}
	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}
	.panel-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--charcoal);
		font: 600 15px/1.3 var(--font-sans);
	}
	.count {
		padding: 1px 8px;
		border-radius: 10px;
		background: var(--mist);
		color: var(--text-supporting);
		font-size: 12px;
	}
	.stall-pick {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;
	}
	.stall-pick select {
		min-height: 36px;
	}
	.card {
		display: grid;
		gap: 4px;
		padding: var(--space-3);
		border: 1px solid var(--gold);
		border-radius: var(--radius-md);
		background: var(--gold-tint);
	}
	.card-top {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--gold-ink);
	}
	.name {
		color: var(--charcoal);
		font-size: 17px;
		font-weight: 600;
	}
	.card .btn {
		justify-self: start;
		margin-top: var(--space-2);
	}
	.contact {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		font-size: 13.5px;
	}
	.contact a {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		overflow-wrap: anywhere;
	}
	.manual {
		display: grid;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
	}
	.manual label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-supporting);
		font-size: 13px;
	}
	.row,
	.note {
		display: flex;
		gap: var(--space-2);
	}
	.row input,
	.note input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		font: 400 16px var(--font-sans);
	}
	.note input {
		min-height: 38px;
		font-size: 14px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		color: var(--text-supporting);
	}
	.search input {
		flex: 1;
		min-width: 0;
		min-height: 42px;
		border: 0;
		background: transparent;
		font: 400 16px var(--font-sans);
		outline: none;
	}
	.search:focus-within,
	.row input:focus-visible,
	.note input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.leads {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.leads li {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--rule);
	}
	.leads li:first-child {
		border-top: 0;
	}
	.lead-top {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.lead-top div {
		display: grid;
		min-width: 0;
	}
	.lead-top strong {
		color: var(--charcoal);
		font-size: 15px;
	}
	.lead-top span {
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.lead-top time {
		flex: none;
		color: var(--text-supporting);
		font-size: 12px;
	}
	.remove {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-supporting);
		font: 500 12.5px var(--font-sans);
		cursor: pointer;
	}
	.remove:hover {
		color: var(--danger);
	}
	.empty {
		padding: var(--space-4) 0;
		color: var(--text-supporting);
		font-size: 14.5px;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
