<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert, CircleCheck, Clock, ImageUp, LoaderCircle, MapPin, Send, Trophy, X } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { AWARD_CATEGORIES, AWARD_LIMITS, MAX_LOGO_BYTES, TEAM_SIZES, validateAwardApplication, type AwardErrors, type AwardField } from '#lib/awards.ts';
	import { EVENT, SITE_URL } from '#lib/event.ts';
	import { formatPhone } from '#lib/registration.ts';

	const PARTNERS = [
		{ role: 'AI Technology Partner', name: 'ITK', src: '/poster/itk.webp' },
		{ role: 'Associate Sponsor', name: 'Namma Office', src: '/poster/namma-office.webp' },
		{ role: 'Associate Sponsor', name: 'SolarQube Energy', src: '/poster/solarqube.webp' },
		{ role: 'Startup Ecosystem Partner', name: 'StartupTN', src: '/poster/startuptn.webp' },
		{ role: 'Technology Partner', name: 'SymphoZen Labs', src: '/poster/symphozen-labs.webp' }
	];

	let view = $state<'poster' | 'form' | 'done'>('poster');
	let open = $state(true);

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
	<title>Midtown Business Awards 2026 · Apply</title>
	<meta name="description" content="Apply for the Midtown Business Awards 2026, presented at the {EVENT.name} in {EVENT.venue} on {EVENT.dateLabel}. Free to apply." />
	<meta property="og:title" content="Midtown Business Awards 2026" />
	<meta property="og:description" content="Honouring the businesses that make Tamil Nadu grow. Free to apply." />
	<meta property="og:image" content="/poster/mbc.webp" />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="page on-ink">
	{#if view === 'poster'}
		<main class="stage">
			<article class="poster">
				<span class="corner tl" aria-hidden="true"></span><span class="corner tr" aria-hidden="true"></span>
				<span class="corner bl" aria-hidden="true"></span><span class="corner br" aria-hidden="true"></span>

				<div class="presenters">
					<div><span>Presented by</span><img src="/poster/me.webp" alt="Midtown Events" /></div>
				</div>

				<div class="arch" aria-hidden="true">
					<span class="rays"></span>
					<span class="medal"><Trophy size={64} strokeWidth={1.25} /></span>
				</div>

				<p class="kicker">Midtown Business Conclave</p>
				<h1>Midtown Business <em>Awards</em> <span>2026</span></h1>
				<p class="tagline">Honouring the entrepreneurs and businesses who make Tamil Nadu grow.</p>

				<ul class="facts">
					<li><CalendarDays size={18} aria-hidden="true" /><span><small>Date</small>{EVENT.compactDate}</span></li>
					<li><Clock size={18} aria-hidden="true" /><span><small>Time</small>{EVENT.compactTime}</span></li>
					<li><MapPin size={18} aria-hidden="true" /><span><small>Venue</small>{EVENT.venue}</span></li>
				</ul>

				{#if open}
					<button type="button" class="cta" onclick={apply}>
						<Trophy size={20} aria-hidden="true" /> Apply for Business Awards <ArrowRight size={18} aria-hidden="true" />
					</button>
					<p class="free">Free to apply · Takes about five minutes</p>
				{:else}
					<p class="closed" role="status">Applications for the awards are now closed. Thank you for your interest.</p>
				{/if}

				<p class="at">Presented at the <a href={SITE_URL}>{EVENT.name}</a></p>
			</article>

			<section class="below" aria-labelledby="categories-title">
				<span class="eyebrow">Award categories</span>
				<h2 id="categories-title">Every industry has its <em>leaders</em></h2>
				<ul class="cats">
					{#each AWARD_CATEGORIES as c (c.id)}
						<li><strong>{c.name}</strong><span>{c.id === 'others' ? 'Your business category, in your words' : c.hint}</span></li>
					{/each}
				</ul>
			</section>

			<section class="below" aria-labelledby="partners-title">
				<span class="eyebrow">Sponsors &amp; partners</span>
				<h2 id="partners-title">The partners behind the <em>conclave</em></h2>
				<ul class="logos">
					{#each PARTNERS as p (p.name)}
						<li><span>{p.role}</span><div class="plate"><img src={p.src} alt={p.name} loading="lazy" /></div></li>
					{/each}
				</ul>
			</section>
		</main>
	{:else if view === 'form'}
		<main class="form-stage">
			<button type="button" class="back" onclick={backToPoster}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
			<header class="form-head">
				<span class="eyebrow">Midtown Business Awards 2026</span>
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

					<div class="group" class:group-error={!!errors.categoryId} role="radiogroup" aria-labelledby="category-label">
						<span class="group-label" id="category-label">Business category <span class="req" aria-hidden="true">*</span></span>
						<div class="chips">
							{#each AWARD_CATEGORIES as c (c.id)}
								<label class="chip" class:on={categoryId === c.id}>
									<input type="radio" name="categoryId" value={c.id} bind:group={categoryId} onchange={() => recheck('categoryId')} />
									{c.name}
								</label>
							{/each}
						</div>
						{#if errors.categoryId}<p class="err"><CircleAlert size={16} aria-hidden="true" />{errors.categoryId}</p>{/if}
					</div>

					{#if categoryId === 'others'}
						<TextField id="otherCategory" label="Your business category" required bind:value={otherCategory} error={errors.otherCategory} placeholder="e.g. Food processing" maxlength={AWARD_LIMITS.otherCategory} oninput={() => recheck('otherCategory')} />
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
				<a class="btn btn-primary" href={SITE_URL}>Visit the Conclave website</a>
			</div>
		</main>
	{/if}

	<footer class="foot">
		<span>© 2026 Midtown Events</span>
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

	/* The poster ------------------------------------------------------------ */
	.poster {
		position: relative;
		display: grid;
		justify-items: center;
		gap: var(--space-4);
		width: min(100%, 620px);
		padding: clamp(28px, 6vw, 52px) clamp(20px, 5vw, 48px);
		border-radius: 18px;
		text-align: center;
		background:
			radial-gradient(70% 34% at 50% 25%, rgb(255 190 90 / 0.28), transparent 72%),
			linear-gradient(180deg, #0b1430, #050812);
		isolation: isolate;
		overflow: hidden;
		box-shadow:
			inset 0 0 0 1px var(--gold-line),
			inset 0 0 0 7px #070c1c,
			inset 0 0 0 8px rgb(227 176 75 / 0.6),
			0 40px 90px rgb(0 0 0 / 0.6);
	}

	/* A soft gold sunburst behind the trophy, echoing the conclave's hero. */
	.poster::before {
		content: '';
		position: absolute;
		top: 214px;
		left: 50%;
		z-index: -1;
		width: 760px;
		height: 760px;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		background: repeating-conic-gradient(rgb(245 207 119 / 0.09) 0 3deg, transparent 3deg 12deg);
		box-shadow:
			inset 0 0 0 1px rgb(227 176 75 / 0.14),
			inset 0 0 0 34px rgb(5 8 18 / 0.18);
		-webkit-mask-image: radial-gradient(circle, #000 18%, transparent 68%);
		mask-image: radial-gradient(circle, #000 18%, transparent 68%);
	}

	.corner {
		position: absolute;
		width: 26px;
		height: 26px;
		border: 2px solid var(--gold);
	}
	.tl { top: 16px; left: 16px; border-right: 0; border-bottom: 0; }
	.tr { top: 16px; right: 16px; border-left: 0; border-bottom: 0; }
	.bl { bottom: 16px; left: 16px; border-right: 0; border-top: 0; }
	.br { bottom: 16px; right: 16px; border-left: 0; border-top: 0; }

	.presenters {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
	}

	.presenters div {
		display: grid;
		justify-items: center;
		gap: 6px;
	}

	.presenters span {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--on-ink-soft);
	}

	.presenters img {
		height: 52px;
		width: auto;
		max-width: 180px;
		object-fit: contain;
	}

	.arch {
		position: relative;
		display: grid;
		place-items: center;
		width: 148px;
		height: 172px;
		margin-top: var(--space-2);
		border-radius: 74px 74px 10px 10px;
		background: linear-gradient(180deg, #f5cf77, #a8741f 62%, #5e3e10);
		box-shadow:
			0 0 0 2px #070c1c,
			0 0 0 3px var(--gold),
			0 0 54px rgb(255 180 80 / 0.5);
		overflow: hidden;
	}

	.rays {
		position: absolute;
		inset: -40%;
		background: repeating-conic-gradient(from 0deg at 50% 50%, rgb(255 255 255 / 0.2) 0 8deg, transparent 8deg 22deg);
	}

	.medal {
		position: relative;
		color: #2a1b05;
		filter: drop-shadow(0 2px 0 rgb(255 240 200 / 0.6));
	}

	.kicker {
		margin-top: var(--space-2);
		font: var(--text-eyebrow);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.poster h1 {
		font: 500 clamp(36px, 8vw, 60px) / 1.04 var(--font-display);
		color: var(--on-ink);
	}

	.poster h1 em,
	.below h2 em {
		font-style: italic;
		background: linear-gradient(100deg, var(--gold-bright), var(--gold) 45%, var(--gold-deep));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.06em;
	}

	.poster h1 span {
		display: block;
		margin-top: 6px;
		font-size: 0.62em;
		color: var(--gold-bright);
	}

	.tagline {
		max-width: 420px;
		color: var(--on-ink-soft);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		width: 100%;
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
		border-block: 1px solid var(--gold-line);
	}

	.facts li {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 6px;
		color: var(--on-ink);
		font-size: 13px;
		text-align: left;
	}

	.facts li + li {
		border-left: 1px solid var(--gold-line);
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

	.closed {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--gold-line);
		border-radius: var(--radius-sm);
		color: var(--on-ink);
	}

	.at {
		font: var(--text-caption);
	}

	.at a {
		color: var(--gold-bright);
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

	.cats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-3);
		width: 100%;
		margin: var(--space-4) 0 0;
		padding: 0;
		list-style: none;
	}

	.cats li {
		display: grid;
		align-content: start;
		gap: 4px;
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.025));
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.22);
		text-align: left;
	}

	.cats strong {
		font-weight: 600;
		color: var(--on-ink);
	}

	.cats span {
		font: var(--text-caption);
	}

	.logos {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-4);
		margin: var(--space-4) 0 0;
		padding: 0;
		list-style: none;
	}

	.logos li {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		width: 184px;
	}

	.logos span {
		font-size: 11px;
		color: var(--gold);
	}

	.plate {
		display: grid;
		place-items: center;
		width: 100%;
		height: 84px;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: #fff;
	}

	.plate img {
		max-width: 100%;
		max-height: 58px;
		object-fit: contain;
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

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--space-4);
		border: 1px solid var(--rule-strong, #b9b5a6);
		border-radius: 999px;
		color: var(--charcoal);
		font: var(--text-ui);
		font-size: 15px;
		cursor: pointer;
	}

	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}

	.chip.on {
		border-color: var(--gold-ink);
		background: var(--gold-tint);
		box-shadow: inset 0 0 0 1px var(--gold-ink);
	}

	.chip:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
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
		.cats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}

		.facts {
			grid-template-columns: minmax(0, 1fr);
		}

		.facts li {
			justify-content: flex-start;
			padding-inline: var(--space-3);
		}

		.facts li + li {
			border-left: 0;
			border-top: 1px solid var(--gold-line);
		}

		/* Keeps the last line clear of the bottom corner marks. */
		.poster {
			padding-bottom: 56px;
		}

		.poster .cta {
			width: 100%;
			padding-inline: var(--space-3);
			font-size: 16px;
		}

		.cats {
			grid-template-columns: minmax(0, 1fr);
		}

		.logos li {
			width: calc(50% - var(--space-2));
		}
	}
</style>
