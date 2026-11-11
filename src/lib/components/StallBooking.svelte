<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		CircleAlert,
		CircleCheck,
		Expand,
		Info,
		LoaderCircle,
		Smartphone,
		TicketPercent,
		X
	} from '@lucide/svelte';
	import { formatPhone } from '#lib/registration.ts';
	import { formatRupees, normaliseUtr, upiLink } from '#lib/payment.ts';
	import {
		STALL_INCLUDES,
		STALL_LIMITS,
		STALL_NUMBERS,
		validateStallBooking,
		type StallField
	} from '#lib/stall-booking.ts';
	import { reveal } from '#lib/actions/reveal.ts';
	import TextField from './TextField.svelte';
	import UpiQr from './UpiQr.svelte';

	interface Offer {
		id: string;
		name: string;
		sizeLabel: string;
		priceRupees: number;
	}

	interface Booking {
		code: string;
		email: string;
		fullName: string;
		businessName: string;
		stallType: string;
		preferredStall: number | null;
		priceRupees: number;
		voucherCode: string | null;
		discountRupees: number;
		amountRupees: number;
		vpa: string;
		payeeName: string;
		status: string;
	}

	const PENDING_KEY = 'mbc-2026-stall-pending';
	const LAYOUT_SRC = '/floor/stall-layout.jpg';

	let offers = $state<Offer[]>([{ id: 'standard', name: 'Standard stall', sizeLabel: '6 ft × 6 ft', priceRupees: 7500 }]);
	let stallTypeId = $state('standard');
	let fullName = $state('');
	let businessName = $state('');
	let email = $state('');
	let phone = $state('');
	let preferred = $state<number | null>(null);
	let errors = $state<Partial<Record<StallField | 'promoCode', string>>>({});

	let promoInput = $state('');
	let promo = $state<{ code: string; label: string; discountRupees: number } | null>(null);
	let promoBusy = $state(false);
	let promoError = $state<string | null>(null);

	let stage = $state<'form' | 'pay' | 'done'>('form');
	let booking = $state<Booking | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let utr = $state('');
	let utrError = $state<string | null>(null);
	let ready = $state(false);
	let reduceMotion = $state(false);
	let zoomed = $state<HTMLDialogElement | null>(null);
	let panel: HTMLElement;

	const offer = $derived(offers.find((o) => o.id === stallTypeId) ?? offers[0]);
	const discount = $derived(promo ? Math.min(promo.discountRupees, offer.priceRupees) : 0);
	const total = $derived(offer.priceRupees - discount);
	const payLink = $derived(booking ? upiLink({ vpa: booking.vpa, payeeName: booking.payeeName, priceRupees: booking.amountRupees }, booking.amountRupees, booking.code) : '');

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		ready = true;
		fetch('/api/stall')
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.offers?.length) {
					offers = data.offers;
					if (!offers.some((o) => o.id === stallTypeId)) stallTypeId = offers[0].id;
				}
			})
			.catch(() => {});
		try {
			const saved = localStorage.getItem(PENDING_KEY);
			if (saved) {
				booking = JSON.parse(saved);
				stage = 'pay';
			}
		} catch {
			/* storage unavailable: start fresh */
		}
	});

	function remember(value: Booking | null) {
		try {
			if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
			else localStorage.removeItem(PENDING_KEY);
		} catch {
			/* ignore */
		}
	}

	const input = () => ({ fullName, businessName, email, phone, preferredStall: preferred, stallTypeId, promoCode: promo?.code ?? '' });

	function check(key: StallField) {
		errors[key] = validateStallBooking(input())[key];
	}

	function recheck(key: StallField) {
		if (errors[key]) check(key);
	}

	async function applyPromo() {
		promoError = null;
		const code = promoInput.trim();
		if (!code) {
			promoError = 'Enter a promo code.';
			return;
		}
		promoBusy = true;
		try {
			const res = await fetch('/api/stall/promo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code, stallTypeId })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				promoError = data.message ?? 'That promo code could not be checked.';
				promo = null;
			} else {
				promo = { code: data.code, label: data.label, discountRupees: data.discountRupees };
				promoInput = data.code;
			}
		} catch {
			promoError = 'No connection. Check your internet and try again.';
		} finally {
			promoBusy = false;
		}
	}

	function removePromo() {
		promo = null;
		promoInput = '';
		promoError = null;
	}

	function scrollToPanel() {
		panel?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
	}

	async function book(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		errors = validateStallBooking(input());
		const first = Object.keys(errors).find((k) => errors[k as StallField]);
		if (first) {
			document.getElementById(`stall-${first}`)?.focus();
			return;
		}
		busy = true;
		try {
			const res = await fetch('/api/stall/book', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input())
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				error = data.message ?? 'Something went wrong. Please try again.';
				if (data.errors) errors = data.errors;
				if (data.errors?.promoCode) {
					promo = null;
					promoError = data.errors.promoCode;
				}
				return;
			}
			booking = data;
			remember(data);
			stage = 'pay';
			scrollToPanel();
		} catch {
			error = 'No connection. Check your internet and try again.';
		} finally {
			busy = false;
		}
	}

	async function pay(event: SubmitEvent) {
		event.preventDefault();
		if (!booking) return;
		error = null;
		const free = booking.amountRupees <= 0;
		const id = free ? null : normaliseUtr(utr);
		if (!free && !id) {
			utrError = 'Enter the 12-digit UPI transaction ID from your payment receipt.';
			document.getElementById('stall-utr')?.focus();
			return;
		}
		utrError = null;
		busy = true;
		try {
			const res = await fetch('/api/stall/pay', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: booking.code, email: booking.email, utr: id, free })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				error = data.message ?? 'Something went wrong. Please try again.';
				if (data.reason === 'not_found' || data.reason === 'rejected') remember(null);
				return;
			}
			booking = data;
			remember(null);
			stage = 'done';
			scrollToPanel();
		} catch {
			error = 'No connection. Check your internet and try again.';
		} finally {
			busy = false;
		}
	}

	function startOver() {
		remember(null);
		booking = null;
		utr = '';
		error = null;
		stage = 'form';
	}

	async function copyUpi() {
		if (!booking) return;
		try {
			await navigator.clipboard.writeText(booking.vpa);
		} catch {
			/* ignore */
		}
	}
</script>

<section class="stalls" id="book-stall" aria-labelledby="stall-title">
	<div class="container">
		<header class="intro" use:reveal>
			<span class="eyebrow">Exhibitor stalls</span>
			<h2 id="stall-title">Book your stall at the <em>conclave</em></h2>
			<p class="lead">
				Put your brand in front of entrepreneurs from across Tamil Nadu. Pick a preferred spot on the floor layout,
				pay by UPI, and the organisers confirm your stall.
			</p>
		</header>

		<div class="grid">
			<div class="panel" bind:this={panel} use:reveal={80}>
				{#if stage === 'done' && booking}
					<div class="done" in:fly={{ y: 16, duration: reduceMotion ? 0 : 480, easing: quintOut }}>
						<span class="done-icon"><CircleCheck size={40} strokeWidth={1.5} aria-hidden="true" /></span>
						<h3>Booking received</h3>
						<p>
							Thank you, {booking.fullName.split(/\s+/)[0]}. Your stall booking <strong>{booking.code}</strong> for
							{booking.businessName} is with the organisers. Once they verify your payment, they will email your
							confirmation and final stall number to <strong>{booking.email}</strong>.
						</p>
						<button type="button" class="btn btn-secondary" onclick={startOver}>Book another stall</button>
					</div>
				{:else if stage === 'pay' && booking}
					<div class="step" in:fly={{ x: 20, duration: reduceMotion ? 0 : 480, easing: quintOut }}>
						<header class="step-head">
							<span class="step-count">Step 2 of 2</span>
							<h3>Pay for your stall</h3>
							<p>
								Booking <strong>{booking.code}</strong> for {booking.businessName} is reserved.
								{booking.amountRupees > 0
									? 'Scan the QR with any UPI app, then enter the transaction ID from your receipt.'
									: 'Your promo code covers the full price. Complete your booking below.'}
							</p>
						</header>

						<div class="pay">
							<div class="qr-card">
								<span class="kicker">{booking.amountRupees > 0 ? 'Scan and pay' : 'Covered by promo'}</span>
								{#if booking.discountRupees > 0}<s class="was">{formatRupees(booking.priceRupees)}</s>{/if}
								<strong class="amount">{formatRupees(booking.amountRupees)}</strong>
								{#if booking.amountRupees > 0}
									<div class="qr-wrap"><UpiQr link={payLink} label="UPI payment QR for {formatRupees(booking.amountRupees)}" /></div>
									<p class="payee">{booking.payeeName}</p>
									<button type="button" class="vpa" onclick={copyUpi} title="Copy UPI ID">{booking.vpa}</button>
									<a class="btn btn-gold app" href={payLink}><Smartphone size={18} aria-hidden="true" /> Pay in UPI app</a>
								{/if}
								{#if booking.voucherCode}<p class="ref">Promo <strong>{booking.voucherCode}</strong> applied</p>{/if}
								<p class="ref">Reference <strong>{booking.code}</strong> is in the payment note</p>
							</div>

							<form class="details" novalidate onsubmit={pay}>
								<dl class="summary">
									<div><dt>Stall</dt><dd>{booking.stallType}</dd></div>
									<div><dt>Preferred stall</dt><dd>{booking.preferredStall ?? 'No preference'}</dd></div>
									<div><dt>Price</dt><dd>{formatRupees(booking.priceRupees)}</dd></div>
									{#if booking.discountRupees > 0}
										<div><dt>Promo {booking.voucherCode}</dt><dd>−{formatRupees(booking.discountRupees)}</dd></div>
									{/if}
									<div class="total"><dt>To pay</dt><dd>{formatRupees(booking.amountRupees)}</dd></div>
								</dl>
								{#if booking.amountRupees > 0}
									<TextField
										id="stall-utr"
										label="UPI transaction ID"
										bind:value={utr}
										required
										inputmode="numeric"
										maxlength={14}
										placeholder="12 digits, e.g. 412345678901"
										help="Find it as UPI Ref No. or UTR on your payment receipt."
										error={utrError}
									/>
								{/if}
								{#if error}
									<div class="alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{error}</p></div>
								{/if}
								<div class="nav">
									<button type="button" class="btn btn-ghost" onclick={startOver} disabled={busy}>
										<ArrowLeft size={18} aria-hidden="true" /> Start over
									</button>
									<button type="submit" class="btn btn-primary" disabled={busy}>
										{#if busy}<LoaderCircle size={18} class="spin" aria-hidden="true" /> Sending…{:else}Complete booking <Check size={18} aria-hidden="true" />{/if}
									</button>
								</div>
							</form>
						</div>
					</div>
				{:else}
					<form class="step" novalidate method="post" onsubmit={book} inert={!ready}>
						<header class="step-head">
							<span class="step-count">Step 1 of 2</span>
							<h3>Your stall details</h3>
							<p>Tell us who is exhibiting and where you would like to be.</p>
						</header>

						<div class="fields">
							<div class="row">
								<TextField
									id="stall-fullName"
									label="Name"
									bind:value={fullName}
									required
									autocomplete="name"
									maxlength={STALL_LIMITS.fullName}
									error={errors.fullName}
									onblur={() => check('fullName')}
									oninput={() => recheck('fullName')}
								/>
								<TextField
									id="stall-businessName"
									label="Business name"
									bind:value={businessName}
									required
									autocomplete="organization"
									maxlength={STALL_LIMITS.businessName}
									error={errors.businessName}
									onblur={() => check('businessName')}
									oninput={() => recheck('businessName')}
								/>
							</div>
							<div class="row">
								<TextField
									id="stall-email"
									label="Email"
									type="email"
									bind:value={email}
									required
									autocomplete="email"
									inputmode="email"
									placeholder="name@company.com"
									help="Your confirmation is sent here."
									error={errors.email}
									onblur={() => check('email')}
									oninput={() => recheck('email')}
								/>
								<TextField
									id="stall-phone"
									label="Mobile / WhatsApp"
									type="tel"
									bind:value={phone}
									required
									autocomplete="tel-national"
									inputmode="numeric"
									prefix="+91"
									placeholder="98765 43210"
									maxlength={11}
									error={errors.phone}
									onblur={() => check('phone')}
									oninput={(v) => {
										phone = formatPhone(v);
										recheck('phone');
									}}
								/>
							</div>

							{#if offers.length > 1}
								<fieldset class="types">
									<legend class="label">Stall type <span class="req" aria-hidden="true">*</span></legend>
									{#each offers as o (o.id)}
										<label class="type" class:selected={stallTypeId === o.id}>
											<input type="radio" name="stallType" value={o.id} bind:group={stallTypeId} onchange={() => promo && applyPromo()} />
											<span><strong>{o.name}</strong> · {o.sizeLabel}</span>
											<span class="price">{formatRupees(o.priceRupees)}</span>
										</label>
									{/each}
								</fieldset>
							{/if}

							<fieldset class="picker" aria-describedby="stall-note">
								<legend class="label">Preferred stall no. <span class="optional">Optional</span></legend>
								<div class="numbers" id="stall-preferredStall" tabindex="-1">
									<button type="button" class="num any" aria-pressed={preferred === null} onclick={() => (preferred = null)}>No preference</button>
									{#each STALL_NUMBERS as n (n)}
										<button type="button" class="num" aria-pressed={preferred === n} onclick={() => (preferred = n)}>{n}</button>
									{/each}
								</div>
								{#if errors.preferredStall}<p class="field-error"><CircleAlert size={15} aria-hidden="true" /> {errors.preferredStall}</p>{/if}
								<p class="note" id="stall-note">
									<Info size={16} aria-hidden="true" />
									<span>
										<strong>Stall no. is only a preference.</strong> The final stall allotment is based on the organisers' decision.
									</span>
								</p>
							</fieldset>

							<div class="promo" class:has-error={!!promoError}>
								<label for="stall-promo" class="label">Promo code <span class="optional">Optional</span></label>
								{#if promo}
									<div class="promo-applied" role="status">
										<TicketPercent size={18} aria-hidden="true" />
										<p><strong>{promo.code}</strong> applied: {promo.label}, you save {formatRupees(discount)}</p>
										<button type="button" class="btn btn-ghost small" onclick={removePromo}><X size={15} aria-hidden="true" /> Remove</button>
									</div>
								{:else}
									<div class="promo-row">
										<input
											id="stall-promo"
											bind:value={promoInput}
											placeholder="Have a code? Enter it here"
											autocomplete="off"
											autocapitalize="characters"
											spellcheck="false"
											maxlength="20"
											aria-invalid={promoError ? 'true' : undefined}
											aria-describedby={promoError ? 'stall-promo-error' : undefined}
											onkeydown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													applyPromo();
												}
											}}
										/>
										<button type="button" class="btn btn-secondary" onclick={applyPromo} disabled={promoBusy}>
											{#if promoBusy}<LoaderCircle size={16} class="spin" aria-hidden="true" /> Checking…{:else}Apply{/if}
										</button>
									</div>
									{#if promoError}<p class="field-error" id="stall-promo-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {promoError}</p>{/if}
								{/if}
							</div>
						</div>

						<div class="checkout">
							<div class="sum">
								<span>Total</span>
								<strong>
									{#if discount > 0}<s>{formatRupees(offer.priceRupees)}</s>{/if}
									{formatRupees(total)}
								</strong>
							</div>
							{#if error}
								<div class="alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{error}</p></div>
							{/if}
							<button type="submit" class="btn btn-primary" disabled={busy}>
								{#if busy}<LoaderCircle size={18} class="spin" aria-hidden="true" /> Booking…{:else}Continue to payment <ArrowRight size={18} aria-hidden="true" />{/if}
							</button>
						</div>
					</form>
				{/if}
			</div>

			<aside class="side" use:reveal={160}>
				<figure class="layout">
					<button type="button" class="zoom" onclick={() => zoomed?.showModal()} aria-label="Enlarge the stall layout">
						<img src={LAYOUT_SRC} alt="Floor layout: stalls 1 to 39 around the hall, with the one-to-one meeting zone, the meeting zone, the stage and the entry." width="1491" height="1055" loading="lazy" decoding="async" />
						<span class="zoom-hint"><Expand size={15} aria-hidden="true" /> Enlarge</span>
					</button>
					<figcaption>Stall layout · entry at the front, stage on the right</figcaption>
				</figure>

				<div class="offer">
					<span class="kicker">Stall</span>
					<strong class="big">{formatRupees(offer.priceRupees)}</strong>
					<span class="size">{offer.name} · {offer.sizeLabel}</span>
					<ul>
						{#each STALL_INCLUDES as item (item)}<li><Check size={15} aria-hidden="true" /> {item}</li>{/each}
					</ul>
					<p class="member">SEF members save 25% with a promo code.</p>
				</div>
			</aside>
		</div>
	</div>
</section>

<dialog class="lightbox" bind:this={zoomed} onclick={(e) => e.target === zoomed && zoomed?.close()} aria-label="Stall layout">
	<button type="button" class="close" onclick={() => zoomed?.close()} aria-label="Close"><X size={22} aria-hidden="true" /></button>
	<img src={LAYOUT_SRC} alt="Floor layout with stall numbers 1 to 39" width="1491" height="1055" />
</dialog>

<style>
	.stalls {
		position: relative;
		padding-block: clamp(var(--section-space-min), 9vw, var(--section-space-max));
		background:
			radial-gradient(60% 40% at 0% 0%, var(--gold-tint), transparent 70%),
			var(--mist);
		border-top: 1px solid var(--rule);
	}

	.intro {
		display: grid;
		gap: var(--space-3);
		max-width: 680px;
		margin-bottom: var(--space-8);
	}

	.intro h2 {
		font-size: clamp(32px, 4vw, 48px);
		line-height: 1.12;
	}

	.intro h2 em {
		font-style: italic;
		color: var(--gold-ink);
	}

	.lead {
		font: var(--text-lead);
		color: var(--text-supporting);
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
		gap: clamp(var(--space-8), 4vw, 64px);
		align-items: start;
	}

	.panel {
		/* The form lays itself out by its own width, not the window's. */
		container-type: inline-size;
		min-width: 0;
		padding: clamp(var(--space-6), 4vw, 40px);
		background: var(--white);
		border: 1px solid var(--rule);
		border-radius: var(--radius-lg);
		scroll-margin-top: 24px;
	}

	.step {
		display: grid;
		gap: var(--space-8);
	}

	.step-head {
		display: grid;
		gap: var(--space-2);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--rule);
	}

	.step-count {
		font: var(--text-eyebrow);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--gold-ink);
	}

	.step-head h3,
	.done h3 {
		font: var(--text-h3);
		font-size: clamp(26px, 3vw, 32px);
	}

	.step-head p {
		color: var(--text-supporting);
	}

	.fields {
		display: grid;
		gap: var(--space-6);
	}

	.row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6);
	}

	fieldset {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.label {
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
		padding: 0;
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

	.numbers {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
		gap: 6px;
		outline: none;
	}

	.num {
		min-height: 44px;
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--charcoal);
		font: 600 15px/1 var(--font-sans);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out);
	}

	.num:hover {
		border-color: var(--charcoal);
	}

	.num.any {
		grid-column: span 3;
		font-weight: 500;
		font-size: 14px;
	}

	.num[aria-pressed='true'] {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--gold);
	}

	.num:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.note {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
		color: var(--charcoal);
		font: var(--text-caption);
		font-size: 14px;
	}

	.note :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--gold-ink);
	}

	.types .type {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.types .type.selected {
		border-color: var(--gold-ink);
		background: var(--gold-tint);
	}

	.types .price {
		margin-left: auto;
		font-weight: 600;
	}

	.promo {
		display: grid;
		gap: var(--space-2);
	}

	.promo-row {
		display: flex;
		gap: var(--space-2);
	}

	.promo-row input {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		padding: 0 var(--space-4);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.promo-row input::placeholder {
		text-transform: none;
		letter-spacing: 0;
	}

	.promo-row input:focus {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.promo.has-error input {
		border-color: var(--danger);
	}

	.promo-applied {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--success-tint);
		color: var(--success);
	}

	.promo-applied p {
		flex: 1;
		color: var(--charcoal);
		font-size: 14px;
	}

	.small {
		min-height: 36px;
		font-size: 14px;
	}

	.field-error {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--text-caption);
		color: var(--danger);
	}

	.checkout {
		display: grid;
		gap: var(--space-4);
		padding-top: var(--space-6);
		border-top: 1px solid var(--rule);
	}

	.checkout .btn-primary {
		justify-self: end;
	}

	.sum {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
		color: var(--text-supporting);
	}

	.sum strong {
		font: 500 32px/1.1 var(--font-display);
		color: var(--charcoal);
	}

	.sum s {
		margin-right: var(--space-2);
		font: 400 18px/1 var(--font-sans);
		color: var(--text-supporting);
	}

	.alert {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
		color: var(--danger);
		font-size: 14px;
	}

	.alert :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	/* Payment */
	.pay {
		display: grid;
		grid-template-columns: minmax(0, 270px) minmax(0, 1fr);
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

	.qr-card .amount {
		font: 500 40px/1.1 var(--font-display);
		color: var(--on-ink);
	}

	.was {
		margin-bottom: -6px;
		opacity: 0.75;
	}

	.qr-wrap {
		width: 100%;
		max-width: 220px;
		margin-block: var(--space-2);
	}

	.payee {
		color: var(--on-ink);
		font-weight: 600;
	}

	.vpa {
		border: 0;
		background: none;
		color: var(--on-ink-soft);
		font: 500 14px/1.4 var(--font-sans);
		cursor: copy;
	}

	.app {
		width: 100%;
		margin-top: var(--space-2);
	}

	.ref {
		font: var(--text-caption);
		color: var(--on-ink-soft);
	}

	.ref strong {
		color: var(--gold-bright);
	}

	.details {
		display: grid;
		gap: var(--space-6);
	}

	.summary {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	.summary div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.summary dt {
		color: var(--text-supporting);
	}

	.summary dd {
		margin: 0;
		color: var(--charcoal);
		text-align: right;
	}

	.summary .total {
		padding-top: var(--space-2);
		border-top: 1px solid var(--rule);
		font-weight: 600;
	}

	.nav {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.done {
		display: grid;
		justify-items: start;
		gap: var(--space-4);
	}

	.done-icon {
		color: var(--success);
	}

	.done p {
		color: var(--text-body);
	}

	/* Side: layout and price */
	.side {
		display: grid;
		gap: var(--space-6);
		position: sticky;
		top: var(--space-6);
	}

	.layout {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	.zoom {
		position: relative;
		display: block;
		padding: 0;
		border: 1px solid var(--rule);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--ink);
		cursor: zoom-in;
		box-shadow: 0 18px 40px rgb(11 20 48 / 0.18);
	}

	.zoom img {
		width: 100%;
		height: auto;
		transition: transform var(--duration-entrance-max) var(--ease-out);
	}

	.zoom:hover img {
		transform: scale(1.03);
	}

	.zoom:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 3px;
	}

	.zoom-hint {
		position: absolute;
		right: var(--space-3);
		bottom: var(--space-3);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 999px;
		background: rgb(6 11 26 / 0.78);
		color: var(--on-ink);
		font: 500 13px/1 var(--font-sans);
	}

	figcaption {
		font: var(--text-caption);
		color: var(--text-supporting);
		text-align: center;
	}

	.offer {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-6);
		border-radius: var(--radius-lg);
		background:
			radial-gradient(90% 60% at 50% 0%, rgb(255 172 72 / 0.2), transparent 70%),
			linear-gradient(180deg, #0c1730, #060b1a);
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.35);
		color: var(--on-ink-soft);
	}

	.offer .big {
		font: 500 44px/1.1 var(--font-display);
		color: var(--on-ink);
	}

	.size {
		color: var(--gold-bright);
		font-weight: 500;
	}

	.offer ul {
		display: grid;
		gap: 6px;
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
		font-size: 14px;
	}

	.offer li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.offer li :global(svg) {
		color: var(--gold);
		flex: none;
	}

	.member {
		margin-top: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid rgb(240 196 112 / 0.25);
		font: var(--text-caption);
		color: var(--gold-bright);
	}

	.lightbox {
		width: min(96vw, 1400px);
		max-width: none;
		max-height: 94vh;
		padding: 0;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--ink);
	}

	.lightbox::backdrop {
		background: rgb(6 11 26 / 0.85);
	}

	.lightbox img {
		width: 100%;
		height: auto;
	}

	.lightbox .close {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: rgb(6 11 26 / 0.8);
		color: var(--on-ink);
		cursor: pointer;
	}

	.panel :global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.side {
			position: static;
			order: -1;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			align-items: start;
		}
	}

	@container (max-width: 620px) {
		.pay {
			grid-template-columns: minmax(0, 1fr);
		}

		.qr-card {
			max-width: 320px;
			justify-self: center;
			width: 100%;
		}
	}

	@container (max-width: 480px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}

		.checkout .btn-primary {
			justify-self: stretch;
		}
	}

	@media (max-width: 720px) {
		.side {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
