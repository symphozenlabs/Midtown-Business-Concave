<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert, CircleCheck, Clock, ImageUp, LoaderCircle, MapPin, Phone, Send, Trophy, X } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { AWARDS_EVENT, AWARD_CATEGORIES, AWARD_LIMITS, MAX_LOGO_BYTES, TEAM_SIZES, validateAwardApplication, type AwardErrors, type AwardField } from '#lib/awards.ts';
	import { formatPhone } from '#lib/registration.ts';

	const LISTED_CATEGORIES = AWARD_CATEGORIES.filter((c) => c.id !== 'others');

	let view = $state<'poster' | 'form' | 'done'>('poster');
	let open = $state(true);
	let closesAt = $state<string | null>(null);
	const closeFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

	let fullName = $state('');
	let designation = $state('');
	let email = $state('');
	let phone = $state('');
	let city = $state('');
	let businessName = $state('');
	let categoryId = $state('');
	let otherCategory = $state('');
	let yearStarted = $state('');
	let teamSize = $state('');
	let website = $state('');
	let about = $state('');
	let achievements = $state('');
	let declared = $state(false);

	let logo = $state<File | null>(null);
	let logoUrl = $state<string | null>(null);
	let logoError = $state<string | null>(null);
	let logoInput = $state<HTMLInputElement | null>(null);

	let errors = $state<AwardErrors>({});
	let formError = $state<string | null>(null);
	let busy = $state(false);
	let code = $state('');
	let sentTo = $state('');
	let formEl = $state<HTMLFormElement | null>(null);

	onMount(() => {
		fetch('/api/awards')
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (d && typeof d.open === 'boolean') open = d.open;
				closesAt = typeof d?.closesAt === 'string' ? d.closesAt : null;
			})
			.catch(() => {});
		return () => {
			if (logoUrl) URL.revokeObjectURL(logoUrl);
		};
	});

	const input = () => ({
		fullName,
		designation,
		email,
		phone,
		city,
		businessName,
		categoryId,
		otherCategory,
		yearStarted,
		teamSize,
		website,
		about,
		achievements,
		declared
	});

	/** After the first mistake is shown, a field clears as soon as it is right. */
	function recheck(key: AwardField) {
		if (!errors[key]) return;
		const next = validateAwardApplication(input());
		errors = { ...errors, [key]: next[key] };
	}

	async function apply() {
		view = 'form';
		await tick();
		window.scrollTo({ top: 0 });
		document.getElementById('apply-title')?.focus();
	}

	async function backToPoster() {
		view = 'poster';
		await tick();
		window.scrollTo({ top: 0 });
	}

	function chooseLogo(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		logoError = null;
		if (!file) return;
		if (file.size > MAX_LOGO_BYTES) return failLogo('Choose a logo under 3 MB.');
		if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return failLogo('Use a JPG, PNG or WebP image.');
		if (logoUrl) URL.revokeObjectURL(logoUrl);
		logo = file;
		logoUrl = URL.createObjectURL(file);
	}

	function failLogo(message: string) {
		logoError = message;
		if (logoInput) logoInput.value = '';
	}

	function removeLogo() {
		if (logoUrl) URL.revokeObjectURL(logoUrl);
		logo = null;
		logoUrl = null;
		logoError = null;
		if (logoInput) logoInput.value = '';
	}

	async function focusFirstError() {
		await tick();
		const el = formEl?.querySelector<HTMLElement>('[aria-invalid="true"], .group-error');
		el?.scrollIntoView({ block: 'center' });
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		formError = null;
		errors = validateAwardApplication(input());
		if (Object.keys(errors).length) {
			formError = 'Please check the highlighted fields.';
			return focusFirstError();
		}
		busy = true;
		try {
			const body = new FormData();
			for (const [k, v] of Object.entries(input())) body.set(k, String(v));
			if (logo) body.set('logo', logo);
			const res = await fetch('/api/awards', { method: 'POST', body });
			const data = await res.json().catch(() => null);
			if (res.ok && data?.ok) {
				code = data.code;
				sentTo = data.email;
				view = 'done';
				await tick();
				window.scrollTo({ top: 0 });
				return;
			}
			if (data?.closed) open = false;
			if (data?.errors?.logo) logoError = data.errors.logo;
			if (data?.errors) errors = data.errors;
			formError = data?.message ?? 'We could not send your application. Please try again.';
			await focusFirstError();
		} catch {
			formError = 'Your connection dropped. Nothing was lost, so press Submit again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{AWARDS_EVENT.name} · Apply</title>
	<meta name="description" content="Nominate your company for the {AWARDS_EVENT.name}, presented by the {AWARDS_EVENT.presenter}. {AWARDS_EVENT.date}, {AWARDS_EVENT.time}, {AWARDS_EVENT.venue}. Free to apply." />
	<meta property="og:title" content={AWARDS_EVENT.name} />
	<meta property="og:description" content="Nominate your company now. {AWARDS_EVENT.date}, {AWARDS_EVENT.time}, {AWARDS_EVENT.venue}." />
	<meta property="og:image" content="https://awards.midtownevents.in{AWARDS_EVENT.poster}" />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="page on-ink">
	{#if view === 'poster'}
		<main class="stage">
			<section class="hero">
				<img
					class="poster-img"
					src={AWARDS_EVENT.poster}
					width="1199"
					height="1312"
					fetchpriority="high"
					alt="{AWARDS_EVENT.presenter} presents the {AWARDS_EVENT.name}. November 28th, 4 pm onwards, {AWARDS_EVENT.venue}. Nominate your company now. Enquiries {AWARDS_EVENT.phone}."
				/>
				<div class="intro">
					<p class="kicker">{AWARDS_EVENT.presenter} presents</p>
					<h1>Salem Entrepreneurs <em>Awards</em></h1>
					<p class="tagline">Nominate your company and be recognised among the entrepreneurs who make Salem grow.</p>

					<ul class="facts">
						<li><CalendarDays size={18} aria-hidden="true" /><span><small>Date</small>{AWARDS_EVENT.date}</span></li>
						<li><Clock size={18} aria-hidden="true" /><span><small>Time</small>{AWARDS_EVENT.time}</span></li>
						<li><MapPin size={18} aria-hidden="true" /><span><small>Venue</small>{AWARDS_EVENT.venue}</span></li>
						<li><Phone size={18} aria-hidden="true" /><span><small>Enquiries</small><a href="tel:+91{AWARDS_EVENT.phone}">{AWARDS_EVENT.phone}</a></span></li>
					</ul>

					{#if open}
						<button type="button" class="cta" onclick={apply}>
							<Trophy size={20} aria-hidden="true" /> Apply for Business Awards <ArrowRight size={18} aria-hidden="true" />
						</button>
						<p class="free">Free to apply · Takes about five minutes</p>
						{#if closesAt}<p class="deadline" role="status">Applications close on <strong>{closeFormat.format(new Date(closesAt))}</strong></p>{/if}
					{:else}
						<p class="closed" role="status">Applications for the awards are now closed. Thank you for your interest.</p>
					{/if}
				</div>
			</section>

			<section class="below" aria-labelledby="categories-title">
				<span class="eyebrow">Award categories</span>
				<h2 id="categories-title">Every industry has its <em>leaders</em></h2>
				<p class="cats-lead">Open to {LISTED_CATEGORIES.length} business categories, or write your own when you apply.</p>
				<details class="cats-more">
					<summary>View all categories</summary>
					<ul class="cats">
						{#each LISTED_CATEGORIES as c (c.id)}<li>{c.name}</li>{/each}
					</ul>
				</details>
			</section>
		</main>
	{:else if view === 'form'}
		<main class="form-stage">
			<button type="button" class="back" onclick={backToPoster}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
			<header class="form-head">
				<span class="eyebrow">{AWARDS_EVENT.name}</span>
				<h1 id="apply-title" tabindex="-1">Apply for Business Awards</h1>
				<p>Tell us about you and your business. Fields marked * are required.</p>
			</header>

			<form class="sheet" novalidate onsubmit={submit} bind:this={formEl}>
				<fieldset>
					<legend><b>1</b> Your details</legend>
					<div class="row">
						<TextField id="fullName" label="Full name" required bind:value={fullName} error={errors.fullName} autocomplete="name" maxlength={AWARD_LIMITS.fullName} oninput={() => recheck('fullName')} />
						<TextField id="designation" label="Designation" required bind:value={designation} error={errors.designation} placeholder="Founder, Managing Director…" autocomplete="organization-title" maxlength={AWARD_LIMITS.designation} oninput={() => recheck('designation')} />
					</div>
					<div class="row">
						<TextField id="email" label="Email" type="email" required bind:value={email} error={errors.email} autocomplete="email" inputmode="email" placeholder="name@company.com" maxlength={AWARD_LIMITS.email} oninput={() => recheck('email')} />
						<TextField id="phone" label="Mobile / WhatsApp" type="tel" required prefix="+91" bind:value={phone} error={errors.phone} autocomplete="tel-national" inputmode="numeric" placeholder="98765 43210" maxlength={14} oninput={(v) => { phone = formatPhone(v); recheck('phone'); }} />
					</div>
					<TextField id="city" label="City" required bind:value={city} error={errors.city} autocomplete="address-level2" placeholder="Salem" maxlength={AWARD_LIMITS.city} oninput={() => recheck('city')} />
				</fieldset>

				<fieldset>
					<legend><b>2</b> Your business</legend>
					<TextField id="businessName" label="Business name" required bind:value={businessName} error={errors.businessName} autocomplete="organization" maxlength={AWARD_LIMITS.businessName} oninput={() => recheck('businessName')} />

					<div class="group">
						<label class="group-label" for="categoryId">Business category <span class="req" aria-hidden="true">*</span></label>
						<select id="categoryId" bind:value={categoryId} aria-invalid={errors.categoryId ? 'true' : undefined} onchange={() => recheck('categoryId')}>
							<option value="" disabled>Choose your category</option>
							{#each AWARD_CATEGORIES as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
						</select>
						{#if errors.categoryId}<p class="err"><CircleAlert size={16} aria-hidden="true" />{errors.categoryId}</p>{/if}
					</div>

					{#if categoryId === 'others'}
						<TextField id="otherCategory" label="Write your category" required bind:value={otherCategory} error={errors.otherCategory} placeholder="e.g. Food processing" maxlength={AWARD_LIMITS.otherCategory} oninput={() => recheck('otherCategory')} />
					{/if}

					<div class="row">
						<TextField id="yearStarted" label="Year started" required bind:value={yearStarted} error={errors.yearStarted} inputmode="numeric" placeholder="2015" maxlength={4} oninput={() => recheck('yearStarted')} />
						<div class="group" class:group-error={!!errors.teamSize}>
							<label class="group-label" for="teamSize">Team size <span class="req" aria-hidden="true">*</span></label>
							<select id="teamSize" bind:value={teamSize} aria-invalid={errors.teamSize ? 'true' : undefined} onchange={() => recheck('teamSize')}>
								<option value="" disabled>Choose</option>
								{#each TEAM_SIZES as t (t)}<option value={t}>{t} people</option>{/each}
							</select>
							{#if errors.teamSize}<p class="err"><CircleAlert size={16} aria-hidden="true" />{errors.teamSize}</p>{/if}
						</div>
					</div>

					<TextField id="website" label="Website or social page" bind:value={website} error={errors.website} inputmode="url" placeholder="www.yourbusiness.com" maxlength={AWARD_LIMITS.website} oninput={() => recheck('website')} />

					<div class="group">
						<span class="group-label">Business logo <span class="opt">Optional</span></span>
						{#if logoUrl}
							<div class="logo-row">
								<img src={logoUrl} alt="Your logo preview" />
								<span>{logo?.name}</span>
								<button type="button" class="icon" onclick={removeLogo} aria-label="Remove logo"><X size={18} aria-hidden="true" /></button>
							</div>
						{:else}
							<label class="upload">
								<input type="file" accept="image/jpeg,image/png,image/webp" bind:this={logoInput} onchange={chooseLogo} />
								<ImageUp size={20} aria-hidden="true" /> Choose a logo <small>JPG, PNG or WebP, up to 3 MB</small>
							</label>
						{/if}
						{#if logoError}<p class="err" role="alert"><CircleAlert size={16} aria-hidden="true" />{logoError}</p>{/if}
					</div>
				</fieldset>

				<fieldset>
					<legend><b>3</b> Your story</legend>
					<TextField id="about" label="What does your business do?" required multiline rows={3} showCount bind:value={about} error={errors.about} maxlength={AWARD_LIMITS.about} oninput={() => recheck('about')} />
					<TextField id="achievements" label="Why does your business deserve this award?" required multiline rows={5} showCount bind:value={achievements} error={errors.achievements} help="Milestones, growth, customers, jobs created, community impact." maxlength={AWARD_LIMITS.achievements} oninput={() => recheck('achievements')} />
				</fieldset>

				<label class="declare" class:group-error={!!errors.declared}>
					<input type="checkbox" bind:checked={declared} aria-invalid={errors.declared ? 'true' : undefined} onchange={() => recheck('declared')} />
					<span>I confirm these details are correct, and that the organisers may contact me about this application.</span>
				</label>
				{#if errors.declared}<p class="err"><CircleAlert size={16} aria-hidden="true" />{errors.declared}</p>{/if}

				{#if formError}<p class="banner" role="alert"><CircleAlert size={18} aria-hidden="true" />{formError}</p>{/if}

				<button type="submit" class="cta solid" disabled={busy || !open}>
					{#if busy}<LoaderCircle size={18} class="spin" aria-hidden="true" /> Sending…{:else}<Send size={18} aria-hidden="true" /> Submit application{/if}
				</button>
			</form>
		</main>
	{:else}
		<main class="form-stage">
			<div class="sheet done" role="status">
				<span class="done-icon"><CircleCheck size={48} strokeWidth={1.5} aria-hidden="true" /></span>
				<h1>Application received</h1>
				<p>Thank you, {fullName.trim().split(/\s+/)[0]}. Your application number is</p>
				<strong class="code">{code}</strong>
				<p>We've sent a confirmation to <b>{sentTo}</b>. The organising team will contact you if you are shortlisted.</p>
				<p>Questions? Call <a href="tel:+91{AWARDS_EVENT.phone}">{AWARDS_EVENT.phone}</a></p>
			</div>
		</main>
	{/if}

	<footer class="foot">
		<span>© 2026 {AWARDS_EVENT.presenter}</span>
		<span>Powered by <a href="https://www.symphozen.com" target="_blank" rel="noopener">SymphoZen Labs</a></span>
	</footer>
</div>

<style>
	.page {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		background:
			radial-gradient(70% 40% at 50% 0%, rgb(255 172 72 / 0.18), transparent 70%),
			linear-gradient(180deg, #060b1c 0%, #04070f 55%, #0a1330 100%);
		color: var(--on-ink-soft);
	}

	.stage {
		flex: 1;
		display: grid;
		justify-items: center;
		gap: clamp(48px, 8vw, 88px);
		padding: clamp(16px, 4vw, 48px) 16px clamp(48px, 7vw, 80px);
	}

	/* The real poster beside the details; stacked on phones. */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		gap: clamp(28px, 5vw, 64px);
		align-items: center;
		width: min(100%, 1120px);
	}

	.poster-img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 14px;
		box-shadow:
			0 0 0 1px var(--gold-line),
			0 34px 80px rgb(0 0 0 / 0.6);
	}

	.intro {
		display: grid;
		justify-items: start;
		gap: var(--space-4);
	}

	.kicker {
		font: var(--text-eyebrow);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.intro h1 {
		font: 500 clamp(38px, 5vw, 62px) / 1.05 var(--font-display);
		color: var(--on-ink);
	}

	.intro h1 em,
	.below h2 em {
		font-style: italic;
		background: linear-gradient(100deg, var(--gold-bright), var(--gold) 45%, var(--gold-deep));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.06em;
	}

	.tagline {
		font: var(--text-lead);
		color: var(--on-ink-soft);
	}

	.facts {
		display: grid;
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--gold-line);
	}

	.facts li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 11px 2px;
		border-bottom: 1px solid var(--gold-line);
		color: var(--on-ink);
		font-size: 15px;
	}

	.facts a {
		color: var(--gold-bright);
	}

	.facts :global(svg) {
		flex: none;
		color: var(--gold);
	}

	.facts small {
		display: block;
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--on-ink-soft);
	}

	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 56px;
		margin-top: var(--space-2);
		padding: 0 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: linear-gradient(100deg, var(--gold-bright), var(--gold) 55%, var(--gold-deep));
		color: #1b1405;
		font: 600 17px/1.2 var(--font-sans);
		box-shadow: 0 10px 34px rgb(227 176 75 / 0.34);
		cursor: pointer;
		transition: filter var(--duration-feedback) var(--ease-out);
	}

	.cta:hover:not(:disabled) {
		filter: brightness(1.07);
	}

	.cta:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.free {
		font: var(--text-caption);
	}

	.deadline {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: rgb(227 176 75 / 0.12);
		color: var(--on-ink);
		font: var(--text-caption);
	}

	.deadline strong {
		color: var(--gold-bright);
	}

	.closed {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--gold-line);
		border-radius: var(--radius-sm);
		color: var(--on-ink);
	}

	/* Below the poster ------------------------------------------------------ */
	.below {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		width: min(100%, 1040px);
		text-align: center;
	}

	.below .eyebrow {
		color: var(--gold);
	}

	.below h2 {
		font: 500 clamp(28px, 3.6vw, 42px) / 1.12 var(--font-display);
		color: var(--on-ink);
	}

	.cats-lead {
		max-width: 560px;
		color: var(--on-ink-soft);
	}

	.cats-more {
		width: 100%;
		margin-top: var(--space-2);
	}

	.cats-more summary {
		width: fit-content;
		margin-inline: auto;
		padding: 10px 20px;
		border-radius: var(--radius-sm);
		box-shadow: inset 0 0 0 1px var(--gold-line);
		color: var(--gold-bright);
		font: var(--text-ui);
		cursor: pointer;
	}

	.cats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2) var(--space-4);
		margin: var(--space-4) 0 0;
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.025));
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.22);
		list-style: none;
		text-align: left;
		font: var(--text-caption);
		color: var(--on-ink);
	}

	/* The form --------------------------------------------------------------- */
	.form-stage {
		flex: 1;
		display: grid;
		align-content: start;
		gap: var(--space-4);
		width: min(100%, 760px);
		margin-inline: auto;
		padding: clamp(16px, 4vw, 40px) 16px clamp(40px, 6vw, 64px);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		justify-self: start;
		min-height: 40px;
		padding: 0 var(--space-2);
		border: 0;
		background: none;
		color: var(--gold-bright);
		font: var(--text-ui);
		cursor: pointer;
	}

	.form-head {
		display: grid;
		gap: var(--space-2);
	}

	.form-head .eyebrow {
		color: var(--gold);
	}

	.form-head h1 {
		font: 500 clamp(30px, 4.6vw, 44px) / 1.12 var(--font-display);
		color: var(--on-ink);
		outline: none;
	}

	.sheet {
		display: grid;
		gap: var(--space-6);
		padding: clamp(20px, 4vw, 40px);
		border-radius: var(--radius-lg);
		background: var(--white);
		color: var(--text-body);
	}

	fieldset {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: var(--space-4);
		font: 500 22px/1.2 var(--font-display);
		color: var(--charcoal);
	}

	legend b {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--gold-tint);
		color: var(--gold-ink);
		font: 600 14px/1 var(--font-sans);
	}

	.row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
		align-items: start;
	}

	.group {
		display: grid;
		gap: var(--space-2);
		align-content: start;
	}

	.group-label {
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.req {
		color: var(--gold-ink);
	}

	.opt {
		margin-left: 6px;
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	select {
		width: 100%;
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		border: 1px solid var(--rule-strong, #8f8b7d);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--charcoal);
		font: 400 16px/1.4 var(--font-sans);
	}

	.err {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--error, #a3261c);
		font: var(--text-caption);
	}

	.upload {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-height: 56px;
		padding: var(--space-2) var(--space-4);
		border: 1px dashed var(--rule-strong, #8f8b7d);
		border-radius: var(--radius-sm);
		color: var(--charcoal);
		font: var(--text-ui);
		cursor: pointer;
	}

	.upload input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.upload small {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.logo-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
	}

	.logo-row img {
		width: 48px;
		height: 48px;
		object-fit: contain;
	}

	.logo-row span {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: var(--text-caption);
	}

	.icon {
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

	.declare {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font: var(--text-caption);
		color: var(--text-body);
		cursor: pointer;
	}

	.declare input {
		flex: none;
		width: 20px;
		height: 20px;
		margin-top: 1px;
		accent-color: var(--gold-ink);
	}

	.banner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: #fdeeec;
		color: var(--error, #a3261c);
		font: var(--text-caption);
	}

	.cta.solid {
		width: 100%;
		margin-top: 0;
	}

	.sheet :global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.done {
		justify-items: center;
		text-align: center;
	}

	.done-icon {
		color: var(--gold-ink);
	}

	.done h1 {
		font: var(--text-h3);
		color: var(--charcoal);
	}

	.code {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
		color: var(--gold-ink);
		font: 600 20px/1.3 ui-monospace, Menlo, monospace;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-4) clamp(16px, 4vw, 40px);
		border-top: 1px solid var(--gold-line);
		font: var(--text-caption);
	}

	.foot a {
		color: var(--gold-bright);
	}

	@media (max-width: 860px) {
		.hero {
			grid-template-columns: minmax(0, 1fr);
			max-width: 560px;
		}

		.cats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}

		.intro .cta {
			width: 100%;
			padding-inline: var(--space-3);
			font-size: 16px;
		}

		.cats {
			grid-template-columns: minmax(0, 1fr);
		}

	}
</style>
