<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import {
		ArrowLeft,
		ArrowRight,
		CircleAlert,
		Handshake,
		History,
		ImageUp,
		ListChecks,
		LoaderCircle,
		Lock,
		Megaphone,
		Pencil,
		Presentation,
		Store
	} from '@lucide/svelte';
	import {
		HEARD_FROM,
		INDUSTRIES,
		INTERESTS,
		LIMITS,
		STEPS,
		emptyDraft,
		formatPhone,
		resolvedCity,
		resolvedIndustry,
		validateField,
		validateStep,
		type FieldKey,
		type Interest
	} from '#lib/registration.ts';
	import { DEFAULT_PAYMENT, formatRupees } from '#lib/payment.ts';
	import { PosterError, renderPosterFile } from '#lib/poster/renderer.ts';
	import {
		SubmitError,
		fetchPaymentDetails,
		submitPayment,
		submitRegistration,
		type PaymentDetails,
		type PendingRegistration
	} from '#lib/submit.ts';
	import { loadSiteConfig, siteConfig } from '#lib/site-config.svelte.ts';
	import { scrollToElement } from '#lib/smooth-scroll.ts';
	import { reveal } from '#lib/actions/reveal.ts';
	import TextField from './TextField.svelte';
	import ChoiceChips from './ChoiceChips.svelte';
	import PhotoField from './PhotoField.svelte';
	import CityPicker from './CityPicker.svelte';
	import PaymentPanel from './PaymentPanel.svelte';
	import PosterCard from './PosterCard.svelte';
	import StepRoute from './StepRoute.svelte';
	import TicketSent from './TicketSent.svelte';

	const DRAFT_KEY = 'mbc-2026-draft';
	const PENDING_KEY = 'mbc-2026-pending';
	const REVIEW = STEPS.findIndex((s) => s.id === 'review');
	const PAYMENT = STEPS.findIndex((s) => s.id === 'payment');

	let draft = $state(emptyDraft());
	let photoBlob = $state<Blob | null>(null);
	let photoUrl = $state<string | null>(null);
	// Photo framing on the poster (poster maker units), saved with the registration.
	let zoom = $state(1);
	let dx = $state(0);
	let dy = $state(0);

	let step = $state(0);
	let reached = $state(0);
	let direction = $state(1);
	let errors = $state<Partial<Record<FieldKey, string>>>({});

	let status = $state<'idle' | 'submitting' | 'paying' | 'done'>('idle');
	let submitError = $state<string | null>(null);
	// Registered, awaiting the UPI payment.
	let pending = $state<PendingRegistration | null>(null);
	let posterUrl = $state<string | null>(null);
	let utrSent = $state('');
	let price = $state(DEFAULT_PAYMENT.priceRupees);

	let panel: HTMLElement;
	let heading = $state<HTMLElement | null>(null);
	let reduceMotion = $state(false);
	// Until hydration the form would fall back to a native GET submit, which
	// would put personal details in the URL; keep it inert until then.
	let ready = $state(false);
	// One poster instance: beside the form on wide screens, inline on narrow ones.
	let narrow = $state(false);
	// Set when details typed in an earlier visit were brought back.
	let restored = $state(false);

	const hasPhoto = $derived(!!photoBlob);
	const done = $derived(status === 'done');

	// Only what appears on the poster: name, photo, designation, company and category.
	const completeness = $derived.by(() => {
		const checks = [
			draft.fullName.trim().length > 1,
			hasPhoto,
			draft.designation.trim().length > 1,
			draft.companyName.trim().length > 1,
			!!resolvedIndustry(draft)
		];
		return Math.round((checks.filter(Boolean).length / checks.length) * 100);
	});

	// Draft survives a reload (never the photo or consent).
	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const query = window.matchMedia('(max-width: 1023px)');
		narrow = query.matches;
		query.addEventListener('change', (e) => (narrow = e.matches));
		ready = true;
		loadSiteConfig().then(() => {
			price = siteConfig.priceRupees;
		});
		try {
			const saved = localStorage.getItem(DRAFT_KEY);
			if (saved) {
				const previous = { ...emptyDraft(), ...JSON.parse(saved), consent: false };
				restored = JSON.stringify(previous) !== JSON.stringify(emptyDraft());
				draft = previous;
			}
			// Registered but not paid yet: go straight back to the payment step.
			const waiting = localStorage.getItem(PENDING_KEY);
			if (waiting) {
				pending = JSON.parse(waiting);
				restored = false;
				step = PAYMENT;
				reached = PAYMENT;
			}
		} catch {
			/* storage unavailable: start fresh */
		}
	});

	function remember(key: string, value: unknown) {
		try {
			if (value == null) localStorage.removeItem(key);
			else localStorage.setItem(key, JSON.stringify(value));
		} catch {
			/* ignore */
		}
	}

	// While the payment step is open, follow fee or UPI changes made on the dashboard
	// after this delegate registered: on arrival, on returning to the tab, and every 30 s.
	const awaitingPayment = $derived(step === PAYMENT && !!pending && status !== 'done');
	$effect(() => {
		if (!awaitingPayment) return;
		const refresh = async () => {
			const current = untrack(() => pending);
			if (!current || document.visibilityState !== 'visible') return;
			const latest = await fetchPaymentDetails(current);
			if (!latest || pending?.code !== current.code) return;
			const same = (Object.keys(latest) as (keyof typeof latest)[]).every((k) => latest[k] === current[k]);
			if (same) return;
			pending = { ...current, ...latest };
			remember(PENDING_KEY, pending);
		};
		refresh();
		const timer = setInterval(refresh, 30_000);
		document.addEventListener('visibilitychange', refresh);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
		};
	});

	$effect(() => {
		const snapshot = JSON.stringify({ ...draft, consent: false });
		if (status === 'done') return;
		try {
			localStorage.setItem(DRAFT_KEY, snapshot);
		} catch {
			/* ignore */
		}
	});

	function check(key: FieldKey) {
		errors[key] = validateField(key, draft, hasPhoto) ?? undefined;
	}

	/** Re-validate as they type only once a field is already showing an error. */
	function recheck(key: FieldKey) {
		if (errors[key]) check(key);
	}

	async function focusFirstError(keys: FieldKey[]) {
		await tick();
		const first = keys.find((k) => errors[k]);
		if (!first) return;
		const el = document.getElementById(`field-${first}`);
		if (el) {
			scrollToElement(el, -120);
			el.focus({ preventScroll: true });
		}
	}

	async function goTo(index: number) {
		direction = index > step ? 1 : -1;
		step = index;
		reached = Math.max(reached, index);
		submitError = null;
		await tick();
		if (panel.getBoundingClientRect().top < 0) scrollToElement(panel, -24);
		heading?.focus({ preventScroll: true });
	}

	function next() {
		const stepErrors = validateStep(step, draft, hasPhoto);
		const keys = STEPS[step].fields;
		for (const key of keys) errors[key] = stepErrors[key];
		if (Object.keys(stepErrors).length) {
			focusFirstError(keys);
			return;
		}
		goTo(step + 1);
	}

	/** Review → register (with the 4K poster) → payment step. */
	async function register() {
		if (status === 'submitting') return;
		for (let i = 0; i < REVIEW; i++) {
			const stepErrors = validateStep(i, draft, hasPhoto);
			if (Object.keys(stepErrors).length) {
				Object.assign(errors, stepErrors);
				await goTo(i);
				focusFirstError(STEPS[i].fields);
				return;
			}
		}

		status = 'submitting';
		submitError = null;
		try {
			const name = draft.fullName.trim();
			const poster = await renderPosterFile({
				name,
				title: draft.designation.trim(),
				company: draft.companyName.trim(),
				category: resolvedIndustry(draft),
				photoUrl,
				zoom,
				dx,
				dy,
				// The card's date strip shows the schedule from Event setup.
				event: (await loadSiteConfig(), siteConfig.event)
			});
			pending = await submitRegistration(draft, photoBlob!, poster, { zoom, dx, dy });
			if (posterUrl) URL.revokeObjectURL(posterUrl);
			posterUrl = URL.createObjectURL(poster);
			remember(PENDING_KEY, pending);
			status = 'idle';
			await goTo(PAYMENT);
		} catch (e) {
			status = 'idle';
			if (!(e instanceof SubmitError)) console.error('[register] failed', e);
			submitError =
				e instanceof SubmitError || e instanceof PosterError
					? e.message
					: 'Something went wrong. Your details are saved — try again.';
		}
	}

	/** A voucher was applied or removed on the payment step: the amount to pay changed. */
	function voucherChanged(details: PaymentDetails) {
		if (!pending) return;
		pending = { ...pending, ...details };
		remember(PENDING_KEY, pending);
	}

	/** Payment step → the delegate reports their UPI transaction ID (null: a voucher covers the fee). */
	async function completePayment(utr: string | null) {
		if (!pending || status === 'paying') return;
		status = 'paying';
		submitError = null;
		try {
			await submitPayment(pending, utr);
			utrSent = utr ?? '';
			status = 'done';
			remember(PENDING_KEY, null);
			remember(DRAFT_KEY, null);
			await tick();
			if (panel.getBoundingClientRect().top < 0) scrollToElement(panel, -24);
		} catch (e) {
			status = 'idle';
			submitError = e instanceof SubmitError ? e.message : 'Something went wrong. Please try again.';
		}
	}

	function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (step < REVIEW) next();
		else if (step === REVIEW) register();
	}

	function clearForm() {
		draft = emptyDraft();
		errors = {};
		restored = false;
		reached = 0;
		goTo(0);
	}

	async function startOver() {
		if (photoUrl) URL.revokeObjectURL(photoUrl);
		if (posterUrl) URL.revokeObjectURL(posterUrl);
		draft = emptyDraft();
		photoBlob = null;
		photoUrl = null;
		posterUrl = null;
		resetFraming();
		errors = {};
		pending = null;
		utrSent = '';
		status = 'idle';
		restored = false;
		reached = 0;
		remember(PENDING_KEY, null);
		await goTo(0);
	}

	function resetFraming() {
		zoom = 1;
		dx = 0;
		dy = 0;
	}

	const interestLabels = $derived(
		INTERESTS.filter((i) => draft.interests.includes(i.value)).map((i) => i.label).join(', ')
	);

	const review = $derived([
		{
			step: 0,
			title: 'About you',
			rows: [
				['Name', draft.fullName.trim()],
				['Email', draft.email.trim()],
				['Mobile', draft.phone ? `+91 ${draft.phone}` : ''],
				['Photo', hasPhoto ? 'Added' : '']
			]
		},
		{
			step: 1,
			title: 'Your business',
			rows: [
				['Company', draft.companyName.trim()],
				['Designation', draft.designation.trim()],
				['Industry', resolvedIndustry(draft)],
				['About the business', draft.about.trim()],
				['Website', draft.website.trim()],
				['LinkedIn', draft.linkedin.trim()]
			]
		},
		{
			step: 2,
			title: 'Your day',
			rows: [
				['Travelling from', resolvedCity(draft)],
				['Interested in', interestLabels],
				['Heard about us', draft.heardFrom]
			]
		}
	]);
	const ticketPrice = $derived(formatRupees(pending?.amountRupees ?? price));

	const industryOptions = INDUSTRIES.map((i) => ({ value: i, label: i }));
	const heardOptions = HEARD_FROM.map((h) => ({ value: h, label: h }));
	const firstName = $derived(draft.fullName.trim().split(/\s+/)[0] ?? '');
</script>

{#snippet interestIcon(value: Interest)}
	{#if value === 'networking'}<Handshake size={18} strokeWidth={1.75} />
	{:else if value === 'private-meetings'}<Lock size={18} strokeWidth={1.75} />
	{:else if value === 'workshops'}<Presentation size={18} strokeWidth={1.75} />
	{:else if value === 'b2b-stalls'}<Store size={18} strokeWidth={1.75} />
	{:else}<Megaphone size={18} strokeWidth={1.75} />{/if}
{/snippet}

{#snippet allInterestsIcon()}<ListChecks size={18} strokeWidth={1.75} />{/snippet}

<section class="register" id="register" aria-labelledby="register-title">
	<div class="container grid">
		<div class="main">
			<header class="intro" use:reveal>
				<span class="eyebrow">Delegate registration</span>
				<h2 id="register-title">Reserve your seat in Salem</h2>
				<p class="lead">
					Five short steps, about three minutes. Your “I am attending” poster builds itself as you go. Once your
					payment is confirmed, we email it to you as your ticket.
				</p>
			</header>

			<div class="panel" bind:this={panel} use:reveal={80}>
				{#if done && pending}
					<div in:fly={{ y: 16, duration: reduceMotion ? 0 : 520, easing: quintOut }}>
						<TicketSent {posterUrl} email={pending.email} code={pending.code} utr={utrSent} onrestart={startOver} />
					</div>
				{:else}
					<StepRoute steps={STEPS} current={step} {reached} onselect={goTo} />

					{#if restored}
						<div class="restored" role="status">
							<History size={18} aria-hidden="true" />
							<p>We brought back the details you entered earlier on this device.</p>
							<button type="button" class="btn btn-ghost clear" onclick={clearForm}>Clear form</button>
						</div>
					{/if}

					{#if step === PAYMENT && pending}
						<div class="step" in:fly={{ x: 20 * direction, duration: reduceMotion ? 0 : 480, easing: quintOut }}>
							<header class="step-head">
								<span class="step-count">Step {step + 1} of {STEPS.length}</span>
								<h3 tabindex="-1" bind:this={heading}>{STEPS[step].title}</h3>
								<p>
									Your registration <strong>{pending.code}</strong> is reserved.
								{pending.voucherCode && pending.amountRupees <= 0
									? 'Your voucher covers the fee, so just complete your registration below.'
									: STEPS[step].intro}
								</p>
							</header>
							<PaymentPanel
								{pending}
								busy={status === 'paying'}
								error={submitError}
								oncomplete={completePayment}
								onvoucher={voucherChanged}
								onback={() => goTo(REVIEW)}
							/>
						</div>
					{:else}
					<form novalidate method="post" onsubmit={onSubmit}>
						{#key step}
							<div
								class="step"
								in:fly={{ x: 20 * direction, duration: reduceMotion ? 0 : 480, easing: quintOut }}
							>
								<header class="step-head">
									<span class="step-count">Step {step + 1} of {STEPS.length}</span>
									<h3 tabindex="-1" bind:this={heading}>{STEPS[step].title}</h3>
									<p>{STEPS[step].intro}</p>
								</header>

								{#if step === 0}
									<div class="fields">
										<TextField
											id="field-fullName"
											label="Full name"
											bind:value={draft.fullName}
											required
											autocomplete="name"
											maxlength={LIMITS.fullName}
											error={errors.fullName}
											onblur={() => check('fullName')}
											oninput={() => recheck('fullName')}
										/>
										<div class="row">
											<TextField
												id="field-email"
												label="Email"
												type="email"
												bind:value={draft.email}
												required
												autocomplete="email"
												inputmode="email"
												placeholder="name@company.com"
												help="We will send event updates here."
												error={errors.email}
												onblur={() => check('email')}
												oninput={() => recheck('email')}
											/>
											<TextField
												id="field-phone"
												label="Mobile / WhatsApp"
												type="tel"
												bind:value={draft.phone}
												required
												autocomplete="tel-national"
												inputmode="numeric"
												prefix="+91"
												placeholder="98765 43210"
												maxlength={11}
												error={errors.phone}
												onblur={() => check('phone')}
												oninput={(v) => {
													draft.phone = formatPhone(v);
													recheck('phone');
												}}
											/>
										</div>
										<PhotoField
											id="field-photo"
											bind:blob={photoBlob}
											bind:url={photoUrl}
											error={errors.photo}
											onchange={() => {
												resetFraming();
												recheck('photo');
											}}
										/>
									</div>
								{:else if step === 1}
									<div class="fields">
										<div class="row">
											<TextField
												id="field-companyName"
												label="Company name"
												bind:value={draft.companyName}
												required
												autocomplete="organization"
												maxlength={LIMITS.companyName}
												error={errors.companyName}
												onblur={() => check('companyName')}
												oninput={() => recheck('companyName')}
											/>
											<TextField
												id="field-designation"
												label="Designation"
												bind:value={draft.designation}
												required
												autocomplete="organization-title"
												placeholder="Founder, Managing Director…"
												maxlength={LIMITS.designation}
												error={errors.designation}
												onblur={() => check('designation')}
												oninput={() => recheck('designation')}
											/>
										</div>
										<ChoiceChips
											id="field-industry"
											legend="Industry"
											options={industryOptions}
											bind:value={draft.industry}
											required
											error={errors.industry}
											onchange={() => recheck('industry')}
										/>
										{#if draft.industry === 'Other'}
											<TextField
												id="field-industryOther"
												label="Your industry"
												bind:value={draft.industryOther}
												required
												maxlength={LIMITS.industry}
												error={errors.industryOther}
												onblur={() => check('industryOther')}
												oninput={() => recheck('industryOther')}
											/>
										{/if}
										<TextField
											id="field-about"
											label="Tell us about your business"
											bind:value={draft.about}
											multiline
											maxlength={LIMITS.about}
											showCount
											placeholder="e.g. We make industrial pumps for textile mills across South India"
											help="One or two lines on what you do. The organisers use this to introduce you to the right people."
											error={errors.about}
											onblur={() => check('about')}
										/>
										<TextField
											id="field-website"
											label="Website"
											type="url"
											bind:value={draft.website}
											autocomplete="url"
											inputmode="url"
											placeholder="yourcompany.com"
											maxlength={LIMITS.website}
											error={errors.website}
											onblur={() => check('website')}
											oninput={() => recheck('website')}
										/>
										<TextField
											id="field-linkedin"
											label="LinkedIn profile"
											type="url"
											bind:value={draft.linkedin}
											autocomplete="url"
											inputmode="url"
											placeholder="linkedin.com/in/yourname"
											help="Shown to delegates who scan your pass, so they can connect with you."
											maxlength={LIMITS.linkedin}
											error={errors.linkedin}
											onblur={() => check('linkedin')}
											oninput={() => recheck('linkedin')}
										/>
									</div>
								{:else if step === 2}
									<div class="fields">
										<CityPicker
											id="field-city"
											bind:value={draft.city}
											bind:other={draft.cityOther}
											error={errors.city}
											otherError={errors.cityOther}
											onchange={() => recheck('city')}
											onOtherBlur={() => check('cityOther')}
										/>
										<ChoiceChips
											id="field-interests"
											legend="What are you interested at the event?"
											help="You can pick more than one."
											options={INTERESTS}
											all={{ label: 'All of the above', description: 'I am interested in everything.', icon: allInterestsIcon }}
											bind:value={draft.interests}
											multiple
											required
											variant="card"
											icon={interestIcon}
											error={errors.interests}
											onchange={() => recheck('interests')}
										/>
										<ChoiceChips
											id="field-heardFrom"
											legend="How did you hear about the conclave?"
											options={heardOptions}
											bind:value={draft.heardFrom}
										/>
										<div class="consents">
											<label class="check" class:invalid={!!errors.consent}>
												<input
													id="field-consent"
													type="checkbox"
													bind:checked={draft.consent}
													aria-describedby={errors.consent ? 'field-consent-error' : undefined}
													onchange={() => recheck('consent')}
												/>
												<span class="box" aria-hidden="true"></span>
												<span>
													I agree that the organisers may contact me about the Midtown Business Conclave and share
													my name, designation and company with other delegates.
													<span class="req" aria-hidden="true">*</span>
												</span>
											</label>
											{#if errors.consent}
												<p class="error" id="field-consent-error">
													<CircleAlert size={16} strokeWidth={2} aria-hidden="true" />{errors.consent}
												</p>
											{/if}
											<label class="check">
												<input type="checkbox" bind:checked={draft.whatsappUpdates} />
												<span class="box" aria-hidden="true"></span>
												<span>Send me event updates on WhatsApp.</span>
											</label>
										</div>
									</div>
								{:else}
									{#if narrow}
										<div class="inline-poster">
											<PosterCard {draft} {photoUrl} bind:zoom bind:dx bind:dy />
										</div>
									{/if}
									<div class="review">
										{#each review as group (group.step)}
											<section class="review-group">
												<div class="review-head">
													<h4>{group.title}</h4>
													<button type="button" class="btn btn-ghost edit" onclick={() => goTo(group.step)}>
														<Pencil size={16} aria-hidden="true" /> Edit <span class="visually-hidden">{group.title}</span>
													</button>
												</div>
												<dl>
													{#each group.rows as [label, value] (label)}
														{#if value}
															<div>
																<dt>{label}</dt>
																<dd>{value}</dd>
															</div>
														{/if}
													{/each}
												</dl>
											</section>
										{/each}
										<div class="ticket">
											<div>
												<strong>Delegate ticket · {ticketPrice}</strong>
												<span>Pay by UPI on the next step. Your ticket is emailed once the payment is confirmed.</span>
											</div>
										</div>
									</div>
								{/if}
							</div>
						{/key}

						{#if submitError}
							<div class="alert" role="alert">
								<CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
								<p>{submitError}</p>
							</div>
						{/if}

						<div class="nav">
							{#if step > 0}
								<button type="button" class="btn btn-ghost" onclick={() => goTo(step - 1)} disabled={status === 'submitting'}>
									<ArrowLeft size={18} aria-hidden="true" /> Back
								</button>
							{/if}
							<button type="submit" class="btn btn-primary submit" disabled={!ready || status === 'submitting'}>
								{#if status === 'submitting'}
									<LoaderCircle size={18} class="spin" aria-hidden="true" /> Preparing your ticket…
								{:else if step === REVIEW}
									Continue to payment · {ticketPrice} <ArrowRight size={18} aria-hidden="true" />
								{:else}
									Continue <ArrowRight size={18} aria-hidden="true" />
								{/if}
							</button>
						</div>
					</form>
					{/if}
				{/if}
			</div>
		</div>

		{#if !narrow}
			<aside class="aside" aria-label="Your “I am attending” poster">
				<div class="sticky" use:reveal={160}>
					{#if (step === PAYMENT || done) && !photoUrl && pending}
						<!-- After a reload the photo is no longer in this browser, but the poster was saved with it. -->
						<div class="poster-saved" role="status">
							<ImageUp size={22} aria-hidden="true" />
							<p>
								<strong>Your poster is saved</strong>
								Your “I am attending” poster, with your photo, was saved with registration
								<span class="mono">{pending.code}</span>. It is emailed to you with your ticket.
							</p>
						</div>
					{:else}
						<PosterCard {draft} {photoUrl} bind:zoom bind:dx bind:dy locked={step === PAYMENT || done} />
					{/if}
					{#if !done && step < PAYMENT}
						<div class="meter" aria-live="polite">
							<p>
								<span>Your poster</span>
								<strong>{completeness}% complete</strong>
							</p>
							<span class="bar" aria-hidden="true"><span style="transform: scaleX({completeness / 100})"></span></span>
						</div>
					{/if}
				</div>
			</aside>
		{/if}
	</div>
</section>

<style>
	.register {
		position: relative;
		padding-block: clamp(var(--section-space-min), 9vw, var(--section-space-max));
		background:
			radial-gradient(60% 40% at 100% 0%, var(--gold-tint), transparent 70%),
			var(--paper);
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
		gap: clamp(var(--space-12), 5vw, 80px);
		align-items: start;
	}

	.main {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-8);
		min-width: 0;
	}

	.intro {
		display: grid;
		gap: var(--space-3);
		max-width: 620px;
	}

	.intro h2 {
		font-size: clamp(32px, 4vw, 48px);
		line-height: 1.12;
	}

	.lead {
		font: var(--text-lead);
		color: var(--text-supporting);
	}

	.panel {
		display: grid;
		gap: var(--space-8);
		padding: clamp(var(--space-6), 4vw, 40px);
		background: var(--white);
		border: 1px solid var(--rule);
		border-radius: var(--radius-lg);
		scroll-margin-top: 24px;
	}

	form {
		display: grid;
		gap: var(--space-8);
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

	.step-head h3 {
		font: var(--text-h3);
		font-size: clamp(26px, 3vw, 32px);
	}

	h3:focus {
		outline: none;
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

	.consents {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-6);
		border-top: 1px solid var(--rule);
	}

	.check {
		position: relative;
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
		color: var(--text-body);
		font-size: 15px;
		line-height: 1.5;
		cursor: pointer;
	}

	.check input {
		position: absolute;
		opacity: 0;
		width: 22px;
		height: 22px;
		margin: 0;
	}

	.box {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		margin-top: 1px;
		border: 1.5px solid var(--control-border);
		border-radius: 5px;
		background: var(--white);
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out);
	}

	.check:hover .box {
		border-color: var(--charcoal);
	}

	.check input:checked + .box {
		background: var(--ink);
		border-color: var(--ink);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e3b04b' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
		background-size: 14px;
		background-position: center;
		background-repeat: no-repeat;
	}

	.check input:focus-visible + .box {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.check.invalid .box {
		border-color: var(--danger);
	}

	.req {
		color: var(--gold-ink);
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding-left: 34px;
		font: var(--text-caption);
		color: var(--danger);
	}

	.error :global(svg) {
		margin-top: 2px;
		flex: none;
	}

	.review {
		display: grid;
		gap: var(--space-6);
	}

	.review-group {
		display: grid;
		gap: var(--space-3);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--rule);
	}

	.review-group:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.review-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	h4 {
		font: 600 15px/1.4 var(--font-sans);
		color: var(--charcoal);
	}

	.edit {
		min-height: 36px;
		font-size: 14px;
		color: var(--gold-ink);
	}

	dl {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
		gap: var(--space-4);
	}

	dt {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	dd {
		margin: 0;
		color: var(--charcoal);
		overflow-wrap: anywhere;
	}

	.restored {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
		color: var(--gold-ink);
	}

	.restored :global(svg) {
		flex: none;
	}

	.restored p {
		flex: 1;
		font: var(--text-caption);
		color: var(--charcoal);
	}

	.clear {
		min-height: 36px;
		font-size: 14px;
		color: var(--gold-ink);
	}

	.ticket {
		display: flex;
		gap: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
		box-shadow: inset 3px 0 0 var(--gold-ink);
	}

	.ticket div {
		display: grid;
		gap: 2px;
	}

	.ticket strong {
		color: var(--charcoal);
	}

	.ticket span {
		font: var(--text-caption);
		color: var(--text-supporting);
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
		align-items: center;
		gap: var(--space-3);
		padding-top: var(--space-6);
		border-top: 1px solid var(--rule);
	}

	.submit {
		margin-left: auto;
		min-width: 180px;
	}

	:global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.inline-poster {
		width: 100%;
		padding-block: var(--space-2) var(--space-4);
	}

	/* Stretch to the form's height so the poster has room to stick while scrolling. */
	.aside {
		min-width: 0;
		align-self: stretch;
	}

	.sticky {
		position: sticky;
		top: 32px;
		display: grid;
		gap: var(--space-4);
	}

	.poster-saved {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-6);
		border-radius: var(--radius-lg);
		background: linear-gradient(180deg, #0c1730, #060b1a);
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.35);
		color: var(--on-ink-soft);
		font-size: 14px;
		line-height: 1.55;
	}

	.poster-saved :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--gold);
	}

	.poster-saved strong {
		display: block;
		margin-bottom: 2px;
		color: var(--on-ink);
		font-size: 15px;
	}

	.poster-saved .mono {
		color: var(--gold);
		letter-spacing: 0.06em;
		white-space: nowrap;
	}

	.meter {
		display: grid;
		gap: var(--space-2);
		max-width: 380px;
		width: 100%;
		margin-inline: auto;
	}

	.meter p {
		display: flex;
		justify-content: space-between;
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.meter strong {
		color: var(--charcoal);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.bar {
		position: relative;
		height: 4px;
		border-radius: 2px;
		background: var(--rule);
		overflow: hidden;
	}

	.bar span {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, var(--gold-ink), var(--gold));
		transform-origin: left;
		transition: transform var(--duration-entrance-min) var(--ease-out);
	}

	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}

		/* Narrow screens show the poster inline (review and confirmation) instead. */
		.aside {
			display: none;
		}
	}

	@media (max-width: 600px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}

		dl div {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}

		/* Full-width primary action on top, the way back below it. */
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
