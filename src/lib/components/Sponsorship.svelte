<script lang="ts">
	import { Award, Check, CircleAlert, CircleCheck, Crown, Handshake, LoaderCircle, Send, X, Zap } from '@lucide/svelte';
	import { formatPhone } from '#lib/registration.ts';
	import { formatRupees } from '#lib/payment.ts';
	import {
		SPONSOR_LIMITS,
		SPONSOR_TIERS,
		validateSponsorRequest,
		type SponsorField,
		type SponsorTier
	} from '#lib/stall-booking.ts';
	import { onMount } from 'svelte';
	import { reveal } from '#lib/actions/reveal.ts';
	import { scrollToElement } from '#lib/smooth-scroll.ts';
	import TextField from './TextField.svelte';

	let dialog = $state<HTMLDialogElement | null>(null);
	let contactName = $state('');
	let companyName = $state('');
	let email = $state('');
	let phone = $state('');
	let tier = $state<SponsorTier['id']>('title');
	let message = $state('');
	let errors = $state<Partial<Record<SponsorField, string>>>({});
	let busy = $state(false);
	let error = $state<string | null>(null);
	let sent = $state(false);

	const input = () => ({ contactName, companyName, email, phone, tier, message });

	let section: HTMLElement;

	/**
	 * Links to #become-sponsor (the hero's "Sponsor" button, or a shared link) bring
	 * the packages into view and open the request form.
	 */
	onMount(() => {
		const go = () => {
			scrollToElement(section);
			setTimeout(() => open(tier), 450);
		};
		const onClick = (e: MouseEvent) => {
			const link = (e.target as Element | null)?.closest?.('a[href="#become-sponsor"]');
			if (!link) return;
			e.preventDefault();
			go();
		};
		document.addEventListener('click', onClick, true);
		if (location.hash === '#become-sponsor') {
			history.replaceState(null, '', location.pathname + location.search);
			go();
		}
		return () => document.removeEventListener('click', onClick, true);
	});

	function open(chosen: SponsorTier['id']) {
		tier = chosen;
		error = null;
		if (sent) {
			sent = false;
			contactName = companyName = email = phone = message = '';
			errors = {};
		}
		dialog?.showModal();
	}

	function check(key: SponsorField) {
		errors[key] = validateSponsorRequest(input())[key];
	}

	function recheck(key: SponsorField) {
		if (errors[key]) check(key);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		errors = validateSponsorRequest(input());
		const first = Object.keys(errors).find((k) => errors[k as SponsorField]);
		if (first) {
			document.getElementById(`sponsor-${first}`)?.focus();
			return;
		}
		busy = true;
		try {
			const res = await fetch('/api/sponsor', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input())
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				error = data.message ?? 'Something went wrong. Please try again.';
				if (data.errors) errors = data.errors;
				return;
			}
			sent = true;
		} catch {
			error = 'No connection. Check your internet and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="sponsorship on-ink" id="sponsor" aria-labelledby="sponsorship-title" bind:this={section}>
	<div class="container">
		<header class="intro" use:reveal>
			<span class="eyebrow">Sponsorship opportunities</span>
			<h2 id="sponsorship-title">Put your brand at the <em>centre</em> of the conclave</h2>
			<p>Three ways to partner with the Midtown Business Conclave, seen by entrepreneurs from across Tamil Nadu.</p>
			<span class="rule" aria-hidden="true"></span>
		</header>

		<ul class="tiers">
			{#each SPONSOR_TIERS as t, i (t.id)}
				<li class="tier {t.id}" use:reveal={120 + i * 120}>
					<div class="card">
						<span class="badge" aria-hidden="true">
							{#if t.id === 'title'}<Crown size={20} />{:else if t.id === 'powered-by'}<Zap size={20} />{:else}<Award size={20} />{/if}
						</span>
						<h3>{t.name}</h3>
						<strong class="price">{formatRupees(t.priceRupees)}</strong>
						<ul class="benefits">
							{#each t.benefits as b (b)}<li><Check size={15} aria-hidden="true" /> {b}</li>{/each}
						</ul>
					</div>
				</li>
			{/each}
		</ul>

		<div class="cta" use:reveal={200}>
			<p>Not sure which fits? Tell us about your brand and we will suggest one.</p>
			<button type="button" class="btn btn-gold big" onclick={() => open(tier)}>
				<Handshake size={20} aria-hidden="true" /> Become a sponsor
			</button>
		</div>
	</div>
</section>

<dialog class="sheet" bind:this={dialog} aria-labelledby="sponsor-dialog-title" onclick={(e) => e.target === dialog && !busy && dialog?.close()}>
	<div class="sheet-inner">
		<button type="button" class="close" onclick={() => dialog?.close()} aria-label="Close" disabled={busy}><X size={20} aria-hidden="true" /></button>
		{#if sent}
			<div class="sent">
				<span class="sent-icon"><CircleCheck size={44} strokeWidth={1.5} aria-hidden="true" /></span>
				<h2 id="sponsor-dialog-title">Request sent</h2>
				<p>Thank you, {contactName.split(/\s+/)[0]}. The organising team will contact you at <strong>{email}</strong> or {phone} shortly.</p>
				<button type="button" class="btn btn-primary" onclick={() => dialog?.close()}>Done</button>
			</div>
		{:else}
			<header>
				<span class="eyebrow">Become a sponsor</span>
				<h2 id="sponsor-dialog-title">Request a sponsorship</h2>
				<p>Share your details and the organisers will get in touch. Nothing to pay now.</p>
			</header>
			<form novalidate onsubmit={submit}>
				<fieldset class="choose">
					<legend class="label">Sponsorship level <span class="req" aria-hidden="true">*</span></legend>
					<div class="options" id="sponsor-tier" tabindex="-1">
						{#each SPONSOR_TIERS as t (t.id)}
							<label class="option" class:selected={tier === t.id}>
								<input type="radio" name="tier" value={t.id} bind:group={tier} />
								<span class="name">{t.name}</span>
								<span class="amt">{formatRupees(t.priceRupees)}</span>
							</label>
						{/each}
					</div>
					{#if errors.tier}<p class="field-error"><CircleAlert size={15} aria-hidden="true" /> {errors.tier}</p>{/if}
				</fieldset>
				<div class="row">
					<TextField id="sponsor-contactName" label="Your name" bind:value={contactName} required autocomplete="name" maxlength={SPONSOR_LIMITS.contactName} error={errors.contactName} onblur={() => check('contactName')} oninput={() => recheck('contactName')} />
					<TextField id="sponsor-companyName" label="Company / brand" bind:value={companyName} required autocomplete="organization" maxlength={SPONSOR_LIMITS.companyName} error={errors.companyName} onblur={() => check('companyName')} oninput={() => recheck('companyName')} />
				</div>
				<div class="row">
					<TextField id="sponsor-email" label="Email" type="email" bind:value={email} required autocomplete="email" inputmode="email" placeholder="name@company.com" error={errors.email} onblur={() => check('email')} oninput={() => recheck('email')} />
					<TextField
						id="sponsor-phone"
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
				<TextField id="sponsor-message" label="Anything we should know?" bind:value={message} multiline rows={3} maxlength={SPONSOR_LIMITS.message} showCount placeholder="What you would like to promote, questions about the packages…" error={errors.message} />
				{#if error}<div class="alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{error}</p></div>{/if}
				<div class="actions">
					<button type="button" class="btn btn-ghost" onclick={() => dialog?.close()} disabled={busy}>Cancel</button>
					<button type="submit" class="btn btn-primary" disabled={busy}>
						{#if busy}<LoaderCircle size={18} class="spin" aria-hidden="true" /> Sending…{:else}<Send size={18} aria-hidden="true" /> Send request{/if}
					</button>
				</div>
			</form>
		{/if}
	</div>
</dialog>

<style>
	.sponsorship {
		position: relative;
		padding-block: clamp(var(--section-space-min), 8vw, var(--section-space-max));
		background:
			radial-gradient(55% 60% at 50% 0%, rgb(255 172 72 / 0.12), transparent 70%),
			linear-gradient(180deg, #0a1330 0%, #04070f 100%);
		color: var(--on-ink-soft);
		overflow: hidden;
	}

	.intro {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	.intro .eyebrow {
		color: var(--gold);
	}

	.intro h2 {
		font: var(--text-display);
		font-size: clamp(30px, 3.6vw, 46px);
		line-height: 1.1;
		color: var(--on-ink);
		max-width: 20ch;
	}

	.intro h2 em {
		font-style: italic;
		background: linear-gradient(100deg, var(--gold-bright) 0%, var(--gold) 45%, var(--gold-deep) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.06em;
	}

	.intro p {
		max-width: 52ch;
	}

	.rule {
		width: 96px;
		height: 1px;
		margin-top: var(--space-2);
		background: linear-gradient(90deg, rgb(240 190 100 / 0), var(--gold), rgb(240 190 100 / 0));
	}

	.tiers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: clamp(var(--space-4), 2.5vw, var(--space-8));
		margin: clamp(var(--space-8), 5vw, 56px) 0 0;
		padding: 0;
		list-style: none;
	}

	.tier {
		display: grid;
	}

	.card {
		display: grid;
		grid-template-rows: auto auto auto 1fr;
		gap: var(--space-3);
		padding: var(--space-8) var(--space-6) var(--space-6);
		border-radius: var(--radius-lg);
		background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02));
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.28);
		transition:
			transform var(--duration-entrance-max) var(--ease-out),
			box-shadow var(--duration-entrance-max) var(--ease-out);
	}

	.title .card {
		background:
			radial-gradient(90% 50% at 50% 0%, rgb(255 190 90 / 0.24), transparent 70%),
			linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02));
		box-shadow:
			inset 0 0 0 1px rgb(245 207 119 / 0.75),
			0 24px 60px rgb(0 0 0 / 0.4);
	}

	@media (hover: hover) {
		.card:hover {
			transform: translate3d(0, -4px, 0);
			box-shadow:
				inset 0 0 0 1px rgb(245 207 119 / 0.8),
				0 0 36px rgb(255 180 80 / 0.18);
		}
	}

	.badge {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: linear-gradient(135deg, #fff3cc, #e0a13f 55%, #b26e1c);
		color: #0b1430;
	}

	.card h3 {
		font: var(--text-eyebrow);
		font-size: 13px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.price {
		font: 500 clamp(34px, 3.4vw, 44px) / 1.1 var(--font-display);
		color: var(--on-ink);
	}

	.benefits {
		display: grid;
		align-content: start;
		gap: 8px;
		margin: var(--space-2) 0 0;
		padding: var(--space-4) 0 0;
		border-top: 1px solid rgb(240 196 112 / 0.2);
		list-style: none;
		font-size: 14px;
	}

	.benefits li {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}

	.benefits :global(svg) {
		flex: none;
		margin-top: 4px;
		color: var(--gold);
	}

	.cta {
		display: grid;
		justify-items: center;
		gap: var(--space-4);
		margin-top: clamp(var(--space-8), 5vw, 56px);
		text-align: center;
	}

	.big {
		min-height: 56px;
		padding-inline: var(--space-8);
		font-size: 17px;
	}

	/* Request form */
	.sheet {
		width: min(640px, calc(100vw - 24px));
		max-width: none;
		max-height: calc(100svh - 24px);
		padding: 0;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--white);
		color: var(--text-body);
		box-shadow: 0 40px 100px rgb(0 0 0 / 0.5);
	}

	.sheet::backdrop {
		background: rgb(6 11 26 / 0.72);
		backdrop-filter: blur(4px);
	}

	.sheet-inner {
		position: relative;
		display: grid;
		gap: var(--space-6);
		padding: clamp(var(--space-6), 4vw, 40px);
	}

	.sheet header {
		display: grid;
		gap: var(--space-2);
		padding-right: var(--space-8);
	}

	.sheet h2 {
		font: var(--text-h3);
		font-size: clamp(24px, 3vw, 30px);
	}

	.sheet header p {
		color: var(--text-supporting);
	}

	.close {
		position: absolute;
		top: var(--space-4);
		right: var(--space-4);
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: var(--mist);
		color: var(--charcoal);
		cursor: pointer;
	}

	form {
		display: grid;
		gap: var(--space-6);
	}

	fieldset {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	.label {
		padding: 0;
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.req {
		color: var(--gold-ink);
	}

	.options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-2);
		outline: none;
	}

	.option {
		position: relative;
		display: grid;
		gap: 2px;
		padding: var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.option input {
		position: absolute;
		opacity: 0;
	}

	.option:has(input:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.option.selected {
		border-color: var(--ink);
		background: var(--gold-tint);
		box-shadow: inset 0 0 0 1px var(--ink);
	}

	.option .name {
		font-weight: 600;
		font-size: 14px;
		color: var(--charcoal);
	}

	.option .amt {
		font-size: 13px;
		color: var(--gold-ink);
	}

	.row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6);
	}

	.field-error {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--text-caption);
		color: var(--danger);
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

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	.sent {
		display: grid;
		justify-items: center;
		gap: var(--space-4);
		padding-block: var(--space-6);
		text-align: center;
	}

	.sent-icon {
		color: var(--success);
	}

	.sheet :global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 960px) {
		.tiers {
			grid-template-columns: minmax(0, 480px);
			justify-content: center;
		}
	}

	@media (max-width: 560px) {
		.row,
		.options {
			grid-template-columns: minmax(0, 1fr);
		}

		.actions {
			flex-direction: column-reverse;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}
</style>
