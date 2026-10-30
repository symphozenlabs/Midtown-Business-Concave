<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		BadgeCheck,
		CalendarDays,
		Check,
		CircleAlert,
		Copy,
		LoaderCircle,
		QrCode,
		RotateCcw,
		ScanLine,
		Smartphone
	} from '@lucide/svelte';
	import { DEFAULT_EVENT, eventLabels, fromEventFormFields, toEventFormFields } from '#lib/event-settings.ts';
	import { DEFAULT_PAYMENT, formatRupees, parseUpiLink } from '#lib/payment.ts';
	import { decodeQrImage } from '#lib/qr-decode.ts';
	import UpiQr from '#lib/components/UpiQr.svelte';

	let { data, form } = $props();

	type Scope = 'qr' | 'event';

	const saved = untrack(() => ({
		payment: data.available ? data.payment : DEFAULT_PAYMENT,
		event: data.available ? data.event : DEFAULT_EVENT
	}));

	const errors = $derived((form && 'errors' in form ? form.errors : {}) as Record<string, string>);
	const errorFor = (scope: Scope, field: string) => (form?.scope === scope ? errors[field] : undefined);

	let pending = $state<Scope | null>(null);
	const submitting = (scope: Scope) => () => {
		pending = scope;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			pending = null;
		};
	};

	/* ---------- payment QR ---------- */

	let price = $state(String(saved.payment.priceRupees));
	let vpa = $state(saved.payment.vpa);
	let payeeName = $state(saved.payment.payeeName);

	// The live QR is the one generated on the server; edits wait for "Generate QR".
	const live = $derived(data.available ? data.payment : DEFAULT_PAYMENT);
	const liveLink = $derived(data.available ? data.link : '');
	const changed = $derived(
		Number(price) !== live.priceRupees || vpa.trim() !== live.vpa || payeeName.trim().replace(/\s+/g, ' ') !== live.payeeName
	);

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(liveLink);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard unavailable */
		}
	}

	// Fill the payee from an existing QR image, e.g. a Google Pay screenshot.
	let scanning = $state(false);
	let scanNote = $state<{ ok: boolean; text: string } | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function importQr(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		scanning = true;
		scanNote = null;
		try {
			const raw = await decodeQrImage(file);
			const parsed = raw ? parseUpiLink(raw) : null;
			if (!parsed) {
				scanNote = {
					ok: false,
					text: raw ? 'That QR code is not a UPI payment code.' : 'No QR code found. Try a sharper, closer image.'
				};
				return;
			}
			vpa = parsed.vpa;
			if (parsed.payeeName) payeeName = parsed.payeeName;
			if (parsed.amountRupees) price = String(parsed.amountRupees);
			scanNote = { ok: true, text: `Read ${parsed.vpa}. Press Generate QR to apply.` };
		} catch (e) {
			console.error('[configuration] QR import failed', e);
			scanNote = {
				ok: false,
				text: `That image could not be read${e instanceof Error && e.message ? `: ${e.message}` : '.'}`
			};
		} finally {
			scanning = false;
			if (fileInput) fileInput.value = '';
		}
	}

	/* ---------- event date and time ---------- */

	const initialFields = untrack(() => toEventFormFields(saved.event));
	let date = $state(initialFields.date);
	let start = $state(initialFields.start);
	let end = $state(initialFields.end);

	const eventPreview = $derived.by(() => {
		const result = fromEventFormFields({ date, start, end });
		return result.ok ? eventLabels(result.settings) : null;
	});
</script>

<svelte:head>
	<title>Configuration · Admin · Midtown Business Conclave</title>
</svelte:head>

<div class="config">
	<header class="page-head">
		<h1>Configuration</h1>
		<p>Event fee, payment QR and schedule. Changes apply to the registration form immediately.</p>
	</header>

	{#if form?.message}
		<div class="banner error" role="alert">
			<CircleAlert size={16} aria-hidden="true" />
			<p>{form.message}</p>
		</div>
	{:else if form?.success}
		<div class="banner ok" role="status">
			<BadgeCheck size={16} aria-hidden="true" />
			<p>{form.success}</p>
		</div>
	{/if}

	{#if !data.available}
		<div class="banner warn" role="status">
			<CircleAlert size={16} aria-hidden="true" />
			<p>The database is not configured, so configuration cannot be saved. Set <code>DATABASE_URL</code>.</p>
		</div>
	{:else}
	<div class="cards">
		<section class="card" aria-labelledby="qr-title">
			<div class="card-head">
				<QrCode size={18} aria-hidden="true" />
				<h2 id="qr-title">Event fee and payment QR</h2>
			</div>

			<div class="qr-grid">
				<form method="post" action="?/generateQr" use:enhance={submitting('qr')} class="fields">
					<div class="field" class:invalid={errorFor('qr', 'priceRupees')}>
						<label for="priceRupees">Event fee</label>
						<div class="input prefixed">
							<span aria-hidden="true">₹</span>
							<input
								id="priceRupees"
								name="priceRupees"
								type="number"
								inputmode="decimal"
								min="1"
								step="0.01"
								bind:value={price}
								required
							/>
						</div>
						{#if errorFor('qr', 'priceRupees')}<p class="err">{errorFor('qr', 'priceRupees')}</p>{/if}
					</div>

					<div class="field" class:invalid={errorFor('qr', 'vpa')}>
						<label for="vpa">UPI ID</label>
						<input
							id="vpa"
							name="vpa"
							class="input"
							bind:value={vpa}
							placeholder="name@okbank"
							autocomplete="off"
							spellcheck="false"
							required
						/>
						{#if errorFor('qr', 'vpa')}<p class="err">{errorFor('qr', 'vpa')}</p>{/if}
					</div>

					<div class="field" class:invalid={errorFor('qr', 'payeeName')}>
						<label for="payeeName">Payee name</label>
						<input id="payeeName" name="payeeName" class="input" bind:value={payeeName} required />
						{#if errorFor('qr', 'payeeName')}
							<p class="err">{errorFor('qr', 'payeeName')}</p>
						{:else}
							<p class="hint">As shown on the UPI account.</p>
						{/if}
					</div>

					<label class="import" class:busy={scanning}>
						{#if scanning}
							<LoaderCircle size={14} class="spin" aria-hidden="true" /> Reading QR…
						{:else}
							<ScanLine size={14} aria-hidden="true" /> Fill from an existing QR image
						{/if}
						<input
							type="file"
							accept="image/*"
							class="visually-hidden"
							bind:this={fileInput}
							disabled={scanning}
							onchange={importQr}
						/>
					</label>
					{#if scanNote}
						<p class="scan" class:bad={!scanNote.ok}>
							{#if scanNote.ok}<Check size={14} aria-hidden="true" />{:else}<CircleAlert size={14} aria-hidden="true" />{/if}
							{scanNote.text}
						</p>
					{/if}

					<div class="actions">
						<button type="submit" class="btn btn-primary btn-sm" disabled={pending === 'qr'}>
							{#if pending === 'qr'}
								<LoaderCircle size={15} class="spin" aria-hidden="true" /> Generating…
							{:else}
								<QrCode size={15} aria-hidden="true" /> Generate QR
							{/if}
						</button>
						{#if changed}
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								onclick={() => {
									price = String(live.priceRupees);
									vpa = live.vpa;
									payeeName = live.payeeName;
									scanNote = null;
								}}
							>
								<RotateCcw size={14} aria-hidden="true" /> Discard
							</button>
						{/if}
					</div>
				</form>

				<div class="output">
					<div class="qr-card" class:stale={changed}>
						<span class="qr-label">Current QR</span>
						<div class="qr-wrap">
							<UpiQr link={liveLink} label="Payment QR: {formatRupees(live.priceRupees)} to {live.payeeName}" />
						</div>
						<strong class="qr-amount">{formatRupees(live.priceRupees)}</strong>
						<span class="qr-payee">{live.payeeName} · {live.vpa}</span>
					</div>
					{#if changed}
						<p class="pending-note">
							<CircleAlert size={14} aria-hidden="true" /> You have unsaved changes. Press Generate QR to replace this QR.
						</p>
					{/if}

					<div class="link">
						<span class="link-label">Payment link (mobile tap-to-pay)</span>
						<code>{liveLink}</code>
						<p class="hint">
							Opens the delegate's UPI app with the amount filled in. Each delegate's note carries their own
							registration number in place of MBC-XXXXXX.
						</p>
						<div class="link-actions">
							<button type="button" class="btn btn-secondary btn-sm" onclick={copyLink}>
								{#if copied}<Check size={14} aria-hidden="true" /> Copied{:else}<Copy size={14} aria-hidden="true" /> Copy link{/if}
							</button>
							<a class="btn btn-ghost btn-sm" href={liveLink}><Smartphone size={14} aria-hidden="true" /> Test on phone</a>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="card" aria-labelledby="event-title">
			<div class="card-head">
				<CalendarDays size={18} aria-hidden="true" />
				<h2 id="event-title">Event date and time</h2>
			</div>

			<form method="post" action="?/saveEvent" use:enhance={submitting('event')} class="event-form">
				<div class="field" class:invalid={errorFor('event', 'date')}>
					<label for="date">Date</label>
					<input id="date" name="date" type="date" class="input" bind:value={date} required />
					{#if errorFor('event', 'date')}<p class="err">{errorFor('event', 'date')}</p>{/if}
				</div>
				<div class="field" class:invalid={errorFor('event', 'start')}>
					<label for="start">Starts</label>
					<input id="start" name="start" type="time" class="input" bind:value={start} required />
					{#if errorFor('event', 'start')}<p class="err">{errorFor('event', 'start')}</p>{/if}
				</div>
				<div class="field" class:invalid={errorFor('event', 'end')}>
					<label for="end">Ends</label>
					<input id="end" name="end" type="time" class="input" bind:value={end} required />
					{#if errorFor('event', 'end')}<p class="err">{errorFor('event', 'end')}</p>{/if}
				</div>

				<p class="preview">
					{#if eventPreview}
						Shown as <strong>{eventPreview.dateLabel}</strong>, {eventPreview.timeLabel} (IST)
					{:else}
						Choose a date, a start time and a later end time.
					{/if}
				</p>

				<div class="actions">
					<button type="submit" class="btn btn-primary btn-sm" disabled={pending === 'event'}>
						{#if pending === 'event'}<LoaderCircle size={15} class="spin" aria-hidden="true" /> Saving…{:else}Save schedule{/if}
					</button>
				</div>
				<p class="hint span">The poster artwork keeps its own printed date; this does not redraw posters.</p>
			</form>
		</section>
	</div>
	{/if}
</div>

<style>
	.config {
		display: grid;
		gap: var(--space-4);
		font-size: 14px;
		line-height: 1.5;
	}

	/* Payment card takes the wide column, the schedule sits beside it. */
	.cards {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
		gap: var(--space-4);
		align-items: start;
	}

	.page-head {
		display: grid;
		gap: 2px;
	}

	h1 {
		font: 600 20px/1.3 var(--font-sans);
	}

	.page-head p {
		font-size: 13px;
		color: var(--text-supporting);
	}

	h2 {
		font: 600 15px/1.3 var(--font-sans);
	}

	.banner {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: 13px;
	}

	.banner :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.banner p {
		color: var(--charcoal);
	}

	.banner.warn {
		background: var(--warning-tint);
		color: var(--warning);
	}

	.banner.error {
		background: var(--danger-tint);
		color: var(--danger);
	}

	.banner.ok {
		background: var(--success-tint);
		color: var(--success);
	}

	.card {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-6) var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--rule);
		color: var(--gold-ink);
	}

	/* Compact form controls --------------------------------------------- */

	.field {
		display: grid;
		gap: 4px;
		align-content: start;
	}

	label:not(.import) {
		font-size: 13px;
		font-weight: 500;
		color: var(--charcoal);
	}

	.input {
		width: 100%;
		min-height: 36px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--charcoal);
		font-size: 14px;
	}

	input.input:focus,
	.prefixed:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.prefixed {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.prefixed span {
		color: var(--text-supporting);
	}

	.prefixed input {
		flex: 1;
		min-width: 0;
		min-height: 34px;
		border: 0;
		background: none;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}

	.prefixed input:focus {
		outline: none;
	}

	.invalid .input {
		border-color: var(--danger);
	}

	.hint {
		font-size: 12px;
		color: var(--text-supporting);
	}

	.err {
		font-size: 12px;
		color: var(--danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.btn-sm {
		min-height: 34px;
		padding-inline: var(--space-3);
		font-size: 13px;
	}

	/* Payment QR -------------------------------------------------------- */

	.qr-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 300px);
		gap: var(--space-6);
		align-items: start;
	}

	.fields {
		display: grid;
		gap: var(--space-3);
	}

	.import {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		justify-self: start;
		font-size: 12px;
		font-weight: 500;
		color: var(--gold-ink);
		cursor: pointer;
	}

	.import:hover {
		text-decoration: underline;
	}

	.import.busy {
		cursor: progress;
		color: var(--text-supporting);
	}

	.import:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.scan {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--success);
	}

	.scan.bad {
		color: var(--danger);
	}

	.output {
		display: grid;
		gap: var(--space-3);
	}

	.qr-card {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: #0c1730;
		color: var(--on-ink-soft);
		text-align: center;
		transition: opacity var(--duration-feedback) var(--ease-out);
	}

	.qr-card.stale {
		opacity: 0.55;
	}

	.qr-label {
		font: 600 10px/1.4 var(--font-sans);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.qr-wrap {
		width: 100%;
		max-width: 168px;
		margin-block: var(--space-2);
	}

	.qr-amount {
		font: 600 18px/1.2 var(--font-sans);
		color: var(--on-ink);
	}

	.qr-payee {
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.pending-note {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		font-size: 12px;
		color: var(--warning);
	}

	.pending-note :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.link {
		display: grid;
		gap: 6px;
	}

	.link-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.link code {
		display: block;
		padding: var(--space-2);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--charcoal);
		font: 11px/1.5 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		overflow-wrap: anywhere;
		user-select: all;
	}

	.link-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* Schedule ---------------------------------------------------------- */

	/* Narrow column: date on its own row, start and end side by side. */
	.event-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.event-form .field:first-child,
	.preview,
	.event-form .actions,
	.span {
		grid-column: 1 / -1;
	}

	.preview {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--paper);
		font-size: 13px;
		color: var(--text-body);
	}

	.preview strong {
		color: var(--charcoal);
		font-weight: 600;
	}

	code {
		font-size: 12px;
	}

	:global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1100px) {
		.cards {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 760px) {
		.qr-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.card {
			padding-inline: var(--space-4);
		}

		/* Avoid iOS zoom on focus. */
		.input,
		.prefixed input {
			font-size: 16px;
		}
	}
</style>
