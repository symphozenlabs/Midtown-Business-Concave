<script lang="ts">
	import { CircleAlert, Download, Filter, X } from '@lucide/svelte';
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
	const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
</script>

<svelte:head>
	<title>Activity · Admin · Midtown Business Conclave</title>
</svelte:head>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>Activity is not switched on yet: run <code>db/schema.sql</code> in the Neon SQL editor (it only adds the new tables), then reload this page. Without a database (<code>DATABASE_URL</code>) it stays off.</p>
	</div>
{:else}
	{@const ov = data.overview}
	<section class="ops-stats" aria-label="Scans">
		<div class="ops-stat"><span>Total scans</span><strong>{ov.scans.total}</strong></div>
		<div class="ops-stat"><span>Successful</span><strong class="ok">{ov.scans.success}</strong></div>
		<div class="ops-stat"><span>Duplicate attempts</span><strong class="dup">{ov.scans.duplicate}</strong></div>
		<div class="ops-stat"><span>Rejected</span><strong class="rej">{ov.scans.rejected}</strong></div>
	</section>
	<section class="ops-stats" aria-label="Desks">
		<div class="ops-stat"><span>Checked in</span><strong>{ov.desks.checkedIn} <small>of {ov.registrationsPaid} paid ({pct(ov.desks.checkedIn, ov.registrationsPaid)})</small></strong></div>
		<div class="ops-stat"><span>Handlers active / total</span><strong>{ov.handlers.active} / {ov.handlers.total} <small>{ov.handlers.onlineNow} signed in now</small></strong></div>
		<div class="ops-stat"><span>Certificates issued</span><strong>{ov.desks.certificates}</strong></div>
		<div class="ops-stat"><span>Delegate connections</span><strong>{ov.desks.connections}</strong></div>
	</section>

	<div class="cols">
		<section class="ops-panel" aria-labelledby="by-cat">
			<h2 id="by-cat">By category</h2>
			<table class="ops-table">
				<thead><tr><th>Desk</th><th class="num">Successful</th><th class="num">Duplicate</th><th class="num">Rejected</th></tr></thead>
				<tbody>
					{#each CATEGORIES as c (c.code)}
						{@const t = ov.byCategory[c.code] ?? { success: 0, duplicate: 0, rejected: 0 }}
						<tr>
							<td><a href="?category={c.code}">{c.label}</a></td>
							<td class="num">{t.success}</td>
							<td class="num">{t.duplicate}</td>
							<td class="num">{t.rejected}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if ov.meals.length || ov.sessions.length}
				<h3>Desk totals</h3>
				<ul class="totals">
					{#each ov.meals as m (m.id)}<li><span>{m.name} served</span><strong>{m.served}</strong></li>{/each}
					{#each ov.sessions as s (s.id)}<li><span>{s.hall} · {s.title}</span><strong>{s.attended}</strong></li>{/each}
					{#if ov.desks.reentries}<li><span>Re-entries</span><strong>{ov.desks.reentries}</strong></li>{/if}
				</ul>
			{/if}
		</section>

		<section class="ops-panel" aria-labelledby="by-handler">
			<h2 id="by-handler">By handler</h2>
			<div class="ops-table-wrap">
				<table class="ops-table">
					<thead><tr><th>Handler</th><th class="num">✓</th><th class="num">Dup</th><th class="num">✗</th><th>Last scan</th></tr></thead>
					<tbody>
						{#each ov.byHandler as h (h.id)}
							<tr>
								<td><a href="?handler={h.id}">{h.name}</a> <span class="ops-muted ops-mono">{h.username}</span></td>
								<td class="num">{h.tally.success}</td>
								<td class="num">{h.tally.duplicate}</td>
								<td class="num">{h.tally.rejected}</td>
								<td class="ops-muted">{fmt(h.lastScanAt)}</td>
							</tr>
						{:else}
							<tr><td colspan="5" class="ops-muted">No handlers yet.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>

	<section class="ops-panel" aria-labelledby="history">
		<div class="ops-panel-head">
			<nav class="tabs" aria-label="History">
				<a href="?{query}" aria-current={data.tab === 'scans' ? 'page' : undefined}>Transaction history</a>
				<a href="?tab=audit" aria-current={data.tab === 'audit' ? 'page' : undefined}>Audit log</a>
			</nav>
			{#if data.tab === 'scans'}
				<a class="btn btn-secondary ops-btn-sm" href="/admin/activity/export?{query}" download><Download size={15} aria-hidden="true" /> Export CSV</a>
			{/if}
		</div>

		{#if data.tab === 'scans'}
			<form method="get" class="ops-grid filters">
				<label class="ops-label">Handler
					<select name="handler" value={data.filter.handlerId}>
						<option value="">Everyone</option>
						{#each data.handlers as h (h.id)}<option value={h.id}>{h.name} ({h.username})</option>{/each}
					</select>
				</label>
				<label class="ops-label">Category
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
				<label class="ops-label">Participant<input name="q" value={data.filter.q} placeholder="Name or MBC-…" /></label>
				<label class="ops-label">Date<input type="date" name="date" value={data.filter.date} /></label>
				<label class="ops-label">From<input type="time" name="from" value={data.filter.from} /></label>
				<label class="ops-label">Until<input type="time" name="to" value={data.filter.to} /></label>
				<div class="ops-actions">
					<button class="btn btn-primary ops-btn-sm" type="submit"><Filter size={15} aria-hidden="true" /> Filter</button>
					{#if filtered}<a class="btn btn-ghost ops-btn-sm" href="/admin/activity"><X size={15} aria-hidden="true" /> Clear</a>{/if}
				</div>
			</form>

			{#if data.transactions.length === 0}
				<p class="ops-hint">No scans match.</p>
			{:else}
				<p class="ops-hint">Newest {data.transactions.length} shown. Export for the full list.</p>
				<div class="ops-table-wrap">
					<table class="ops-table">
						<thead><tr><th>Time</th><th>Desk</th><th>Participant</th><th>Result</th><th>Handler</th><th>Where</th></tr></thead>
						<tbody>
							{#each data.transactions as t (t.id)}
								<tr>
									<td class="ops-muted nowrap">{fmt(t.at)}</td>
									<td>{categoryInfo(t.category as Category).label}</td>
									<td>{t.participantName ?? '—'} <span class="ops-muted ops-mono">{t.participantCode ?? ''}</span></td>
									<td><span class="ops-pill {t.result}">{RESULT[t.result]}</span> <span class="ops-muted">{t.title}</span></td>
									<td>{t.handlerName ?? '—'}</td>
									<td class="ops-muted">{[t.context?.gate, t.context?.counter, t.context?.offline ? 'synced offline' : null].filter(Boolean).join(' · ')}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else}
			<p class="ops-hint">Account changes, permission changes, overrides, sign-ins and refused desk access, newest first.</p>
			<div class="ops-table-wrap">
				<table class="ops-table">
					<thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
					<tbody>
						{#each data.auditLog as a (a.id)}
							<tr>
								<td class="ops-muted nowrap">{fmt(a.at)}</td>
								<td>{a.actor} <span class="ops-muted">({a.actorType})</span></td>
								<td class="ops-mono">{a.action}</td>
								<td class="ops-muted">{a.targetType ?? ''}</td>
								<td class="ops-muted details">{a.details ? JSON.stringify(a.details) : ''}</td>
							</tr>
						{:else}
							<tr><td colspan="5" class="ops-muted">Nothing recorded yet.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
{/if}

<style>
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
		gap: var(--space-6);
		align-items: start;
	}

	small {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-supporting);
	}

	.ok {
		color: var(--success) !important;
	}

	.dup {
		color: var(--warning) !important;
	}

	.rej {
		color: var(--danger) !important;
	}

	.totals {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.totals li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--rule);
	}

	.tabs {
		display: flex;
		gap: var(--space-1);
	}

	.tabs a {
		padding: 6px var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-body);
		font: var(--text-ui);
		font-size: 14px;
		text-decoration: none;
	}

	.tabs a[aria-current='page'] {
		background: var(--gold-tint);
		color: var(--charcoal);
		box-shadow: inset 0 -2px 0 var(--gold-ink);
	}

	.filters {
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--rule);
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

	code {
		font-size: 12px;
	}

	@media (max-width: 500px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
