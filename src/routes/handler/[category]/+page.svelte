<script lang="ts">
	import { untrack } from 'svelte';
	import { ArrowLeft, ScanQrCode } from '@lucide/svelte';
	import CategoryIcon from '#lib/components/ops/CategoryIcon.svelte';
	import { unlockAudio } from '#lib/ops/feedback.ts';

	let { data } = $props();

	const desk = $derived(data.desk);
	let sessionId = $state(untrack(() => data.desk.currentSessionId));
	let mealId = $state(untrack(() => data.desk.currentMealId));

	const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
	const clock = (iso: string | null) => (iso ? time.format(new Date(iso)) : '');

	const scanHref = $derived.by(() => {
		const q = new URLSearchParams();
		if (desk.multiEvent) q.set('event', desk.eventId);
		if (desk.category === 'hall' && sessionId) q.set('session', sessionId);
		if (desk.category === 'food' && mealId) q.set('meal', mealId);
		const s = q.toString();
		return `/handler/${desk.category}/scan${s ? `?${s}` : ''}`;
	});

	const needsChoice = $derived(
		(desk.category === 'hall' && !sessionId && desk.sessions.length > 0) || (desk.category === 'food' && !mealId && desk.meals.length > 0)
	);
	const nothingToServe = $derived(
		(desk.category === 'hall' && desk.sessions.length === 0) || (desk.category === 'food' && desk.meals.length === 0)
	);

	const context = $derived([desk.gateName, desk.hall, desk.counterName].filter(Boolean).join(' · '));
	const RESULT_LABEL = { success: 'Done', duplicate: 'Duplicate', rejected: 'Rejected' } as const;
</script>

<svelte:head>
	<title>{data.info.label} · Event handler · Midtown Business Conclave</title>
</svelte:head>

<main class="ops-wrap">
	{#if data.otherDesks}
		<a class="back" href="/handler"><ArrowLeft size={18} aria-hidden="true" /> All my desks</a>
	{/if}

	<header class="head">
		<span class="badge"><CategoryIcon category={desk.category} size={26} /></span>
		<div>
			<span class="ops-eyebrow">{desk.eventName}</span>
			<h1 class="ops-title">{data.info.title}</h1>
			{#if context}<p class="ops-sub">{context}</p>{/if}
		</div>
	</header>

	{#if desk.category === 'hall' && desk.sessions.length > 1}
		<section class="ops-card" aria-labelledby="pick-session">
			<h2 id="pick-session" class="pick">Session</h2>
			<div class="ops-chips">
				{#each desk.sessions as s (s.id)}
					<button type="button" class="ops-chip" aria-pressed={sessionId === s.id} onclick={() => (sessionId = s.id)}>
						<span>{s.title}<small>{s.hall} · {clock(s.startsAt)} – {clock(s.endsAt)}</small></span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if desk.category === 'food' && desk.meals.length > 1}
		<section class="ops-card" aria-labelledby="pick-meal">
			<h2 id="pick-meal" class="pick">Meal</h2>
			<div class="ops-chips">
				{#each desk.meals as m (m.id)}
					<button type="button" class="ops-chip" aria-pressed={mealId === m.id} onclick={() => (mealId = m.id)}>
						<span>{m.name}{#if m.startsAt && m.endsAt}<small>{clock(m.startsAt)} – {clock(m.endsAt)}</small>{/if}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if nothingToServe}
		<div class="ops-banner warn" role="status">
			<p>
				{desk.category === 'hall' ? 'No session is set up for your hall yet.' : 'No meal is open at your counter.'} Ask the event
				administrator.
			</p>
		</div>
	{:else}
		<a
			class="ops-big-btn"
			href={needsChoice ? undefined : scanHref}
			aria-disabled={needsChoice}
			onclick={unlockAudio}
			data-sveltekit-preload-data="tap"
		>
			<ScanQrCode size={30} aria-hidden="true" />
			START SCANNING
		</a>
		{#if needsChoice}<p class="ops-sub center">Choose the {desk.category === 'hall' ? 'session' : 'meal'} first.</p>{/if}
	{/if}

	<section class="ops-card" aria-labelledby="today">
		<h2 id="today" class="pick">Today’s activity</h2>
		<div class="ops-tiles">
			<div class="ops-tile success"><strong>{data.today.success}</strong><span>Successful</span></div>
			<div class="ops-tile duplicate"><strong>{data.today.duplicate}</strong><span>Duplicates</span></div>
			<div class="ops-tile rejected"><strong>{data.today.rejected}</strong><span>Rejected</span></div>
		</div>
	</section>

	<section class="ops-card" aria-labelledby="recent">
		<h2 id="recent" class="pick">Recent activity</h2>
		{#if data.recent.length === 0}
			<p class="ops-sub">Nothing scanned yet.</p>
		{:else}
			<ul class="ops-list">
				{#each data.recent as r (r.id)}
					<li>
						<strong>{r.name ?? 'Unknown pass'}</strong>
						<span class="ops-pill {r.result}">{RESULT_LABEL[r.result]}</span>
						<span class="ops-meta">{clock(r.at)} · {r.title}{r.code ? ` · ${r.code}` : ''}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
		color: var(--text-body);
		font: var(--text-ui);
		text-decoration: none;
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.badge {
		display: grid;
		place-items: center;
		flex: none;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-md);
		background: var(--ink);
		color: var(--gold);
	}

	.pick {
		font: 600 16px/1.3 var(--font-sans);
		color: var(--charcoal);
	}

	.center {
		text-align: center;
	}

	:global(.ops-big-btn[aria-disabled='true']) {
		opacity: 0.45;
		pointer-events: none;
	}
</style>
