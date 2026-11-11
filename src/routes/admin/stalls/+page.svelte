<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, CircleAlert, CircleCheck, LayoutGrid, Search, Store, X } from '@lucide/svelte';
	import { formatRupees } from '#lib/payment.ts';
	import { STALL_NUMBERS, STALL_STATUS_LABEL, type StallBookingStatus } from '#lib/stall-booking.ts';

	let { data, form } = $props();

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '—');

	type Filter = 'all' | StallBookingStatus;
	const FILTERS: Filter[] = ['all', 'payment_submitted', 'pending_payment', 'paid', 'rejected'];
	const PILL: Record<StallBookingStatus, string> = {
		pending_payment: 'inactive',
		payment_submitted: 'requested',
		paid: 'success',
		rejected: 'rejected'
	};

	let filter = $state<Filter>('all');
	let q = $state('');
	let open = $state<string | null>(null);
	let busy = $state(false);

	const bookings = $derived(data.available ? data.bookings : []);
	const count = (s: Filter) => (s === 'all' ? bookings.length : bookings.filter((b) => b.status === s).length);
	const shown = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		return bookings.filter(
			(b) =>
				(filter === 'all' || b.status === filter) &&
				(!needle ||
					[b.code, b.fullName, b.businessName, b.email, b.phone, b.upiTxnId ?? '', b.voucherCode ?? '']
						.join(' ')
						.toLowerCase()
						.includes(needle))
		);
	});
	const confirmed = $derived(bookings.filter((b) => b.status === 'paid'));
	const collected = $derived(confirmed.reduce((sum, b) => sum + b.amountRupees, 0));
	const allotted = $derived(new Map(confirmed.filter((b) => b.allottedStall).map((b) => [b.allottedStall!, b])));
	const free = $derived(STALL_NUMBERS.filter((n) => !allotted.has(n)).length);

	const submit = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>Stall bookings · Admin · Midtown Business Conclave</title>
</svelte:head>

<header class="ops-page-head">
	<div>
		<h1>Stall bookings</h1>
		<p class="ops-hint">
			Exhibitors book from the website with a preferred stall. Confirm the payment and allot the final stall here.
			Prices and the SEFMEMBER promo code are under <a href="/admin/payments?tab=stalls">Payments → Stalls</a>.
		</p>
	</div>
	{#if data.available}
		<div class="ops-head-actions">
			<dl class="ops-counts">
				<div><dt>Bookings</dt><dd>{bookings.length}</dd></div>
				<div><dt>Needs review</dt><dd class="dup">{count('payment_submitted')}</dd></div>
				<div><dt>Confirmed</dt><dd class="ok">{confirmed.length}</dd></div>
				<div><dt>Collected</dt><dd>{formatRupees(collected)}</dd></div>
				<div><dt>Stalls free</dt><dd>{free} / {STALL_NUMBERS.length}</dd></div>
			</dl>
		</div>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={18} aria-hidden="true" />
		<p>Stall bookings need the database. Set <code>DATABASE_URL</code>.</p>
	</div>
{:else}
	{#if form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{form.message}</p></div>
	{:else if form?.success}
		<div class="ops-banner ok" role="status"><CircleCheck size={18} aria-hidden="true" /><p>{form.success}</p></div>
	{/if}

	<section class="ops-panel" aria-labelledby="map-title">
		<div class="ops-panel-head">
			<div class="ops-heading">
				<span class="ops-heading-icon"><LayoutGrid size={16} aria-hidden="true" /></span>
				<h2 id="map-title">Stall allotment</h2>
			</div>
			<p class="ops-hint">
				Selling: {data.offers.map((o) => `${o.name} (${o.sizeLabel}) ${formatRupees(o.priceRupees)}`).join(' · ')}
			</p>
		</div>
		<ul class="grid" aria-label="Stalls on the layout">
			{#each STALL_NUMBERS as n (n)}
				{@const b = allotted.get(n)}
				<li class:taken={!!b} title={b ? `${b.businessName} · ${b.code}` : 'Free'}>
					<strong>{n}</strong>
					<span>{b ? b.businessName : 'Free'}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="ops-panel" aria-labelledby="list-title">
		<div class="ops-panel-head">
			<div class="ops-heading">
				<span class="ops-heading-icon"><Store size={16} aria-hidden="true" /></span>
				<h2 id="list-title">Bookings</h2>
			</div>
			<label class="ops-label search">
				<span class="visually-hidden">Search bookings</span>
				<span class="search-box">
					<Search size={15} aria-hidden="true" />
					<input type="search" bind:value={q} placeholder="Name, business, STL-…, UPI ID" autocomplete="off" />
				</span>
			</label>
		</div>

		<div class="ops-chips" role="group" aria-label="Filter by status">
			{#each FILTERS as f (f)}
				<button type="button" class="ops-chip small-chip" aria-pressed={filter === f} onclick={() => (filter = f)}>
					{f === 'all' ? 'All' : STALL_STATUS_LABEL[f]} <span class="ops-muted">{count(f)}</span>
				</button>
			{/each}
		</div>

		{#if !shown.length}
			<div class="ops-empty">
				<p>{bookings.length ? 'No bookings match.' : 'No stall bookings yet. They appear here as exhibitors book on the website.'}</p>
			</div>
		{:else}
			<div class="ops-table-wrap">
				<table class="ops-table stack">
					<thead>
						<tr>
							<th>Exhibitor</th>
							<th>Contact</th>
							<th>Preferred</th>
							<th>Allotted</th>
							<th>Amount</th>
							<th>UPI transaction ID</th>
							<th>Status</th>
							<th><span class="visually-hidden">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each shown as b (b.id)}
							<tr class:open={open === b.id}>
								<td class="lead">
									<strong>{b.businessName}</strong>
									<span class="ops-muted">{b.fullName} · <span class="ops-mono">{b.code}</span></span>
								</td>
								<td data-label="Contact"><a href="mailto:{b.email}">{b.email}</a><br /><span class="ops-muted">{b.phone}</span></td>
								<td data-label="Preferred">{b.preferredStall ?? 'Any'}</td>
								<td data-label="Allotted">{b.allottedStall ?? '—'}</td>
								<td data-label="Amount" class="nowrap">
									{formatRupees(b.amountRupees)}
									{#if b.voucherCode}<br /><span class="ops-muted">{b.voucherCode} −{formatRupees(b.discountRupees)}</span>{/if}
								</td>
								<td data-label="UPI ID" class="ops-mono">{b.upiTxnId ?? (b.amountRupees <= 0 ? 'Free (promo)' : '—')}</td>
								<td data-label="Status"><span class="ops-pill {PILL[b.status]}">{STALL_STATUS_LABEL[b.status]}</span></td>
								<td class="end">
									<button type="button" class="btn btn-ghost ops-btn-sm" aria-expanded={open === b.id} onclick={() => (open = open === b.id ? null : b.id)}>
										{open === b.id ? 'Close' : 'Manage'}
									</button>
								</td>
							</tr>
							{#if open === b.id}
								{@const preferredHolder = b.preferredStall ? allotted.get(b.preferredStall) : undefined}
								<!-- Suggest the preferred stall only while no one else holds it. -->
								{@const suggested =
									b.allottedStall ?? (b.status !== 'paid' && (!preferredHolder || preferredHolder.id === b.id) ? b.preferredStall : null)}
								<tr class="detail">
									<td colspan="8">
										<div class="manage">
											<dl class="facts">
												<div><dt>Stall type</dt><dd>{b.stallType}</dd></div>
												<div><dt>Price</dt><dd>{formatRupees(b.priceRupees)}</dd></div>
												<div><dt>Paid to</dt><dd>{b.payeeName} ({b.payeeVpa})</dd></div>
												<div><dt>Booked</dt><dd>{fmt(b.createdAt)}</dd></div>
												<div><dt>Payment reported</dt><dd>{fmt(b.paymentSubmittedAt)}</dd></div>
												{#if b.reviewedBy}<div><dt>Reviewed</dt><dd>{fmt(b.reviewedAt)} by {b.reviewedBy}</dd></div>{/if}
												{#if b.rejectionReason}<div><dt>Rejection note</dt><dd>{b.rejectionReason}</dd></div>{/if}
											</dl>

											<div class="forms">
												<form method="post" action={b.status === 'paid' ? '?/allot' : '?/markPaid'} use:enhance={submit} class="act">
													<input type="hidden" name="id" value={b.id} />
													<label class="ops-label">
														Allot stall
														<select name="allotted">
															<option value="" selected={suggested === null}>Not yet</option>
															{#each STALL_NUMBERS as n (n)}
																{@const holder = allotted.get(n)}
																<option value={n} selected={suggested === n} disabled={!!holder && holder.id !== b.id}>
																	{n}{n === b.preferredStall ? ' (preferred)' : ''}{holder && holder.id !== b.id ? ` · ${holder.businessName}` : ''}
																</option>
															{/each}
														</select>
													</label>
													{#if b.status === 'paid'}
														<button class="btn btn-secondary ops-btn-sm" disabled={busy}>Save stall</button>
													{:else}
														<button class="btn btn-primary ops-btn-sm" disabled={busy}><Check size={15} aria-hidden="true" /> Mark paid and email</button>
													{/if}
												</form>

												{#if b.status !== 'rejected' && b.status !== 'paid'}
													<form method="post" action="?/reject" use:enhance={submit} class="act">
														<input type="hidden" name="id" value={b.id} />
														<label class="ops-label">
															Reject with a note <small>(emailed to the exhibitor)</small>
															<input name="reason" maxlength="300" placeholder="e.g. No payment found for this UPI ID" />
														</label>
														<button class="btn btn-ghost ops-btn-sm ops-danger" disabled={busy}><X size={15} aria-hidden="true" /> Reject</button>
													</form>
												{/if}
											</div>
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.grid li {
		display: grid;
		gap: 2px;
		padding: var(--space-2);
		border: 1px dashed var(--control-border);
		border-radius: var(--radius-sm);
		font-size: 12px;
		color: var(--text-supporting);
		min-width: 0;
	}

	.grid li strong {
		font-size: 15px;
		color: var(--charcoal);
	}

	.grid li span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.grid li.taken {
		border-style: solid;
		border-color: var(--gold-ink);
		background: var(--gold-tint);
		color: var(--gold-ink);
	}

	.search {
		min-width: min(320px, 100%);
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-left: var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--text-supporting);
	}

	.search-box input {
		border: 0 !important;
		outline-offset: 0;
	}

	.small-chip {
		min-height: 38px;
		font-size: 14px;
	}

	.lead {
		display: grid;
		gap: 2px;
	}

	.nowrap {
		white-space: nowrap;
	}

	tr.open td {
		background: var(--gold-tint);
	}

	tr.detail td {
		background: var(--paper);
	}

	.manage {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		gap: var(--space-6);
		padding: var(--space-3) 0;
	}

	.facts {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	.facts div {
		display: grid;
		grid-template-columns: 130px minmax(0, 1fr);
		gap: var(--space-3);
	}

	.facts dt {
		color: var(--text-supporting);
	}

	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.forms {
		display: grid;
		gap: var(--space-4);
		align-content: start;
	}

	.act {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);
	}

	.act .ops-label {
		flex: 1 1 200px;
	}

	@media (max-width: 860px) {
		.manage {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
