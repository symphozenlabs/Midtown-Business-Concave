<script lang="ts">
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		ChevronRight,
		CircleAlert,
		Copy,
		Gift,
		LoaderCircle,
		Smartphone,
		TicketPercent,
		X
	} from '@lucide/svelte';
	import { formatRupees, normaliseUtr, upiLink } from '#lib/payment.ts';
	import { SubmitError, applyVoucher, type PaymentDetails, type PendingRegistration } from '#lib/submit.ts';
	import TextField from './TextField.svelte';
	import UpiQr from './UpiQr.svelte';

	interface Props {
		pending: PendingRegistration;
		busy: boolean;
		error: string | null;
		/** The UPI transaction ID, or null when a voucher covers the whole fee. */
		oncomplete: (utr: string | null) => void;
		onvoucher: (details: PaymentDetails) => void;
		onback: () => void;
	}

	let { pending, busy, error, oncomplete, onvoucher, onback }: Props = $props();

	let utr = $state('');
	let utrError = $state<string | null>(null);
	let copied = $state(false);

	/* ---------- voucher ---------- */

	let voucherOpen = $state(false);
	let voucherCode = $state('');
	let voucherError = $state<string | null>(null);
	let voucherBusy = $state(false);
	let voucherInput = $state<HTMLInputElement | null>(null);

	const discount = $derived(pending.voucherCode ? (pending.discountRupees ?? 0) : 0);
	const fullPrice = $derived(pending.priceRupees ?? pending.amountRupees + discount);
	const free = $derived(discount > 0 && pending.amountRupees <= 0);

	async function openVoucher() {
		voucherOpen = true;
		voucherError = null;
		await Promise.resolve();
		voucherInput?.focus();
	}

	async function setVoucher(code: string) {
		if (voucherBusy) return;
		if (code && !code.trim()) {
			voucherError = 'Enter your voucher code.';
			return;
		}
		voucherBusy = true;
		voucherError = null;
		try {
			const details = await applyVoucher(pending, code.trim());
			onvoucher(details);
			voucherOpen = false;
			voucherCode = '';
		} catch (e) {
			voucherError = e instanceof SubmitError && e.message ? e.message : 'The voucher could not be checked. Please try again.';
		} finally {
			voucherBusy = false;
		}
	}

	const amount = $derived(formatRupees(pending.amountRupees));
	const link = $derived(
		upiLink({ priceRupees: pending.amountRupees, vpa: pending.vpa, payeeName: pending.payeeName }, pending.amountRupees, pending.code)
	);

	function format(value: string) {
		const digits = value.replace(/\D/g, '').slice(0, 12);
		return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
	}

	async function copyVpa() {
		try {
			await navigator.clipboard.writeText(pending.vpa);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard unavailable */
		}
	}

	function complete(event: SubmitEvent) {
		event.preventDefault();
		if (free) {
			oncomplete(null);
			return;
		}
		const value = normaliseUtr(utr);
		if (!value) {
			utrError = utr.trim()
				? 'A UPI transaction ID has 12 digits. Check your payment receipt.'
				: 'Enter the 12-digit UPI transaction ID from your payment receipt.';
			document.getElementById('field-utr')?.focus();
			return;
		}
		utrError = null;
		oncomplete(value);
	}
</script>

{#snippet voucherBox()}
	<div class="voucher">
		{#if pending.voucherCode}
			<div class="voucher-applied" role="status">
				<TicketPercent size={18} aria-hidden="true" />
				<p>
					Voucher <strong class="code">{pending.voucherCode}</strong> applied:
					<strong>{formatRupees(discount)} off</strong>
				</p>
				<button type="button" class="btn btn-ghost voucher-remove" onclick={() => setVoucher('')} disabled={voucherBusy || busy}>
					{#if voucherBusy}<LoaderCircle size={15} class="spin" aria-hidden="true" />{:else}<X size={15} aria-hidden="true" />{/if}
					Remove
				</button>
			</div>
		{:else if voucherOpen}
			<div class="voucher-entry" class:has-error={!!voucherError}>
				<label for="field-voucher" class="voucher-label">Voucher code</label>
				<div class="voucher-row">
					<input
						id="field-voucher"
						bind:this={voucherInput}
						bind:value={voucherCode}
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						maxlength={20}
						placeholder="e.g. EARLYBIRD"
						aria-invalid={voucherError ? 'true' : undefined}
						aria-describedby={voucherError ? 'voucher-error' : undefined}
						oninput={() => {
							voucherCode = voucherCode.toUpperCase();
							voucherError = null;
						}}
						onkeydown={(e) => {
							// Enter applies the code instead of submitting the payment form.
							if (e.key === 'Enter') {
								e.preventDefault();
								setVoucher(voucherCode);
							}
						}}
					/>
					<button type="button" class="btn btn-secondary" onclick={() => setVoucher(voucherCode)} disabled={voucherBusy}>
						{#if voucherBusy}<LoaderCircle size={16} class="spin" aria-hidden="true" /> Checking…{:else}Apply{/if}
					</button>
					<button type="button" class="btn btn-ghost" onclick={() => ((voucherOpen = false), (voucherError = null))} disabled={voucherBusy}>
						Cancel
					</button>
				</div>
				{#if voucherError}
					<p class="voucher-error" id="voucher-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {voucherError}</p>
				{/if}
			</div>
		{:else}
			<button type="button" class="voucher-open" onclick={openVoucher}>
				<span class="voucher-icon"><TicketPercent size={20} aria-hidden="true" /></span>
				<span class="voucher-text">
					<strong>Have a voucher code?</strong>
					<span>Apply it before you pay to get your discount.</span>
				</span>
				<span class="voucher-cta">Apply <ChevronRight size={16} aria-hidden="true" /></span>
			</button>
		{/if}
	</div>
{/snippet}

<div class="pay">
	{#if free}
		<div class="qr-card">
			<span class="kicker">Covered by voucher</span>
			<s class="was">{formatRupees(fullPrice)}</s>
			<strong class="amount">{formatRupees(0)}</strong>
			<span class="gift"><Gift size={56} strokeWidth={1.4} aria-hidden="true" /></span>
			<p class="payee">Nothing to pay</p>
			<p class="ref">Voucher <strong>{pending.voucherCode}</strong> covers the full fee</p>
		</div>
	{:else}
	<div class="qr-card">
		<span class="kicker">Scan and pay</span>
		{#if discount > 0}<s class="was">{formatRupees(fullPrice)}</s>{/if}
		<strong class="amount">{amount}</strong>
		<div class="qr-wrap">
			<UpiQr {link} label="UPI payment QR: {amount} to {pending.payeeName}, reference {pending.code}" />
		</div>
		<p class="payee">{pending.payeeName}</p>
		<button type="button" class="vpa" onclick={copyVpa}>
			<span>{pending.vpa}</span>
			{#if copied}
				<Check size={15} aria-hidden="true" /> <span class="copied">Copied</span>
			{:else}
				<Copy size={15} aria-hidden="true" /><span class="visually-hidden">Copy UPI ID</span>
			{/if}
		</button>
		<a class="btn btn-gold app" href={link}>
			<Smartphone size={18} aria-hidden="true" /> Pay {amount} with a UPI app
		</a>
		<p class="ref">Reference <strong>{pending.code}</strong> is added to the payment note</p>
	</div>
	{/if}

	<form class="details" novalidate onsubmit={complete}>
		{#if free}
		<p class="free-note">
			Your voucher covers the whole fee, so there is nothing to pay. Complete your registration and we will email your
			ticket once the organisers confirm it.
		</p>
		{@render voucherBox()}
		{:else}
		<ol class="how">
			<li>
				<span class="num">1</span>
				<p>
					Scan the QR with Google Pay, PhonePe, Paytm or any UPI app and pay <strong>{amount}</strong>. The amount and your
					registration number are filled in for you.
				</p>
			</li>
			<li>
				<span class="num">2</span>
				<p>
					Open the payment receipt and copy the 12-digit <strong>UPI transaction ID</strong> (also shown as UTR or UPI Ref.
					No.).
				</p>
			</li>
			<li>
				<span class="num">3</span>
				<p>Paste it below and complete your registration. We will email your ticket once the payment is confirmed.</p>
			</li>
		</ol>

		{@render voucherBox()}

		<TextField
			id="field-utr"
			label="UPI transaction ID"
			bind:value={utr}
			required
			inputmode="numeric"
			autocomplete="off"
			placeholder="e.g. 4321 0987 6543"
			maxlength={14}
			help="12 digits, from your payment receipt."
			error={utrError}
			oninput={(v) => {
				utr = format(v);
				if (utrError && normaliseUtr(utr)) utrError = null;
			}}
		/>
		{/if}

		{#if error}
			<div class="alert" role="alert">
				<CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
				<p>{error}</p>
			</div>
		{/if}

		<div class="nav">
			<button type="button" class="btn btn-ghost" onclick={onback} disabled={busy}>
				<ArrowLeft size={18} aria-hidden="true" /> Edit details
			</button>
			<button type="submit" class="btn btn-primary submit" disabled={busy || voucherBusy}>
				{#if busy}
					<LoaderCircle size={18} class="spin" aria-hidden="true" /> Sending…
				{:else}
					Complete registration <ArrowRight size={18} aria-hidden="true" />
				{/if}
			</button>
		</div>
	</form>
</div>

<style>
	.pay {
		display: grid;
		grid-template-columns: minmax(0, 290px) minmax(0, 1fr);
		gap: var(--space-8);
		align-items: start;
	}

	.qr-card {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-6) var(--space-4);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(90% 60% at 50% 0%, rgb(255 172 72 / 0.22), transparent 70%),
			linear-gradient(180deg, #0c1730, #060b1a);
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.35);
		color: var(--on-ink-soft);
		text-align: center;
	}

	.kicker {
		font: 600 11px/1 var(--font-sans);
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.amount {
		font: 500 40px/1.1 var(--font-display);
		color: var(--on-ink);
		font-variant-numeric: lining-nums;
	}

	.qr-wrap {
		width: 100%;
		max-width: 230px;
		margin-block: var(--space-2);
	}

	.was {
		margin-bottom: -6px;
		font: 500 16px/1.2 var(--font-sans);
		color: var(--on-ink-soft);
		opacity: 0.75;
	}

	.gift {
		display: grid;
		place-items: center;
		width: 120px;
		height: 120px;
		margin-block: var(--space-3);
		border-radius: 50%;
		background: rgb(227 176 75 / 0.12);
		color: var(--gold);
	}

	/* Voucher ------------------------------------------------------------- */

	/* A card, not a link: easy to spot between the steps and the transaction ID. */
	.voucher-open {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 1.5px dashed var(--gold-ink);
		border-radius: var(--radius-md);
		background: var(--gold-tint);
		color: var(--charcoal);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out);
	}

	.voucher-open:hover {
		border-style: solid;
		background: #f8ead0;
	}

	.voucher-open:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.voucher-icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--gold);
	}

	.voucher-text {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.voucher-text strong {
		font: 600 16px/1.3 var(--font-sans);
		color: var(--charcoal);
	}

	.voucher-text span {
		font-size: 14px;
		line-height: 1.4;
		color: var(--text-supporting);
	}

	.voucher-cta {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 2px;
		font: 600 14px/1 var(--font-sans);
		color: var(--gold-ink);
	}

	.voucher-entry {
		display: grid;
		gap: var(--space-2);
	}

	.voucher-label {
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.voucher-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.voucher-row input {
		flex: 1 1 180px;
		min-width: 0;
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		color: var(--charcoal);
		font-size: 16px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.voucher-row input::placeholder {
		color: #8b8f86;
		letter-spacing: normal;
		text-transform: none;
	}

	.voucher-row input:hover,
	.voucher-row input:focus {
		border-color: var(--charcoal);
	}

	.voucher-row input:focus {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.has-error .voucher-row input {
		border-color: var(--danger);
	}

	.voucher-error {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		color: var(--danger);
	}

	.voucher-applied {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--success-tint);
		color: var(--success);
	}

	.voucher-applied :global(svg) {
		flex: none;
	}

	.voucher-applied p {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		color: var(--charcoal);
	}

	.voucher-applied .code {
		letter-spacing: 0.06em;
	}

	.voucher-remove {
		flex: none;
		min-height: 36px;
	}

	.free-note {
		font-size: 15px;
		line-height: 1.55;
		color: var(--text-body);
	}

	.payee {
		font: 600 15px/1.3 var(--font-sans);
		color: var(--on-ink);
		letter-spacing: 0.04em;
	}

	.vpa {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid rgb(240 196 112 / 0.4);
		border-radius: 999px;
		background: rgb(255 255 255 / 0.04);
		color: var(--on-ink-soft);
		font: 500 14px/1.3 var(--font-sans);
		cursor: pointer;
	}

	.vpa:hover {
		border-color: var(--gold);
	}

	.vpa :global(svg) {
		color: var(--gold);
	}

	.copied {
		color: var(--gold);
	}

	.app {
		display: none;
		width: 100%;
		margin-top: var(--space-3);
	}

	/* Phones can open the UPI app directly instead of scanning their own screen. */
	@media (pointer: coarse) {
		.app {
			display: inline-flex;
		}
	}

	.ref {
		margin-top: var(--space-2);
		font: var(--text-caption);
		font-size: 12px;
	}

	.ref strong {
		color: var(--gold);
		letter-spacing: 0.06em;
	}

	.details {
		display: grid;
		gap: var(--space-6);
	}

	.how {
		display: grid;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.how li {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
	}

	.num {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--gold);
		font: 600 13px/1 var(--font-sans);
	}

	.how p {
		font-size: 15px;
		line-height: 1.55;
		color: var(--text-body);
	}

	.how strong {
		color: var(--charcoal);
	}

	.alert {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.alert :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.alert p {
		color: var(--charcoal);
	}

	.nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding-top: var(--space-6);
		border-top: 1px solid var(--rule);
	}

	.submit {
		margin-left: auto;
		min-width: 220px;
	}

	@media (max-width: 760px) {
		.pay {
			grid-template-columns: minmax(0, 1fr);
		}

		.qr-card {
			max-width: 340px;
			width: 100%;
			justify-self: center;
		}
	}

	/* Phones: full-width primary action on top, the way back below it. */
	@media (max-width: 600px) {
		.nav {
			flex-direction: column-reverse;
			align-items: stretch;
		}

		.submit {
			width: 100%;
			min-width: 0;
			margin-left: 0;
		}
	}
</style>
