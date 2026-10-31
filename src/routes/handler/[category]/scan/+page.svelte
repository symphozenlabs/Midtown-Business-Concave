<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		Award,
		CircleCheck,
		CircleX,
		CloudUpload,
		Handshake,
		Keyboard,
		LoaderCircle,
		ScanQrCode,
		Search,
		TriangleAlert,
		Volume2,
		VolumeX,
		X
	} from '@lucide/svelte';
	import QrScanner from '#lib/components/ops/QrScanner.svelte';
	import type { ScanResult } from '#lib/ops/categories.ts';
	import { feedback, loadPrefs, savePrefs, unlockAudio, type DeskPrefs } from '#lib/ops/feedback.ts';
	import { enqueue, flush, queued, type QueuedScan } from '#lib/ops/offline-queue.ts';

	let { data } = $props();

	const desk = $derived(data.desk);
	const back = $derived(`/handler/${desk.category}${desk.multiEvent ? `?event=${desk.eventId}` : ''}`);

	type Phase = 'scanning' | 'working' | 'result';

	let scanner = $state<ReturnType<typeof QrScanner>>();
	let phase = $state<Phase>('scanning');
	let result = $state<ScanResult | null>(null);
	/** What produced the result on screen, for follow-up actions (issue, introduce). */
	let lastScanned = $state('');
	let prefs = $state<DeskPrefs>({ sound: true, autoReturn: 3 });
	let online = $state(true);
	let waiting = $state(0);
	let countdown = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;

	// Networking desk: the first delegate of an introduction, until the second is scanned.
	let introduceFrom = $state<{ scanned: string; name: string } | null>(null);

	// Manual lookup
	let lookupOpen = $state(false);
	let query = $state('');
	let hits = $state<{ code: string; name: string; company: string }[]>([]);
	let searching = $state(false);
	let lookupError = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	// Certificate verification by number
	let certNo = $state('');
	let certAnswer = $state<string | null>(null);

	const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
	const clock = (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '');

	const context = $derived.by(() => {
		if (desk.category === 'hall') {
			const s = desk.sessions.find((x) => x.id === data.sessionId);
			return s ? `${s.hall} · ${s.title}` : 'No session chosen';
		}
		if (desk.category === 'food') {
			const m = desk.meals.find((x) => x.id === data.mealId);
			return [m?.name ?? 'Current meal', desk.counterName].filter(Boolean).join(' · ');
		}
		return [desk.gateName, desk.counterName].filter(Boolean).join(' · ') || desk.eventName;
	});

	/** The result needs a decision from the handler, so it must not clear itself. */
	const hasActions = $derived(
		Boolean(result?.extra?.canIssue && result.code === 'ELIGIBLE') || (desk.category === 'networking' && result?.code === 'PROFILE')
	);

	function clearTimer() {
		if (timer) clearInterval(timer);
		timer = null;
		countdown = 0;
	}

	function show(r: ScanResult) {
		result = r;
		phase = 'result';
		feedback(r.outcome, prefs.sound);
		clearTimer();
		if (prefs.autoReturn > 0 && !hasActions) {
			countdown = prefs.autoReturn;
			timer = setInterval(() => {
				countdown--;
				if (countdown <= 0) next();
			}, 1000);
		}
	}

	function next() {
		clearTimer();
		result = null;
		phase = 'scanning';
		scanner?.reset();
	}

	const networkError = (category: string): ScanResult => ({
		outcome: 'error',
		code: 'NETWORK',
		title: 'NO CONNECTION',
		message:
			category === 'gate' || category === 'food'
				? 'Not recorded. Do not let them through until a scan succeeds.'
				: 'Not recorded. Check the connection and scan again.'
	});

	/** POST with a time limit; one automatic retry with the same scan id. */
	async function post(body: Record<string, unknown>): Promise<Response> {
		for (let attempt = 0; ; attempt++) {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 8000);
			try {
				return await fetch('/api/ops/scan', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body),
					signal: ctrl.signal
				});
			} catch (e) {
				if (attempt >= 1) throw e;
				await new Promise((r) => setTimeout(r, 700));
			} finally {
				clearTimeout(t);
			}
		}
	}

	async function submit(scanned: string, extra: Record<string, unknown> = {}) {
		if (phase === 'working') return;
		phase = 'working';
		lastScanned = scanned;
		const body = {
			category: desk.category,
			eventId: desk.eventId,
			scanned,
			clientScanId: crypto.randomUUID(),
			sessionId: data.sessionId ?? undefined,
			mealId: data.mealId ?? undefined,
			...extra
		};
		try {
			const res = await post(body);
			if (res.status === 401) return goto('/handler/login');
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				show({ outcome: 'error', code: `HTTP_${res.status}`, title: res.status === 403 ? 'NOT ALLOWED' : 'NOT RECORDED', message: payload.message ?? 'Try again.' });
				return;
			}
			show(payload as ScanResult);
		} catch {
			online = navigator.onLine;
			if (desk.category === 'hall' && !extra.action) {
				const saved = enqueue({
					clientScanId: body.clientScanId,
					category: 'hall',
					eventId: desk.eventId,
					scanned,
					sessionId: data.sessionId ?? undefined,
					scannedAt: new Date().toISOString()
				});
				waiting = queued().length;
				show(
					saved
						? { outcome: 'warning', code: 'SAVED_OFFLINE', title: 'SAVED OFFLINE', message: 'Attendance will be sent when the connection is back.' }
						: networkError(desk.category)
				);
			} else {
				show(networkError(desk.category));
			}
		}
	}

	function onscan(text: string) {
		unlockAudio();
		if (phase !== 'scanning') return;
		if (introduceFrom) {
			const from = introduceFrom;
			introduceFrom = null;
			submit(text, { action: 'introduce', withScanned: from.scanned });
			return;
		}
		submit(text);
	}

	async function sync() {
		if (!navigator.onLine || !queued().length) return;
		await flush(async (item: QueuedScan) => {
			try {
				const res = await post({ ...item });
				// Recorded, duplicate or refused for good: done. Signed out, rate-limited or a server error: keep it.
				return res.ok || res.status === 400 || res.status === 403;
			} catch {
				return false;
			}
		});
		waiting = queued().length;
	}

	/* manual lookup */

	function search() {
		if (searchTimer) clearTimeout(searchTimer);
		lookupError = '';
		const q = query.trim();
		if (q.length < 3) {
			hits = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/ops/lookup?category=${desk.category}&q=${encodeURIComponent(q)}`);
				const payload = await res.json();
				if (!res.ok) lookupError = payload.message ?? 'Search failed.';
				hits = payload.results ?? [];
			} catch {
				lookupError = 'No connection.';
			} finally {
				searching = false;
			}
		}, 250);
	}

	function pick(code: string) {
		lookupOpen = false;
		query = '';
		hits = [];
		submit(code);
	}

	async function verifyCertificate(e: SubmitEvent) {
		e.preventDefault();
		certAnswer = null;
		try {
			const res = await fetch(`/api/ops/certificate?no=${encodeURIComponent(certNo)}`);
			const p = await res.json();
			if (!res.ok) certAnswer = p.message;
			else if (!p.found) certAnswer = 'No certificate with that number. It may be forged or mistyped.';
			else certAnswer = `${p.revoked ? 'REVOKED' : 'GENUINE'}: ${p.name}, ${p.company}. Issued ${new Date(p.issuedAt).toLocaleDateString('en-IN')} at ${clock(p.issuedAt)}.`;
		} catch {
			certAnswer = 'No connection.';
		}
	}

	function setPrefs(change: Partial<DeskPrefs>) {
		prefs = { ...prefs, ...change };
		savePrefs(prefs);
	}

	onMount(() => {
		prefs = loadPrefs();
		online = navigator.onLine;
		waiting = queued().length;
		const up = () => {
			online = true;
			sync();
		};
		const down = () => (online = false);
		addEventListener('online', up);
		addEventListener('offline', down);
		sync();
		return () => {
			removeEventListener('online', up);
			removeEventListener('offline', down);
		};
	});

	onDestroy(clearTimer);

	const ICON = { success: CircleCheck, warning: TriangleAlert, error: CircleX };
</script>

<svelte:head>
	<title>Scanning · {data.info.label} · Midtown Business Conclave</title>
</svelte:head>

<main class="ops-wrap desk">
	<div class="bar">
		<a class="ops-icon-btn dark" href={back} aria-label="Back to the desk"><ArrowLeft size={22} aria-hidden="true" /></a>
		<div class="where">
			<strong>{data.info.title}</strong>
			<span>{context}</span>
		</div>
		<button
			type="button"
			class="ops-icon-btn dark"
			aria-pressed={prefs.sound}
			aria-label={prefs.sound ? 'Sound on' : 'Sound off'}
			onclick={() => setPrefs({ sound: !prefs.sound })}
		>
			{#if prefs.sound}<Volume2 size={22} aria-hidden="true" />{:else}<VolumeX size={22} aria-hidden="true" />{/if}
		</button>
	</div>

	{#if !online}
		<div class="ops-banner error" role="alert">
			<TriangleAlert size={18} aria-hidden="true" />
			<p>
				{desk.category === 'hall'
					? 'Offline. Attendance is saved on this phone and sent when the connection is back.'
					: 'Offline. Scans cannot be confirmed: do not let anyone through until you are back online.'}
			</p>
		</div>
	{/if}
	{#if waiting > 0}
		<div class="ops-banner warn" role="status">
			<CloudUpload size={18} aria-hidden="true" />
			<p>{waiting} {waiting === 1 ? 'scan' : 'scans'} waiting to sync.</p>
		</div>
	{/if}
	{#if introduceFrom}
		<div class="ops-banner warn" role="status">
			<Handshake size={18} aria-hidden="true" />
			<p>Introducing <strong>{introduceFrom.name}</strong>: scan the second delegate.</p>
			<button type="button" class="btn btn-ghost ops-btn-sm" onclick={() => (introduceFrom = null)}>Cancel</button>
		</div>
	{/if}

	<QrScanner bind:this={scanner} {onscan} paused={phase !== 'scanning'} />

	<div class="tools">
		<button type="button" class="ops-big-btn secondary" onclick={() => (lookupOpen = !lookupOpen)} aria-expanded={lookupOpen}>
			<Keyboard size={22} aria-hidden="true" /> Manual lookup
		</button>
		<label class="ops-label return">
			Back to scanning
			<select value={prefs.autoReturn} onchange={(e) => setPrefs({ autoReturn: Number(e.currentTarget.value) })}>
				<option value={2}>After 2 seconds</option>
				<option value={3}>After 3 seconds</option>
				<option value={5}>After 5 seconds</option>
				<option value={0}>When I tap Continue</option>
			</select>
		</label>
	</div>

	{#if lookupOpen}
		<section class="ops-card" aria-labelledby="lookup-title">
			<h2 id="lookup-title" class="small-title">Find a delegate</h2>
			<label class="ops-label">
				Name or registration number (MBC-…)
				<input type="search" bind:value={query} oninput={search} autocomplete="off" placeholder="At least 3 letters" />
			</label>
			{#if searching}<p class="ops-muted"><LoaderCircle size={14} class="ops-spin" aria-hidden="true" /> Searching…</p>{/if}
			{#if lookupError}<p class="ops-muted">{lookupError}</p>{/if}
			{#if hits.length}
				<ul class="hits">
					{#each hits as h (h.code)}
						<li>
							<button type="button" onclick={() => pick(h.code)}>
								<strong>{h.name}</strong>
								<span>{h.code} · {h.company}</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim().length >= 3 && !searching && !lookupError}
				<p class="ops-muted">No match.</p>
			{/if}
		</section>
	{/if}

	{#if desk.category === 'certificate'}
		<section class="ops-card" aria-labelledby="verify-title">
			<h2 id="verify-title" class="small-title">Verify a certificate number</h2>
			<form class="verify" onsubmit={verifyCertificate}>
				<label class="ops-label">
					Certificate number
					<input bind:value={certNo} placeholder="MBC26-XXXXXXXX" autocomplete="off" required />
				</label>
				<button type="submit" class="btn btn-primary"><Search size={18} aria-hidden="true" /> Verify</button>
			</form>
			{#if certAnswer}<p class="answer" role="status">{certAnswer}</p>{/if}
		</section>
	{/if}
</main>

{#if phase === 'working'}
	<div class="working" role="status"><LoaderCircle size={44} class="ops-spin" aria-hidden="true" /> Checking…</div>
{/if}

{#if phase === 'result' && result}
	{@const Icon = ICON[result.outcome]}
	<div class="result {result.outcome}" role="alert" aria-live="assertive">
		<div class="result-body">
			<Icon size={64} strokeWidth={2.2} aria-hidden="true" />
			<h2>{result.title}</h2>
			{#if result.participant}
				<p class="name">{result.participant.name}</p>
				<p class="org">{[result.participant.designation, result.participant.company].filter(Boolean).join(', ')} · {result.participant.code}</p>
			{/if}
			<p class="message">{result.message}</p>

			{#if result.facts?.length}
				<dl class="facts">
					{#each result.facts as f (f.label)}
						<div><dt>{f.label}</dt><dd>{f.value}</dd></div>
					{/each}
				</dl>
			{/if}

			{#if Array.isArray(result.extra?.checks)}
				<ul class="checks">
					{#each result.extra.checks as c, i (i)}
						<li class:ok={c.ok}>{c.ok ? '✓' : '✗'} {c.label}{c.detail ? ` (${c.detail})` : ''}</li>
					{/each}
				</ul>
			{/if}
			{#if typeof result.extra?.about === 'string'}
				<p class="about">{result.extra.about}</p>
			{/if}
		</div>

		<div class="result-actions">
			{#if result.extra?.canIssue && result.code === 'ELIGIBLE'}
				<button type="button" class="ops-big-btn light" onclick={() => submit(lastScanned, { action: 'issue' })}>
					<Award size={26} aria-hidden="true" /> ISSUE CERTIFICATE
				</button>
			{/if}
			{#if desk.category === 'networking' && result.code === 'PROFILE' && result.participant}
				<button
					type="button"
					class="ops-big-btn light"
					onclick={() => {
						introduceFrom = { scanned: lastScanned, name: result!.participant!.name };
						next();
					}}
				>
					<Handshake size={26} aria-hidden="true" /> INTRODUCE TO…
				</button>
			{/if}
			<button type="button" class="ops-big-btn" onclick={next}>
				<ScanQrCode size={26} aria-hidden="true" />
				CONTINUE SCANNING{countdown > 0 ? ` (${countdown})` : ''}
			</button>
			{#if !hasActions}
				<button type="button" class="dismiss" onclick={clearTimer} aria-label="Keep this result on screen" hidden={countdown === 0}>
					<X size={16} aria-hidden="true" /> Keep on screen
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.desk {
		padding-top: var(--space-3);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.ops-icon-btn.dark {
		color: var(--charcoal);
	}

	.ops-icon-btn.dark:hover {
		background: var(--white);
	}

	.where {
		display: grid;
		flex: 1;
		min-width: 0;
		text-align: center;
		line-height: 1.3;
	}

	.where strong {
		font: 600 17px/1.3 var(--font-sans);
		letter-spacing: 0.04em;
		color: var(--charcoal);
	}

	.where span {
		overflow: hidden;
		font-size: 14px;
		color: var(--text-supporting);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tools {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
		align-items: end;
	}

	.return select {
		min-height: 64px;
		font-size: 15px;
	}

	.small-title {
		font: 600 16px/1.3 var(--font-sans);
		color: var(--charcoal);
	}

	.ops-card :global(input) {
		min-height: 52px;
		font-size: 17px;
	}

	.hits {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.hits button {
		display: grid;
		width: 100%;
		min-height: 60px;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--charcoal);
		text-align: left;
		cursor: pointer;
	}

	.hits strong {
		font-size: 16px;
	}

	.hits span {
		font-size: 13px;
		color: var(--text-supporting);
	}

	.verify {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-3);
		align-items: end;
	}

	.verify .btn {
		min-height: 52px;
	}

	.answer {
		font-size: 15px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.working {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-3);
		background: rgb(12 23 48 / 0.82);
		color: var(--on-ink);
		font: 600 20px/1.3 var(--font-sans);
	}

	.working :global(svg) {
		color: var(--gold);
	}

	/* Full-screen result: the colour says it before the words do. */

	.result {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: grid;
		grid-template-rows: 1fr auto;
		gap: var(--space-4);
		overflow-y: auto;
		padding: max(var(--space-8), env(safe-area-inset-top)) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
		color: var(--white);
	}

	.result.success {
		background: var(--success);
	}

	.result.warning {
		background: var(--warning);
	}

	.result.error {
		background: var(--danger);
	}

	.result-body {
		display: grid;
		align-content: center;
		justify-items: center;
		gap: var(--space-2);
		width: 100%;
		max-width: 560px;
		margin-inline: auto;
		text-align: center;
	}

	.result h2 {
		margin-top: var(--space-2);
		font: 700 clamp(30px, 8vw, 44px) / 1.1 var(--font-sans);
		letter-spacing: 0.03em;
		color: var(--white);
	}

	.name {
		font: 600 clamp(22px, 6vw, 30px) / 1.2 var(--font-sans);
		overflow-wrap: anywhere;
	}

	.org {
		font-size: 15px;
		opacity: 0.9;
	}

	.message {
		margin-top: var(--space-2);
		font-size: 19px;
		line-height: 1.4;
	}

	.facts {
		display: grid;
		gap: 1px;
		width: 100%;
		margin: var(--space-3) 0 0;
		overflow: hidden;
		border-radius: var(--radius-md);
		background: rgb(255 255 255 / 0.25);
	}

	.facts div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: rgb(0 0 0 / 0.14);
		font-size: 17px;
	}

	.facts dt {
		opacity: 0.85;
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
		text-align: right;
		overflow-wrap: anywhere;
	}

	.checks {
		display: grid;
		gap: var(--space-1);
		margin: var(--space-2) 0 0;
		padding: 0;
		list-style: none;
		font-size: 16px;
		text-align: left;
	}

	.checks li:not(.ok) {
		font-weight: 600;
	}

	.about {
		max-width: 46ch;
		font-size: 16px;
		opacity: 0.95;
	}

	.result-actions {
		display: grid;
		gap: var(--space-3);
		width: 100%;
		max-width: 560px;
		margin-inline: auto;
	}

	.result-actions :global(.ops-big-btn) {
		background: rgb(0 0 0 / 0.35);
	}

	.result-actions :global(.ops-big-btn :is(svg)) {
		color: var(--white);
	}

	.result-actions :global(.ops-big-btn.light) {
		background: var(--white);
		color: var(--charcoal);
	}

	.result-actions :global(.ops-big-btn.light :is(svg)) {
		color: var(--gold-ink);
	}

	.dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: 44px;
		border: 0;
		background: none;
		color: var(--white);
		font: var(--text-ui);
		cursor: pointer;
	}

	.dismiss[hidden] {
		display: none;
	}

	@media (max-width: 420px) {
		.tools {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
