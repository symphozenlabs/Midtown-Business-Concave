<script lang="ts">
	import { ArrowLeft, ArrowRight, Check, CircleAlert, Copy, LoaderCircle, Smartphone } from '@lucide/svelte';
	import { formatRupees, normaliseUtr, upiLink } from '#lib/payment.ts';
	import type { PendingRegistration } from '#lib/submit.ts';
	import TextField from './TextField.svelte';
	import UpiQr from './UpiQr.svelte';

	interface Props {
		pending: PendingRegistration;
		busy: boolean;
		error: string | null;
		oncomplete: (utr: string) => void;
		onback: () => void;
	}

	let { pending, busy, error, oncomplete, onback }: Props = $props();

	let utr = $state('');
	let utrError = $state<string | null>(null);
	let copied = $state(false);

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

<div class="pay">
	<div class="qr-card">
		<span class="kicker">Scan and pay</span>
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

	<form class="details" novalidate onsubmit={complete}>
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
			<button type="submit" class="btn btn-primary submit" disabled={busy}>
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
