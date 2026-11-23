<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, CircleCheck, Download, ExternalLink, Search, Trophy } from '@lucide/svelte';
	import { AWARD_STATUSES, AWARD_STATUS_LABEL, type AwardStatus } from '#lib/awards.ts';

	let { data, form } = $props();

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string) => when.format(new Date(iso));
	const PILL: Record<AwardStatus, string> = { new: 'requested', shortlisted: 'inactive', winner: 'success', rejected: 'rejected' };

	let filter = $state<'all' | AwardStatus>('all');
	let category = $state('all');
	let query = $state('');
	let busy = $state(false);

	const applications = $derived(data.available ? data.applications : []);
	const categories = $derived([...new Set(applications.map((a) => a.categoryLabel))].sort());
	const count = (s: 'all' | AwardStatus) => (s === 'all' ? applications.length : applications.filter((a) => a.status === s).length);
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return applications.filter(
			(a) =>
				(filter === 'all' || a.status === filter) &&
				(category === 'all' || a.categoryLabel === category) &&
				(!q || [a.businessName, a.fullName, a.email, a.phone, a.city, a.code].some((v) => v.toLowerCase().includes(q)))
		);
	});

	const saving = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>Awards · Admin · Midtown Business Conclave</title>
</svelte:head>

<header class="ops-page-head">
	<div>
		<h1>Business awards</h1>
		<p class="ops-hint">Applications from <a href="https://awards.midtownevents.in" target="_blank" rel="noopener">awards.midtownevents.in</a>. Review them, shortlist, and mark the winners.</p>
	</div>
	{#if data.available}
		<div class="ops-head-actions">
			<dl class="ops-counts">
				<div><dt>Applications</dt><dd>{applications.length}</dd></div>
				<div><dt>New</dt><dd class="dup">{count('new')}</dd></div>
				<div><dt>Shortlisted</dt><dd>{count('shortlisted')}</dd></div>
				<div><dt>Winners</dt><dd class="ok">{count('winner')}</dd></div>
			</dl>
		</div>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={18} aria-hidden="true" />
		<p>Award applications need the database. Set <code>DATABASE_URL</code>.</p>
	</div>
{:else}
	{#if form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{form.message}</p></div>
	{:else if form?.success}
		<div class="ops-banner ok" role="status"><CircleCheck size={18} aria-hidden="true" /><p>{form.success}</p></div>
	{/if}

	<section class="ops-panel switch" aria-label="Open or close applications">
		<p>
			<span class="ops-pill {data.open ? 'success' : 'rejected'}">{data.open ? 'Open' : 'Closed'}</span>
			{data.open ? 'The website is taking applications.' : 'The website shows that applications are closed.'}
		</p>
		<form method="post" action="?/setOpen" use:enhance={saving}>
			<input type="hidden" name="open" value={data.open ? 'false' : 'true'} />
			<button class="btn btn-secondary ops-btn-sm" disabled={busy}>{data.open ? 'Close applications' : 'Open applications'}</button>
		</form>
	</section>

	<section class="ops-panel" aria-labelledby="apps-title">
		<div class="ops-panel-head">
			<div class="ops-heading">
				<span class="ops-heading-icon"><Trophy size={16} aria-hidden="true" /></span>
				<h2 id="apps-title">Applications</h2>
			</div>
			<a class="btn btn-secondary ops-btn-sm" href="/admin/awards/export" download data-sveltekit-reload><Download size={16} aria-hidden="true" /> Download for Excel</a>
		</div>

		<div class="tools">
			<div class="ops-chips" role="group" aria-label="Filter by status">
				{#each ['all', ...AWARD_STATUSES] as const as f (f)}
					<button type="button" class="ops-chip small-chip" aria-pressed={filter === f} onclick={() => (filter = f)}>
						{f === 'all' ? 'All' : AWARD_STATUS_LABEL[f]} <span class="ops-muted">{count(f)}</span>
					</button>
				{/each}
			</div>
			<div class="search-row">
				<label class="search">
					<Search size={16} aria-hidden="true" />
					<input type="search" bind:value={query} placeholder="Search business, name, mobile, code" aria-label="Search applications" />
				</label>
				<select bind:value={category} aria-label="Filter by category">
					<option value="all">All categories</option>
					{#each categories as c (c)}<option value={c}>{c}</option>{/each}
				</select>
			</div>
		</div>

		{#if !shown.length}
			<div class="ops-empty">
				<p>{applications.length ? 'No applications match.' : 'No applications yet.'}</p>
			</div>
		{:else}
			<ul class="cards">
				{#each shown as a (a.id)}
					<li class="card">
						<div class="top">
							{#if a.logoKey}
								<a class="logo" href="/admin/media/{a.logoKey}" target="_blank" rel="noopener"><img src="/admin/media/{a.logoKey}" alt="{a.businessName} logo" loading="lazy" /></a>
							{/if}
							<div class="who">
								<strong>{a.businessName}</strong>
								<span class="ops-muted">{a.code} · {fmt(a.createdAt)}</span>
							</div>
							<span class="ops-pill {PILL[a.status]}">{AWARD_STATUS_LABEL[a.status]}</span>
						</div>
						<p class="cat">{a.categoryLabel}</p>
						<p class="line"><b>{a.fullName}</b>, {a.designation} · {a.city}</p>
						<p class="line"><a href="mailto:{a.email}">{a.email}</a> · <a href="tel:{a.phone}">{a.phone}</a></p>
						<p class="line ops-muted">
							Since {a.yearStarted} · {a.teamSize} people
							{#if a.website} · <a href={a.website} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={12} aria-hidden="true" /></a>{/if}
						</p>
						<details>
							<summary>Read the full application</summary>
							<h3>What the business does</h3>
							<p>{a.about}</p>
							<h3>Why it deserves the award</h3>
							<p>{a.achievements}</p>
						</details>
						<form method="post" action="?/update" class="act" use:enhance={saving}>
							<input type="hidden" name="id" value={a.id} />
							<label class="ops-label">
								Status
								<select name="status">
									{#each AWARD_STATUSES as s (s)}<option value={s} selected={a.status === s}>{AWARD_STATUS_LABEL[s]}</option>{/each}
								</select>
							</label>
							<label class="ops-label note">
								Note <small>(only organisers see it)</small>
								<input name="note" value={a.adminNote ?? ''} maxlength="300" placeholder="e.g. Strong export growth" />
							</label>
							<button class="btn btn-secondary ops-btn-sm" disabled={busy}>Save</button>
						</form>
						{#if a.updatedBy}<p class="ops-hint">Last updated {fmt(a.updatedAt)} by {a.updatedBy}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.switch {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.switch p {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.tools {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.search-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.search {
		flex: 1 1 260px;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline: var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.search input {
		flex: 1;
		min-width: 0;
		min-height: 40px;
		border: 0;
		background: none;
		outline: none;
		font-size: 15px;
	}

	.search:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.small-chip {
		min-height: 38px;
		font-size: 14px;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: grid;
		gap: var(--space-2);
		align-content: start;
		min-width: 0;
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.top {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.who {
		flex: 1;
		display: grid;
		min-width: 0;
	}

	.who strong {
		font-size: 16px;
		color: var(--charcoal);
		overflow-wrap: anywhere;
	}

	.who .ops-muted {
		font-size: 13px;
	}

	.logo img {
		display: block;
		width: 44px;
		height: 44px;
		border-radius: 6px;
		object-fit: contain;
		box-shadow: inset 0 0 0 1px var(--rule);
	}

	.cat {
		font-weight: 600;
		color: var(--gold-ink);
	}

	.line {
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	details {
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--gold);
		background: var(--paper);
		font-size: 14px;
	}

	summary {
		font-weight: 600;
		color: var(--charcoal);
		cursor: pointer;
	}

	details h3 {
		margin-top: var(--space-3);
		font-size: 13px;
		font-weight: 600;
		color: var(--gold-ink);
	}

	details p {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.act {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);
		padding-top: var(--space-2);
		border-top: 1px solid var(--rule);
	}

	.act .note {
		flex: 1 1 180px;
	}
</style>
