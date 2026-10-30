<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		BadgeCheck,
		CircleAlert,
		Clock,
		Copy,
		IndianRupee,
		LoaderCircle,
		LogOut,
		Mail,
		QrCode,
		RotateCcw,
		Search,
		Send,
		X
	} from '@lucide/svelte';
	import { INTERESTS } from '#lib/registration.ts';
	import { DEFAULT_PAYMENT, formatRupees, upiLink } from '#lib/payment.ts';
	import UpiQr from '#lib/components/UpiQr.svelte';
	import TextField from '#lib/components/TextField.svelte';

	let { data, form } = $props();

	type Status = 'pending_payment' | 'payment_submitted' | 'paid' | 'rejected';

	const TABS: { value: Status | 'all'; label: string }[] = [
		{ value: 'payment_submitted', label: 'Needs review' },
		{ value: 'pending_payment', label: 'Awaiting payment' },
		{ value: 'paid', label: 'Paid' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'all', label: 'All' }
	];

	const STATUS_LABEL: Record<Status, string> = {
		payment_submitted: 'Needs review',
		pending_payment: 'Awaiting payment',
		paid: 'Paid',
		rejected: 'Rejected'
	};

	// Two-step confirmations, one row at a time.
	let confirming = $state<string | null>(null);
	let rejecting = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let copied = $state<string | null>(null);

	// The form keeps what the organiser types; it starts from the saved settings.
	const initial = untrack(() => (data.available ? data.settings : DEFAULT_PAYMENT));
	const settingsErrors = $derived(
		form && 'settingsErrors' in form ? (form.settingsErrors as Record<string, string>) : ({} as Record<string, string>)
	);
	let price = $state(String(initial.priceRupees));
	let vpa = $state(initial.vpa);
	let payeeName = $state(initial.payeeName);
	let savingSettings = $state(false);

	const previewLink = $derived(
		upiLink({ priceRupees: Number(price) || 0, vpa, payeeName }, Number(price) || 0, 'MBC-PREVIEW')
	);

	const total = $derived(
		data.available ? Object.values(data.stats.counts).reduce((a, b) => a + b, 0) : 0
	);

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '');

	const interestLabel = (v: string) => INTERESTS.find((i) => i.value === v)?.label ?? v;

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = copied === key ? null : copied), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	function rowAction(id: string) {
		return () => {
			busy = id;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				await update({ reset: false });
				busy = null;
				confirming = null;
				rejecting = null;
			};
		};
	}

	const media = (key: string | null) => (key ? `/admin/media/${key}` : '');
</script>

<svelte:head>
	<title>Admin · Midtown Business Conclave</title>
</svelte:head>

<div class="admin">
	<header class="topbar">
		<div class="brand">
			<img src="/poster/mbc.webp" alt="" width="1655" height="747" />
			<div>
				<strong>Organiser dashboard</strong>
				<span>Midtown Business Conclave 2026</span>
			</div>
		</div>
		<div class="who">
			<span>{data.admin?.email}</span>
			<form method="post" action="?/logout" use:enhance>
				<button type="submit" class="btn btn-ghost small"><LogOut size={16} aria-hidden="true" /> Sign out</button>
			</form>
		</div>
	</header>

	<main class="wrap">
		{#if !data.configured.database || !data.configured.storage}
			<div class="banner warn" role="status">
				<CircleAlert size={18} aria-hidden="true" />
				<p>
					{#if data.available}
						Demo mode: Neon or R2 is not configured, so registrations are kept in memory and disappear when the
						dev server restarts.
					{:else}
						The database is not configured. Set <code>DATABASE_URL</code> and the <code>R2_*</code> variables.
					{/if}
				</p>
			</div>
		{/if}
		{#if !data.configured.email}
			<div class="banner warn" role="status">
				<Mail size={18} aria-hidden="true" />
				<p>
					Email is not configured: tickets are not sent until <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> are set.
					In development they are printed in the terminal instead.
				</p>
			</div>
		{/if}

		{#if form?.message}
			<div class="banner error" role="alert">
				<CircleAlert size={18} aria-hidden="true" />
				<p>{form.message}</p>
			</div>
		{:else if form?.success}
			<div class="banner ok" role="status">
				<BadgeCheck size={18} aria-hidden="true" />
				<p>{form.success}</p>
			</div>
		{/if}

		{#if data.available}
			<section class="stats" aria-label="Summary">
				<a class="stat attention" href="?status=payment_submitted">
					<span class="label"><Clock size={16} aria-hidden="true" /> Needs review</span>
					<strong>{data.stats.counts.payment_submitted}</strong>
					<span class="hint">UPI IDs to check</span>
				</a>
				<a class="stat" href="?status=pending_payment">
					<span class="label"><QrCode size={16} aria-hidden="true" /> Awaiting payment</span>
					<strong>{data.stats.counts.pending_payment}</strong>
					<span class="hint">Registered, not yet paid</span>
				</a>
				<a class="stat" href="?status=paid">
					<span class="label"><BadgeCheck size={16} aria-hidden="true" /> Tickets confirmed</span>
					<strong>{data.stats.counts.paid}</strong>
					<span class="hint">of {total} registrations</span>
				</a>
				<div class="stat">
					<span class="label"><IndianRupee size={16} aria-hidden="true" /> Collected</span>
					<strong>{formatRupees(data.stats.collectedRupees)}</strong>
					<span class="hint">Verified payments</span>
				</div>
			</section>

			<div class="layout">
				<section class="queue" aria-labelledby="queue-title">
					<div class="queue-head">
						<h1 id="queue-title">Registrations</h1>
						<form method="get" class="search" role="search">
							<input type="hidden" name="status" value={data.filter.status} />
							<Search size={16} aria-hidden="true" />
							<input
								type="search"
								name="q"
								value={data.filter.q}
								placeholder="Name, email, code or UPI ID"
								aria-label="Search registrations"
							/>
						</form>
					</div>

					<nav class="tabs" aria-label="Filter by status">
						{#each TABS as tab (tab.value)}
							<a
								href="?status={tab.value}{data.filter.q ? `&q=${encodeURIComponent(data.filter.q)}` : ''}"
								aria-current={data.filter.status === tab.value ? 'page' : undefined}
							>
								{tab.label}
								<span class="count">{tab.value === 'all' ? total : data.stats.counts[tab.value]}</span>
							</a>
						{/each}
					</nav>

					{#if data.registrations.length === 0}
						<div class="empty">
							<p>
								{data.filter.q ? `No registrations match “${data.filter.q}”.` : 'Nothing here yet.'}
							</p>
						</div>
					{:else}
						<ul class="rows">
							{#each data.registrations as r (r.id)}
								<li class="row" class:highlight={form?.id === r.id}>
									<div class="person">
										<img class="photo" src={media(r.photoKey)} alt="" width="56" height="56" loading="lazy" />
										<div class="who-col">
											<strong>{r.fullName}</strong>
											<span>{r.designation} · {r.companyName}</span>
											<span class="muted">{r.email} · {r.phone}</span>
										</div>
										<span class="status {r.status}">{STATUS_LABEL[r.status as Status]}</span>
									</div>

									<dl class="payment">
										<div>
											<dt>Registration</dt>
											<dd class="mono">{r.code}</dd>
										</div>
										<div>
											<dt>Amount</dt>
											<dd>{formatRupees(r.amountRupees)}</dd>
										</div>
										<div>
											<dt>UPI transaction ID</dt>
											<dd>
												{#if r.upiTxnId}
													<button type="button" class="copy mono" onclick={() => copy(r.upiTxnId!, r.id)} title="Copy">
														{r.upiTxnId}
														<Copy size={14} aria-hidden="true" />
														<span class="visually-hidden">Copy</span>
													</button>
													{#if copied === r.id}<span class="copied">Copied</span>{/if}
												{:else}
													<span class="muted">Not entered yet</span>
												{/if}
											</dd>
										</div>
										<div>
											<dt>{r.paymentSubmittedAt ? 'Submitted' : 'Registered'}</dt>
											<dd>{fmt(r.paymentSubmittedAt ?? r.createdAt)}</dd>
										</div>
									</dl>

									{#if r.status === 'paid'}
										<div class="actions">
											<p class="note">
												<BadgeCheck size={16} aria-hidden="true" />
												Paid · confirmed {fmt(r.reviewedAt)}
												{#if r.ticketEmailedAt}· ticket emailed {fmt(r.ticketEmailedAt)}{:else}· <strong>ticket not emailed</strong>{/if}
											</p>
											<form method="post" action="?/resend" use:enhance={rowAction(r.id)}>
												<input type="hidden" name="id" value={r.id} />
												<button class="btn btn-secondary small" disabled={busy === r.id}>
													{#if busy === r.id}<LoaderCircle size={16} class="spin" aria-hidden="true" /> Sending…{:else}<Send
															size={16}
															aria-hidden="true"
														/> Resend ticket{/if}
												</button>
											</form>
										</div>
									{:else}
										{#if r.status === 'rejected' && r.rejectionReason}
											<p class="note rejected"><X size={16} aria-hidden="true" /> Rejected: {r.rejectionReason}</p>
										{/if}
										<div class="actions">
											{#if confirming === r.id}
												<form method="post" action="?/markPaid" use:enhance={rowAction(r.id)} class="confirm">
													<input type="hidden" name="id" value={r.id} />
													<span>
														Received {formatRupees(r.amountRupees)}{r.upiTxnId ? ` with UPI ID ${r.upiTxnId}` : ''}? This emails the ticket.
													</span>
													<button class="btn btn-paid small" disabled={busy === r.id}>
														{#if busy === r.id}<LoaderCircle size={16} class="spin" aria-hidden="true" /> Confirming…{:else}Yes, mark as paid{/if}
													</button>
													<button type="button" class="btn btn-ghost small" onclick={() => (confirming = null)}>Cancel</button>
												</form>
											{:else if rejecting === r.id}
												<form method="post" action="?/reject" use:enhance={rowAction(r.id)} class="confirm reject-form">
													<input type="hidden" name="id" value={r.id} />
													<label>
														<span>Reason (sent to the delegate)</span>
														<input
															name="reason"
															maxlength="300"
															placeholder="e.g. No payment found with this transaction ID"
														/>
													</label>
													<button class="btn btn-danger small" disabled={busy === r.id}>
														{#if busy === r.id}<LoaderCircle size={16} class="spin" aria-hidden="true" /> Rejecting…{:else}Reject payment{/if}
													</button>
													<button type="button" class="btn btn-ghost small" onclick={() => (rejecting = null)}>Cancel</button>
												</form>
											{:else}
												<button
													type="button"
													class="btn btn-paid small"
													onclick={() => {
														confirming = r.id;
														rejecting = null;
													}}
												>
													<BadgeCheck size={16} aria-hidden="true" /> Mark as paid
												</button>
												{#if r.status !== 'rejected'}
													<button
														type="button"
														class="btn btn-ghost small danger-text"
														onclick={() => {
															rejecting = r.id;
															confirming = null;
														}}
													>
														<X size={16} aria-hidden="true" /> Reject
													</button>
												{/if}
											{/if}
										</div>
									{/if}

									<details class="more">
										<summary>Poster and details</summary>
										<div class="more-body">
											{#if r.posterKey}
												<a href={media(r.posterKey)} target="_blank" rel="noopener" class="poster">
													<img src={media(r.posterKey)} alt="Poster for {r.fullName}" loading="lazy" width="2160" height="3840" />
												</a>
											{/if}
											<dl class="facts">
																								<div><dt>Industry</dt><dd>{r.industry}</dd></div>
												<div><dt>About the business</dt><dd>{r.about ?? '—'}</dd></div>
												<div><dt>Website</dt><dd>{r.website ?? '—'}</dd></div>
												<div><dt>Travelling from</dt><dd>{r.city}</dd></div>
												<div><dt>Interested in</dt><dd>{r.interests.map(interestLabel).join(', ')}</dd></div>
																								<div><dt>Heard from</dt><dd>{r.heardFrom ?? '—'}</dd></div>
												<div><dt>WhatsApp updates</dt><dd>{r.whatsappUpdates ? 'Yes' : 'No'}</dd></div>
												{#if r.reviewedBy}<div><dt>Reviewed by</dt><dd>{r.reviewedBy}</dd></div>{/if}
											</dl>
										</div>
									</details>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<aside class="settings" aria-labelledby="settings-title">
					<h2 id="settings-title">Ticket and payment QR</h2>
					<p class="muted">Used for new registrations. Registrations already made keep the price they were shown.</p>

					<form
						method="post"
						action="?/savePayment"
						use:enhance={() => {
							savingSettings = true;
							return async ({ update }) => {
								await update({ reset: false });
								savingSettings = false;
							};
						}}
					>
						<TextField
							id="priceRupees"
							label="Ticket price (₹)"
							type="number"
							inputmode="decimal"
							bind:value={price}
							required
							error={settingsErrors.priceRupees}
						/>
						<TextField
							id="payeeName"
							label="Payee name"
							bind:value={payeeName}
							required
							help="As shown on the UPI account."
							error={settingsErrors.payeeName}
						/>
						<TextField
							id="vpa"
							label="UPI ID"
							bind:value={vpa}
							required
							autocomplete="off"
							placeholder="name@okbank"
							error={settingsErrors.vpa}
						/>

						<div class="qr-preview">
							<UpiQr link={previewLink} label="Preview of the payment QR" />
							<p class="muted">
								Preview · {formatRupees(Number(price) || 0)} to {payeeName || '—'}. Each delegate's QR also carries their
								registration number in the payment note.
							</p>
						</div>

						<div class="settings-actions">
							<button type="submit" class="btn btn-primary" disabled={savingSettings}>
								{#if savingSettings}<LoaderCircle size={18} class="spin" aria-hidden="true" /> Saving…{:else}Save payment settings{/if}
							</button>
							<button
								type="button"
								class="btn btn-ghost small"
								onclick={() => {
									price = String(data.settings.priceRupees);
									vpa = data.settings.vpa;
									payeeName = data.settings.payeeName;
								}}
							>
								<RotateCcw size={16} aria-hidden="true" /> Undo changes
							</button>
						</div>
					</form>
				</aside>
			</div>
		{/if}
	</main>
</div>

<style>
	.admin {
		min-height: 100svh;
		background: var(--mist);
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) clamp(var(--space-4), 3vw, var(--space-8));
		background: #0c1730;
		color: var(--on-ink-soft);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.brand img {
		width: 92px;
		height: auto;
	}

	.brand div {
		display: grid;
		line-height: 1.3;
	}

	.brand strong {
		color: var(--on-ink);
		font-weight: 600;
	}

	.brand span,
	.who span {
		font: var(--text-caption);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.who :global(.btn-ghost) {
		color: var(--on-ink);
	}

	.who :global(.btn-ghost:hover) {
		background: rgb(255 255 255 / 0.08);
	}

	.wrap {
		display: grid;
		gap: var(--space-6);
		max-width: 1400px;
		margin-inline: auto;
		padding: var(--space-6) clamp(var(--space-4), 3vw, var(--space-8)) var(--space-16);
	}

	.banner {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
	}

	.banner :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.banner p {
		font: var(--text-caption);
		color: var(--charcoal);
	}

	.banner.warn {
		background: var(--warning-tint);
		color: var(--warning);
	}

	.banner.error {
		background: var(--danger-tint);
		color: var(--danger);
	}

	.banner.ok {
		background: var(--success-tint);
		color: var(--success);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.stat {
		display: grid;
		gap: 4px;
		padding: var(--space-4) var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: inherit;
		text-decoration: none;
	}

	a.stat:hover {
		border-color: var(--control-border);
	}

	.stat .label {
		display: flex;
		align-items: center;
		gap: 6px;
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.stat strong {
		font: 600 28px/1.2 var(--font-sans);
		color: var(--charcoal);
		font-variant-numeric: tabular-nums;
	}

	.stat.attention strong {
		color: var(--warning);
	}

	.stat .hint {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: var(--space-6);
		align-items: start;
	}

	.queue,
	.settings {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		background: var(--white);
	}

	.settings {
		position: sticky;
		top: 88px;
	}

	.queue-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	h1,
	h2 {
		font: 600 20px/1.3 var(--font-sans);
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: min(100%, 300px);
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		color: var(--text-supporting);
	}

	.search:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.search input {
		flex: 1;
		min-height: 40px;
		border: 0;
		background: none;
		color: var(--charcoal);
		font-size: 15px;
	}

	.search input:focus {
		outline: none;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--rule);
	}

	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-body);
		font: var(--text-ui);
		font-size: 14px;
		text-decoration: none;
	}

	.tabs a:hover {
		background: var(--mist);
	}

	.tabs a[aria-current='page'] {
		background: var(--gold-tint);
		color: var(--charcoal);
		box-shadow: inset 0 -2px 0 var(--gold-ink);
	}

	.count {
		min-width: 22px;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--mist);
		font-size: 12px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.empty {
		padding: var(--space-12) var(--space-4);
		text-align: center;
		color: var(--text-supporting);
	}

	.rows {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		transition: border-color var(--duration-disclosure) var(--ease-out);
	}

	.row.highlight {
		border-color: var(--gold-ink);
	}

	.person {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr) auto;
		gap: var(--space-4);
		align-items: center;
	}

	.photo {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
		background: var(--mist);
	}

	.who-col {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.who-col strong {
		color: var(--charcoal);
	}

	.who-col span {
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--text-supporting);
		font: var(--text-caption);
	}

	.status {
		padding: 3px 10px;
		border-radius: 999px;
		font: 600 12px/1.5 var(--font-sans);
		white-space: nowrap;
	}

	.status.payment_submitted {
		background: var(--warning-tint);
		color: var(--warning);
	}

	.status.pending_payment {
		background: var(--mist);
		color: var(--text-supporting);
	}

	.status.paid {
		background: var(--success-tint);
		color: var(--success);
	}

	.status.rejected {
		background: var(--danger-tint);
		color: var(--danger);
	}

	.payment {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-3) var(--space-4);
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--paper);
	}

	dt {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	dd {
		margin: 0;
		color: var(--charcoal);
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		letter-spacing: 0.02em;
	}

	.copy {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--charcoal);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.copy :global(svg) {
		color: var(--gold-ink);
	}

	.copied {
		margin-left: var(--space-2);
		font: var(--text-caption);
		color: var(--success);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-right: auto;
		font: var(--text-caption);
		color: var(--success);
	}

	.note.rejected {
		color: var(--danger);
	}

	.confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
	}

	.confirm > span {
		flex: 1 1 260px;
		font: var(--text-caption);
		color: var(--charcoal);
	}

	.reject-form {
		background: var(--danger-tint);
	}

	.reject-form label {
		display: grid;
		gap: 4px;
		flex: 1 1 280px;
		font: var(--text-caption);
		color: var(--charcoal);
	}

	.reject-form input {
		min-height: 40px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		font-size: 14px;
	}

	.small {
		min-height: 38px;
		padding-inline: var(--space-4);
		font-size: 14px;
	}

	:global(.btn-paid) {
		background: var(--success);
		color: var(--white);
	}

	:global(.btn-paid:hover:not(:disabled)) {
		background: #185759;
	}

	:global(.btn-danger) {
		background: var(--danger);
		color: var(--white);
	}

	.danger-text {
		color: var(--danger);
	}

	.more summary {
		cursor: pointer;
		font: var(--text-caption);
		font-weight: 600;
		color: var(--gold-ink);
	}

	.more-body {
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr);
		gap: var(--space-4);
		margin-top: var(--space-3);
	}

	.poster img {
		width: 140px;
		height: auto;
		border-radius: 6px;
		box-shadow: 0 0 0 1px var(--rule);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2) var(--space-4);
		margin: 0;
		align-content: start;
	}

	.settings form {
		display: grid;
		gap: var(--space-4);
	}

	.qr-preview {
		display: grid;
		gap: var(--space-2);
		justify-items: center;
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: #0c1730;
	}

	.qr-preview :global(.qr) {
		max-width: 220px;
	}

	.qr-preview .muted {
		color: var(--on-ink-soft);
		text-align: center;
	}

	.settings-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	code {
		font-size: 12px;
	}

	:global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.settings {
			position: static;
			order: -1;
		}

		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.who span {
			display: none;
		}

		.brand span {
			display: none;
		}

		.person {
			grid-template-columns: 44px minmax(0, 1fr);
		}

		.photo {
			width: 44px;
			height: 44px;
		}

		.status {
			grid-column: 1 / -1;
			justify-self: start;
		}

		.payment,
		.facts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.more-body {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
