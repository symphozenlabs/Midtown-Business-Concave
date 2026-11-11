<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, CircleCheck, Handshake } from '@lucide/svelte';
	import { formatRupees } from '#lib/payment.ts';
	import { SPONSOR_STATUSES, SPONSOR_STATUS_LABEL, SPONSOR_TIERS, type SponsorStatus } from '#lib/stall-booking.ts';

	let { data, form } = $props();

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string) => when.format(new Date(iso));
	const tierOf = (id: string) => SPONSOR_TIERS.find((t) => t.id === id);
	const PILL: Record<SponsorStatus, string> = { new: 'requested', contacted: 'inactive', confirmed: 'success', declined: 'rejected' };

	let filter = $state<'all' | SponsorStatus>('all');
	let busy = $state(false);

	const requests = $derived(data.available ? data.requests : []);
	const count = (s: 'all' | SponsorStatus) => (s === 'all' ? requests.length : requests.filter((r) => r.status === s).length);
	const shown = $derived(requests.filter((r) => filter === 'all' || r.status === filter));
	const pipeline = $derived(
		requests.filter((r) => r.status === 'confirmed').reduce((sum, r) => sum + (tierOf(r.tier)?.priceRupees ?? 0), 0)
	);
</script>

<svelte:head>
	<title>Sponsor requests · Admin · Midtown Business Conclave</title>
</svelte:head>

<header class="ops-page-head">
	<div>
		<h1>Sponsor requests</h1>
		<p class="ops-hint">Companies who pressed “Become a sponsor” on the website. Each one got a thank-you email; follow up and track them here.</p>
	</div>
	{#if data.available}
		<div class="ops-head-actions">
			<dl class="ops-counts">
				<div><dt>Requests</dt><dd>{requests.length}</dd></div>
				<div><dt>New</dt><dd class="dup">{count('new')}</dd></div>
				<div><dt>Confirmed</dt><dd class="ok">{count('confirmed')}</dd></div>
				<div><dt>Confirmed value</dt><dd>{formatRupees(pipeline)}</dd></div>
			</dl>
		</div>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={18} aria-hidden="true" />
		<p>Sponsor requests need the database. Set <code>DATABASE_URL</code>.</p>
	</div>
{:else}
	{#if form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{form.message}</p></div>
	{:else if form?.success}
		<div class="ops-banner ok" role="status"><CircleCheck size={18} aria-hidden="true" /><p>{form.success}</p></div>
	{/if}

	<section class="ops-panel" aria-labelledby="req-title">
		<div class="ops-panel-head">
			<div class="ops-heading">
				<span class="ops-heading-icon"><Handshake size={16} aria-hidden="true" /></span>
				<h2 id="req-title">Requests</h2>
			</div>
			<div class="ops-chips" role="group" aria-label="Filter by status">
				{#each ['all', ...SPONSOR_STATUSES] as const as f (f)}
					<button type="button" class="ops-chip small-chip" aria-pressed={filter === f} onclick={() => (filter = f)}>
						{f === 'all' ? 'All' : SPONSOR_STATUS_LABEL[f]} <span class="ops-muted">{count(f)}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if !shown.length}
			<div class="ops-empty">
				<p>{requests.length ? 'No requests with this status.' : 'No sponsor requests yet.'}</p>
			</div>
		{:else}
			<ul class="cards">
				{#each shown as r (r.id)}
					{@const tier = tierOf(r.tier)}
					<li class="card">
						<div class="top">
							<div>
								<strong>{r.companyName}</strong>
								<span class="ops-muted">{r.contactName} · {fmt(r.createdAt)}</span>
							</div>
							<span class="ops-pill {PILL[r.status]}">{SPONSOR_STATUS_LABEL[r.status]}</span>
						</div>
						<p class="tier">{tier ? `${tier.name} · ${formatRupees(tier.priceRupees)}` : r.tier}</p>
						<p class="contact"><a href="mailto:{r.email}">{r.email}</a> · <a href="tel:{r.phone}">{r.phone}</a></p>
						{#if r.message}<blockquote>{r.message}</blockquote>{/if}
						<form method="post" action="?/update" class="act" use:enhance={() => {
							busy = true;
							return async ({ update }) => {
								await update({ reset: false });
								busy = false;
							};
						}}>
							<input type="hidden" name="id" value={r.id} />
							<label class="ops-label">
								Status
								<select name="status">
									{#each SPONSOR_STATUSES as s (s)}<option value={s} selected={r.status === s}>{SPONSOR_STATUS_LABEL[s]}</option>{/each}
								</select>
							</label>
							<label class="ops-label note">
								Note <small>(only organisers see it)</small>
								<input name="note" value={r.adminNote ?? ''} maxlength="300" placeholder="e.g. Called on 12 Nov, sending deck" />
							</label>
							<button class="btn btn-secondary ops-btn-sm" disabled={busy}>Save</button>
						</form>
						{#if r.updatedBy}<p class="ops-hint">Last updated {fmt(r.updatedAt)} by {r.updatedBy}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.small-chip {
		min-height: 38px;
		font-size: 14px;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: grid;
		gap: var(--space-2);
		align-content: start;
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.top div {
		display: grid;
	}

	.top strong {
		font-size: 16px;
		color: var(--charcoal);
	}

	.top .ops-muted {
		font-size: 13px;
	}

	.tier {
		font-weight: 600;
		color: var(--gold-ink);
	}

	.contact {
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	blockquote {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--gold);
		background: var(--paper);
		font-size: 14px;
		white-space: pre-line;
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
