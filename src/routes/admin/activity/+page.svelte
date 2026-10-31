<script lang="ts">
	import { Activity, CircleAlert, Download, Filter, Gauge, History, UserCheck, X } from '@lucide/svelte';
	import CategoryIcon from '#lib/components/ops/CategoryIcon.svelte';
	import { CATEGORIES, categoryInfo, type Category } from '#lib/ops/categories.ts';

	let { data } = $props();

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '—');
	const RESULT = { success: 'Successful', duplicate: 'Duplicate', rejected: 'Rejected' } as const;

	const query = $derived.by(() => {
		if (!data.available) return '';
		const q = new URLSearchParams();
		for (const [k, v] of Object.entries({
			handler: data.filter.handlerId,
			category: data.filter.category,
			result: data.filter.result,
			q: data.filter.q,
			date: data.filter.date,
			from: data.filter.from,
			to: data.filter.to
		})) {
			if (v) q.set(k, v);
		}
		return q.toString();
	});
	const filtered = $derived(query.length > 0);
	const share = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
	// More filters than fit in one row stay folded on small screens until asked for.
	let showFilters = $state(false);
</script>

<svelte:head>
	<title>Activity · Admin · Midtown Business Conclave</title>
</svelte:head>

<header class="ops-page-head">
	<div>
		<h1>Activity</h1>
		<p class="ops-hint">{data.available ? `${data.eventName}: every scan at every desk, and the audit log.` : 'Every scan at every desk, and the audit log.'}</p>
	</div>
	{#if data.available}
		{@const s = data.overview.scans}
		<div class="ops-head-actions">
			<dl class="ops-counts">
				<div><dt>Scans</dt><dd>{s.total}</dd></div>
				<div><dt>Successful</dt><dd class="ok">{s.success}</dd></div>
				<div><dt>Duplicates</dt><dd class="dup">{s.duplicate}</dd></div>
				<div><dt>Rejected</dt><dd class="rej">{s.rejected}</dd></div>
			</dl>
		</div>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>Activity is not switched on yet: run <code>db/schema.sql</code> in the Neon SQL editor (it only adds the new tables), then reload this page. Without a database (<code>DATABASE_URL</code>) it stays off.</p>
	</div>
{:else}
	{@const ov = data.overview}
	<div class="ops-layout">
		<div class="ops-column">
			<section class="ops-panel" aria-labelledby="history-title">
				<div class="ops-panel-head">
					<div class="ops-heading">
						<span class="ops-heading-icon"><History size={16} aria-hidden="true" /></span>
						<h2 id="history-title" class="visually-hidden">History</h2>
						<nav class="tabs" aria-label="History">
							<a href="?{query}" aria-current={data.tab === 'scans' ? 'page' : undefined} data-sveltekit-reset="false">Scans</a>
							<a href="?tab=audit" aria-current={data.tab === 'audit' ? 'page' : undefined} data-sveltekit-reset="false">Audit log</a>
						</nav>
					</div>
					{#if data.tab === 'scans'}
						<div class="ops-actions">
							<button type="button" class="btn btn-ghost ops-btn-sm filter-toggle" aria-expanded={showFilters || filtered} onclick={() => (showFilters = !showFilters)}>
								<Filter size={15} aria-hidden="true" /> Filters{#if filtered}<span class="dot" aria-label="(active)"></span>{/if}
							</button>
							<a class="btn btn-secondary ops-btn-sm" href="/admin/activity/export?{query}" download><Download size={15} aria-hidden="true" /> Export CSV</a>
						</div>
					{/if}
				</div>

				{#if data.tab === 'scans'}
					<form method="get" class="filters" class:open={showFilters || filtered}>
						<label class="ops-label">Handler
							<select name="handler" value={data.filter.handlerId}>
								<option value="">Everyone</option>
								{#each data.handlers as h (h.id)}<option value={h.id}>{h.name} ({h.username})</option>{/each}
							</select>
						</label>
						<label class="ops-label">Desk
							<select name="category" value={data.filter.category}>
								<option value="">All desks</option>
								{#each CATEGORIES as c (c.code)}<option value={c.code}>{c.label}</option>{/each}
							</select>
						</label>
						<label class="ops-label">Result
							<select name="result" value={data.filter.result}>
								<option value="">Any result</option>
								<option value="success">Successful</option>
								<option value="duplicate">Duplicate</option>
								<option value="rejected">Rejected</option>
							</select>
						</label>
						<label class="ops-label">Participant<input name="q" value={data.filter.q} placeholder="Name or MBC-…" autocomplete="off" /></label>
						<label class="ops-label">Date<input type="date" name="date" value={data.filter.date} /></label>
						<label class="ops-label">From<input type="time" name="from" value={data.filter.from} /></label>
						<label class="ops-label">Until<input type="time" name="to" value={data.filter.to} /></label>
						<div class="ops-actions filter-actions">
							<button class="btn btn-primary ops-btn-sm" type="submit"><Filter size={15} aria-hidden="true" /> Apply</button>
							{#if filtered}<a class="btn btn-ghost ops-btn-sm" href="/admin/activity"><X size={15} aria-hidden="true" /> Clear</a>{/if}
						</div>
					</form>

					{#if data.transactions.length === 0}
						<div class="ops-empty"><p>{filtered ? 'No scans match these filters.' : 'No scans yet. They appear here as handlers work their desks.'}</p></div>
					{:else}
						<p class="ops-hint">Newest {data.transactions.length} shown. Export for the full list.</p>
						<div class="ops-table-wrap">
							<table class="ops-table stack">
								<thead><tr><th>Time</th><th>Desk</th><th>Participant</th><th>Result</th><th>Handler</th><th>Where</th></tr></thead>
								<tbody>
									{#each data.transactions as t (t.id)}
										<tr>
											<td class="ops-muted nowrap" data-label="Time">{fmt(t.at)}</td>
											<td class="nowrap" data-label="Desk">{categoryInfo(t.category as Category).label}</td>
											<td class="lead">{t.participantName ?? '—'} <span class="ops-muted ops-mono">{t.participantCode ?? ''}</span></td>
											<td class="end"><span class="ops-pill {t.result}">{RESULT[t.result]}</span> <span class="ops-muted">{t.title}</span></td>
											<td data-label="Handler">{t.handlerName ?? '—'}</td>
											<td class="ops-muted" data-label="Where">{[t.context?.gate, t.context?.counter, t.context?.offline ? 'synced offline' : null].filter(Boolean).join(' · ')}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{:else}
					<p class="ops-hint">Account changes, permission changes, overrides, sign-ins and refused desk access, newest first.</p>
					<div class="ops-table-wrap">
						<table class="ops-table stack">
							<thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
							<tbody>
								{#each data.auditLog as a (a.id)}
									<tr>
										<td class="ops-muted nowrap" data-label="Time">{fmt(a.at)}</td>
										<td data-label="Who">{a.actor} <span class="ops-muted">({a.actorType})</span></td>
										<td class="ops-mono lead">{a.action}</td>
										<td class="ops-muted" data-label="Target">{a.targetType ?? ''}</td>
										<td class="ops-muted details" data-label="Details">{a.details ? JSON.stringify(a.details) : ''}</td>
									</tr>
								{:else}
									<tr><td colspan="5" class="ops-muted">Nothing recorded yet.</td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		</div>

		<aside class="ops-column">
			<section class="ops-panel" aria-labelledby="glance-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><Gauge size={16} aria-hidden="true" /></span>
					<h2 id="glance-title">At a glance</h2>
				</div>
				<div class="progress">
					<div class="progress-label">
						<span>Checked in</span>
						<strong>{ov.desks.checkedIn} of {ov.registrationsPaid} paid · {share(ov.desks.checkedIn, ov.registrationsPaid)}%</strong>
					</div>
					<div class="bar" role="progressbar" aria-label="Checked in" aria-valuemin="0" aria-valuemax="100" aria-valuenow={share(ov.desks.checkedIn, ov.registrationsPaid)}>
						<span style:width="{share(ov.desks.checkedIn, ov.registrationsPaid)}%"></span>
					</div>
				</div>
				<dl class="facts">
					<div><dt>Handlers active</dt><dd>{ov.handlers.active} of {ov.handlers.total}</dd></div>
					<div><dt>Signed in now</dt><dd>{ov.handlers.onlineNow}</dd></div>
					<div><dt>Certificates issued</dt><dd>{ov.desks.certificates}</dd></div>
					<div><dt>Delegate connections</dt><dd>{ov.desks.connections}</dd></div>
					{#if ov.desks.reentries}<div><dt>Re-entries</dt><dd>{ov.desks.reentries}</dd></div>{/if}
				</dl>
			</section>

			<section class="ops-panel" aria-labelledby="desks-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><Activity size={16} aria-hidden="true" /></span>
					<h2 id="desks-title">By desk</h2>
				</div>
				<ul class="desks">
					{#each CATEGORIES as c (c.code)}
						{@const t = ov.byCategory[c.code] ?? { success: 0, duplicate: 0, rejected: 0 }}
						<li>
							<a href="?category={c.code}" data-sveltekit-reset="false"><CategoryIcon category={c.code} size={15} /> {c.label}</a>
							<span class="tally" aria-label="{t.success} successful, {t.duplicate} duplicate, {t.rejected} rejected">
								<span class="ok">{t.success}</span> / <span class="dup">{t.duplicate}</span> / <span class="rej">{t.rejected}</span>
							</span>
						</li>
					{/each}
				</ul>
				{#if ov.meals.length || ov.sessions.length}
					<h3>Desk totals</h3>
					<ul class="desks">
						{#each ov.meals as m (m.id)}<li><span>{m.name} served</span><strong>{m.served}</strong></li>{/each}
						{#each ov.sessions as s (s.id)}<li><span>{s.hall} · {s.title}</span><strong>{s.attended}</strong></li>{/each}
					</ul>
				{/if}
			</section>

			<section class="ops-panel" aria-labelledby="handlers-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><UserCheck size={16} aria-hidden="true" /></span>
					<h2 id="handlers-title">By handler</h2>
				</div>
				{#if ov.byHandler.length}
					<ul class="desks">
						{#each ov.byHandler as h (h.id)}
							<li>
								<a href="?handler={h.id}" data-sveltekit-reset="false">
									<span>{h.name}<small class="ops-muted"> · {h.lastScanAt ? fmt(h.lastScanAt) : 'no scans'}</small></span>
								</a>
								<span class="tally"><span class="ok">{h.tally.success}</span> / <span class="dup">{h.tally.duplicate}</span> / <span class="rej">{h.tally.rejected}</span></span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ops-hint">No handlers yet.</p>
				{/if}
				<p class="ops-hint legend">Successful / duplicate / rejected</p>
			</section>
		</aside>
	</div>
{/if}

<style>
	.ok {
		color: var(--success) !important;
	}

	.dup {
		color: var(--warning) !important;
	}

	.rej {
		color: var(--danger) !important;
	}

	.tabs {
		display: flex;
		gap: var(--space-1);
	}

	.tabs a {
		padding: 6px var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-supporting);
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
		text-decoration: none;
	}

	.tabs a[aria-current='page'] {
		background: var(--gold-tint);
		color: var(--charcoal);
		box-shadow: inset 0 -2px 0 var(--gold-ink);
	}

	.filter-toggle {
		position: relative;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--gold-ink);
	}

	/* Filters: one compact row on wide screens; folded behind "Filters" on small ones. */
	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-3);
		align-items: end;
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--rule);
	}

	.filter-actions {
		flex-wrap: nowrap;
	}

	.nowrap {
		white-space: nowrap;
	}

	.details {
		max-width: 420px;
		overflow-wrap: anywhere;
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		font-size: 11px;
	}

	.progress {
		display: grid;
		gap: var(--space-2);
	}

	.progress-label {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: 13px;
	}

	.progress-label strong {
		font-weight: 600;
		color: var(--charcoal);
	}

	.bar {
		height: 8px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--paper);
	}

	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--gold-ink);
	}

	.facts {
		display: grid;
		margin: 0;
	}

	.facts div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--rule);
	}

	.facts dt {
		color: var(--text-supporting);
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
		color: var(--charcoal);
		font-variant-numeric: tabular-nums;
	}

	.desks {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.desks li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 38px;
		border-bottom: 1px solid var(--rule);
	}

	.desks a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		color: var(--charcoal);
		text-decoration: none;
	}

	.desks a:hover {
		text-decoration: underline;
	}

	.desks a :global(svg) {
		flex: none;
		color: var(--gold-ink);
	}

	.desks small {
		font-size: 12px;
	}

	.tally {
		flex: none;
		font-variant-numeric: tabular-nums;
		color: var(--text-supporting);
	}

	.tally span {
		font-weight: 600;
	}

	.legend {
		font-size: 12px;
	}

	code {
		font-size: 12px;
	}

	@media (min-width: 761px) {
		.filter-toggle {
			display: none;
		}
	}

	@media (max-width: 760px) {
		.filters:not(.open) {
			display: none;
		}

		.filters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.filter-actions {
			grid-column: 1 / -1;
		}
	}
</style>
