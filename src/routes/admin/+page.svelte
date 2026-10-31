<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		BadgeCheck,
		CheckCheck,
		ChevronDown,
		ChevronsDownUp,
		ChevronsUpDown,
		CircleAlert,
		Clock,
		Copy,
		IndianRupee,
		ListChecks,
		LoaderCircle,
		Mail,
		MailCheck,
		MailWarning,
		Mails,
		MailX,
		QrCode,
		RefreshCw,
		Search,
		Send,
		X
	} from '@lucide/svelte';
	import { INTERESTS } from '#lib/registration.ts';
	import { formatRupees } from '#lib/payment.ts';

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

	type EmailState = 'not_sent' | 'sent' | 'delivered' | 'failed';

	const EMAIL_TABS: { value: EmailState | 'all'; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'failed', label: 'Failed' },
		{ value: 'not_sent', label: 'Not sent' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'delivered', label: 'Delivered' }
	];

	const EMAIL_LABEL: Record<EmailState, string> = {
		not_sent: 'Not sent',
		sent: 'Sent',
		delivered: 'Delivered',
		failed: 'Failed'
	};

	/** Resend events, in words for the line under the email pill. */
	const EVENT_LABEL: Record<string, string> = {
		bounced: 'Bounced',
		complained: 'Marked as spam',
		failed: 'Could not be sent',
		suppressed: 'Address suppressed',
		canceled: 'Cancelled',
		delivery_delayed: 'Delivery delayed'
	};

	const emailState = (r: { ticketEmailedAt: string | null; ticketEmailStatus: string | null }): EmailState =>
		!r.ticketEmailedAt ? 'not_sent' : ((r.ticketEmailStatus as EmailState | null) ?? 'sent');

	const open = new SvelteSet<string>();
	const selected = new SvelteSet<string>();
	let selecting = $state(false);
	let rejecting = $state<string | null>(null);
	// Which control is working: a row id, 'bulk', 'send', 'check' or 'resendFailed'.
	let busy = $state<string | null>(null);
	let copied = $state<string | null>(null);

	const registrations = $derived(data.available ? data.registrations : []);
	const total = $derived(data.available ? Object.values(data.stats.counts).reduce((a, b) => a + b, 0) : 0);
	const toSend = $derived(data.available ? data.stats.ticketsToSend : 0);
	const failedEmails = $derived(data.available ? data.stats.email.failed : 0);
	const inFlight = $derived(data.available ? data.stats.email.sent : 0);
	const paidTotal = $derived(data.available ? data.stats.counts.paid : 0);
	const allOpen = $derived(registrations.length > 0 && registrations.every((r) => open.has(r.id)));

	// Only unpaid registrations can be selected for "Mark as paid".
	const selectable = $derived(registrations.filter((r) => r.status !== 'paid'));
	const allSelected = $derived(selectable.length > 0 && selectable.every((r) => selected.has(r.id)));
	const someSelected = $derived(selected.size > 0 && !allSelected);
	const columns = $derived(selecting ? 9 : 8);

	// Drop selections that left the list (filtered away or now paid).
	$effect(() => {
		const ids = new Set(selectable.map((r) => r.id));
		for (const id of selected) if (!ids.has(id)) selected.delete(id);
	});

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '');
	const interestLabel = (v: string) => INTERESTS.find((i) => i.value === v)?.label ?? v;
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const media = (key: string | null) => (key ? `/admin/media/${key}` : '');

	// Actions keep the current tab and search, so the list does not jump after a click.
	const keep = $derived(
		data.available
			? `&status=${data.filter.status}${data.filter.email !== 'all' ? `&email=${data.filter.email}` : ''}${data.filter.q ? `&q=${encodeURIComponent(data.filter.q)}` : ''}`
			: ''
	);
	const act = (name: string) => `?/${name}${keep}`;

	function toggle(id: string) {
		if (open.has(id)) open.delete(id);
		else open.add(id);
	}

	function toggleAll() {
		if (allOpen) open.clear();
		else for (const r of registrations) open.add(r.id);
	}

	function toggleSelecting() {
		selecting = !selecting;
		if (!selecting) selected.clear();
	}

	function selectAll() {
		if (allSelected) selected.clear();
		else for (const r of selectable) selected.add(r.id);
	}

	function pick(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function startReject(id: string) {
		rejecting = rejecting === id ? null : id;
		open.add(id);
	}

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = copied === key ? null : copied), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	const search = $derived(data.available && data.filter.q ? `&q=${encodeURIComponent(data.filter.q)}` : '');
	const emailHref = (value: EmailState | 'all') =>
		value === 'all'
			? `?status=${data.available ? data.filter.status : 'all'}${search}`
			: `?status=paid&email=${value}${search}`;

	// Opening the dashboard quietly asks Resend about emails still on their way.
	onMount(() => {
		if (!inFlight) return;
		busy = 'check';
		fetch(act('checkDelivery'), {
			method: 'POST',
			body: new FormData(),
			headers: { 'x-sveltekit-action': 'true' }
		})
			.then(() => invalidateAll())
			.catch(() => {})
			.finally(() => {
				if (busy === 'check') busy = null;
			});
	});

	type Update = (o?: { reset?: boolean }) => Promise<void>;

	function working(key: string, after?: (ok: boolean) => void) {
		return () => {
			busy = key;
			return async ({ result, update }: { result: { type: string }; update: Update }) => {
				await update({ reset: false });
				busy = null;
				rejecting = null;
				after?.(result.type === 'success');
			};
		};
	}
</script>

<svelte:head>
	<title>Dashboard · Admin · Midtown Business Conclave</title>
</svelte:head>

{#if !data.configured.database || !data.configured.storage}
	<div class="banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>
			{#if data.available}
				Demo mode: Neon or R2 is not configured, so registrations are kept in memory and disappear when the dev
				server restarts.
			{:else}
				The database is not configured. Set <code>DATABASE_URL</code> and the <code>R2_*</code> variables.
			{/if}
		</p>
	</div>
{/if}
{#if !data.configured.email}
	<div class="banner warn" role="status">
		<Mail size={16} aria-hidden="true" />
		<p>
			Email is not configured: tickets are not sent until <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> are set.
			In development they are printed in the terminal instead.
		</p>
	</div>
{/if}

{#if form?.message}
	<div class="banner error" role="alert">
		<CircleAlert size={16} aria-hidden="true" />
		<p>{form.message}</p>
	</div>
{:else if form?.success}
	<div class="banner ok" role="status">
		<BadgeCheck size={16} aria-hidden="true" />
		<p>{form.success}</p>
	</div>
{/if}

{#if data.available}
	<section class="stats" aria-label="Summary">
		<a class="stat attention" href="?status=payment_submitted">
			<span class="label"><Clock size={14} aria-hidden="true" /> Needs review</span>
			<strong>{data.stats.counts.payment_submitted}</strong>
			<span class="hint">UPI IDs to check</span>
		</a>
		<a class="stat" href="?status=pending_payment">
			<span class="label"><QrCode size={14} aria-hidden="true" /> Awaiting payment</span>
			<strong>{data.stats.counts.pending_payment}</strong>
			<span class="hint">Registered, not yet paid</span>
		</a>
		<a class="stat" href="?status=paid">
			<span class="label"><BadgeCheck size={14} aria-hidden="true" /> Paid</span>
			<strong>{data.stats.counts.paid}</strong>
			<span class="hint">of {total} registrations</span>
		</a>
		<div class="stat">
			<span class="label"><IndianRupee size={14} aria-hidden="true" /> Collected</span>
			<strong>{formatRupees(data.stats.collectedRupees)}</strong>
			<span class="hint">Verified payments</span>
		</div>
	</section>

	<section class="panel" aria-labelledby="queue-title">
		<div class="panel-head">
			<h1 id="queue-title">Participants</h1>
			<div class="head-actions">
				<form method="get" class="search" role="search">
					<input type="hidden" name="status" value={data.filter.status} />
					<Search size={15} aria-hidden="true" />
					<input
						type="search"
						name="q"
						value={data.filter.q}
						placeholder="Name, email, code or UPI ID"
						aria-label="Search registrations"
					/>
				</form>
				<form method="post" action={act('checkDelivery')} use:enhance={working('check')}>
					<button
						type="submit"
						class="btn btn-ghost btn-sm"
						disabled={busy === 'check' || paidTotal === 0}
						title="Ask Resend which ticket emails were delivered and which bounced"
					>
						<RefreshCw size={15} class={busy === 'check' ? 'spin' : ''} aria-hidden="true" />
						{busy === 'check' ? 'Checking delivery…' : 'Check delivery'}
					</button>
				</form>
				{#if failedEmails > 0}
					<form method="post" action={act('resendFailed')} use:enhance={working('resendFailed')}>
						<button type="submit" class="btn btn-sm failed-btn" disabled={busy === 'resendFailed'}>
							{#if busy === 'resendFailed'}
								<LoaderCircle size={15} class="spin" aria-hidden="true" /> Resending…
							{:else}
								<MailWarning size={15} aria-hidden="true" /> Resend {plural(failedEmails, 'failed email')}
							{/if}
						</button>
					</form>
				{/if}
				<form method="post" action={act('sendTickets')} use:enhance={working('send')}>
					<button
						type="submit"
						class="btn btn-sm send-btn"
						class:has-queue={toSend > 0}
						disabled={toSend === 0 || busy === 'send'}
						title={toSend ? 'Email the ticket to every delegate marked as paid' : 'Every paid delegate has their ticket'}
					>
						{#if busy === 'send'}
							<LoaderCircle size={15} class="spin" aria-hidden="true" /> Sending {plural(toSend, 'email')}…
						{:else if toSend > 0}
							<Mails size={15} aria-hidden="true" />
							<span class="badge">{toSend}</span>
							{toSend === 1 ? 'email' : 'emails'} waiting to be sent
						{:else}
							<MailCheck size={15} aria-hidden="true" /> All tickets sent
						{/if}
					</button>
				</form>
			</div>
		</div>

		<div class="toolbar">
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
			<div class="tool-buttons">
				{#if selectable.length > 0}
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						class:active={selecting}
						aria-pressed={selecting}
						onclick={toggleSelecting}
					>
						<ListChecks size={15} aria-hidden="true" />
						{selecting ? 'Done selecting' : 'Select'}
					</button>
				{/if}
				{#if registrations.length > 1}
					<button type="button" class="btn btn-ghost btn-sm" onclick={toggleAll}>
						{#if allOpen}
							<ChevronsDownUp size={15} aria-hidden="true" /> Collapse all
						{:else}
							<ChevronsUpDown size={15} aria-hidden="true" /> Expand all
						{/if}
					</button>
				{/if}
			</div>
		</div>

		<!-- Only paid delegates get a ticket email, so the filter belongs to Paid and All. -->
		{#if paidTotal > 0 && (data.filter.status === 'paid' || data.filter.status === 'all')}
			<nav class="email-tabs" aria-label="Filter by ticket email">
				<span class="email-tabs-label">Ticket email</span>
				{#each EMAIL_TABS as tab (tab.value)}
					<a
						href={emailHref(tab.value)}
						class="email-tab {tab.value}"
						aria-current={data.filter.email === tab.value ? 'page' : undefined}
					>
						{tab.label}
						<span class="count">{tab.value === 'all' ? paidTotal : data.stats.email[tab.value]}</span>
					</a>
				{/each}
			</nav>
		{/if}

		{#if selecting}
			<div class="bulk-bar" transition:slide={{ duration: 180, easing: cubicOut }}>
				<span>
					{#if selected.size}
						<strong>{selected.size}</strong> selected
					{:else}
						Tick the registrations you have verified.
					{/if}
				</span>
				<form
					method="post"
					action={act('markPaidMany')}
					use:enhance={working('bulk', (ok) => {
						if (ok) {
							selected.clear();
							selecting = false;
						}
					})}
				>
					{#each [...selected] as id (id)}<input type="hidden" name="ids" value={id} />{/each}
					<button type="submit" class="btn btn-paid btn-sm" disabled={selected.size === 0 || busy === 'bulk'}>
						{#if busy === 'bulk'}
							<LoaderCircle size={15} class="spin" aria-hidden="true" /> Marking…
						{:else}
							<CheckCheck size={15} aria-hidden="true" /> Mark {selected.size || ''} as paid
						{/if}
					</button>
				</form>
				{#if selected.size}
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => selected.clear()}>Clear</button>
				{/if}
			</div>
		{/if}

		{#if registrations.length === 0}
			<div class="empty">
				<p>{data.filter.q ? `No registrations match “${data.filter.q}”.` : 'Nothing here yet.'}</p>
			</div>
		{:else}
			<div class="table-wrap">
				<table class="grid">
					<thead>
						<tr>
							{#if selecting}
								<th class="col-check">
									<input
										type="checkbox"
										checked={allSelected}
										indeterminate={someSelected}
										onchange={selectAll}
										aria-label="Select all unpaid registrations"
									/>
								</th>
							{/if}
							<th class="col-toggle"><span class="visually-hidden">Details</span></th>
							<th>Delegate</th>
							<th>Email</th>
							<th>UPI transaction ID</th>
							<th class="col-amount num">Amount</th>
							<th>Status</th>
							<th>Ticket email</th>
							<th class="col-actions"><span class="visually-hidden">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each registrations as r (r.id)}
							{@const isOpen = open.has(r.id)}
							{@const isPicked = selected.has(r.id)}
							<tr class="row" class:open={isOpen} class:picked={isPicked} class:highlight={form?.id === r.id}>
								{#if selecting}
									<td class="col-check">
										{#if r.status !== 'paid'}
											<input
												type="checkbox"
												checked={isPicked}
												onchange={() => pick(r.id)}
												aria-label="Select {r.fullName}"
											/>
										{/if}
									</td>
								{/if}
								<td class="col-toggle">
									<button
										type="button"
										class="toggle"
										aria-expanded={isOpen}
										aria-controls="details-{r.id}"
										onclick={() => toggle(r.id)}
									>
										<ChevronDown size={16} aria-hidden="true" />
										<span class="visually-hidden">{isOpen ? 'Hide' : 'Show'} details for {r.fullName}</span>
									</button>
								</td>
								<td class="delegate">
									<div class="person">
										<img class="photo" src={media(r.photoKey)} alt="" width="34" height="34" loading="lazy" />
										<div class="who">
											<strong>{r.fullName}</strong>
											<span class="mono code">{r.code}</span>
										</div>
									</div>
								</td>
								<td class="email"><a href="mailto:{r.email}">{r.email}</a></td>
								<td class="utr">
									{#if r.upiTxnId}
										<button type="button" class="copy mono" onclick={() => copy(r.upiTxnId!, r.id)} title="Copy">
											{r.upiTxnId}
											<Copy size={13} aria-hidden="true" />
											<span class="visually-hidden">Copy</span>
										</button>
										{#if copied === r.id}<span class="copied">Copied</span>{/if}
									{:else}
										<span class="muted">Not entered</span>
									{/if}
								</td>
								<td class="col-amount num">{formatRupees(r.amountRupees)}</td>
								<td>
									<span class="status {r.status}">{STATUS_LABEL[r.status as Status]}</span>
								</td>
								<td class="mail">
									{#if r.status === 'paid'}
										{@const state = emailState(r)}
										<span class="mail-pill {state}">
											<span class="dot" aria-hidden="true"></span>
											{EMAIL_LABEL[state]}
										</span>
										<span class="mail-detail">
											{#if state === 'not_sent'}
												Waiting to send
											{:else if state === 'failed'}
												{EVENT_LABEL[r.ticketEmailEvent ?? ''] ?? 'Not delivered'} · {fmt(r.ticketEmailedAt)}
											{:else if r.ticketEmailEvent === 'delivery_delayed'}
												Delivery delayed · {fmt(r.ticketEmailedAt)}
											{:else}
												{fmt(r.ticketEmailedAt)}
											{/if}
										</span>
									{:else}
										<span class="muted">—</span>
									{/if}
								</td>
								<td class="col-actions">
									<div class="row-actions">
										{#if r.status === 'paid'}
											{@const state = emailState(r)}
											<form method="post" action={act('resend')} use:enhance={working(r.id)}>
												<input type="hidden" name="id" value={r.id} />
												<button
													class="btn btn-ghost btn-sm"
													class:danger-text={state === 'failed'}
													disabled={busy === r.id}
													title={state === 'not_sent'
														? 'Send this ticket now'
														: state === 'failed'
															? 'The last email did not arrive: send the ticket again'
															: 'Email the ticket again'}
												>
													{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" />{:else if state === 'failed'}<MailX
															size={15}
															aria-hidden="true"
														/>{:else}<Send size={15} aria-hidden="true" />{/if}
													<span class="action-label">{state === 'not_sent' ? 'Send now' : 'Resend'}</span>
												</button>
											</form>
										{:else}
											<form method="post" action={act('markPaid')} use:enhance={working(r.id)}>
												<input type="hidden" name="id" value={r.id} />
												<button class="btn btn-paid btn-sm" disabled={busy === r.id}>
													{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" />{:else}<BadgeCheck
															size={15}
															aria-hidden="true"
														/>{/if}
													<span class="action-label">Mark paid</span>
												</button>
											</form>
											{#if r.status !== 'rejected'}
												<button
													type="button"
													class="btn btn-ghost btn-sm danger-text"
													onclick={() => startReject(r.id)}
													title="Reject this payment"
												>
													<X size={15} aria-hidden="true" /> <span class="action-label">Reject</span>
												</button>
											{/if}
										{/if}
									</div>
								</td>
							</tr>
							{#if isOpen}
								<tr class="details" id="details-{r.id}">
									<td colspan={columns}>
										<div class="details-slide" transition:slide={{ duration: 220, easing: cubicOut }}>
											<div class="details-body">
												{#if r.posterKey}
													<a href={media(r.posterKey)} target="_blank" rel="noopener" class="poster">
														<img
															src={media(r.posterKey)}
															alt="Poster for {r.fullName}"
															loading="lazy"
															width="2160"
															height="3840"
														/>
													</a>
												{/if}

												<div class="details-main">
													{#if rejecting === r.id}
														<form method="post" action={act('reject')} use:enhance={working(r.id)} class="reject-form">
															<input type="hidden" name="id" value={r.id} />
															<label>
																<span>Reason (emailed to the delegate)</span>
																<input
																	name="reason"
																	maxlength="300"
																	placeholder="e.g. No payment found with this transaction ID"
																/>
															</label>
															<button class="btn btn-danger btn-sm" disabled={busy === r.id}>
																{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" /> Rejecting…{:else}Reject
																	payment{/if}
															</button>
															<button type="button" class="btn btn-ghost btn-sm" onclick={() => (rejecting = null)}>Cancel</button>
														</form>
													{/if}

													{#if r.status === 'paid'}
														<p class="note">
															<BadgeCheck size={14} aria-hidden="true" />
															Confirmed {fmt(r.reviewedAt)}{r.reviewedBy ? ` by ${r.reviewedBy}` : ''}
															{#if r.ticketEmailedAt}· ticket emailed {fmt(r.ticketEmailedAt)}{#if r.ticketEmailEvent}
																({r.ticketEmailEvent.replace(/_/g, ' ')}{r.ticketEmailCheckedAt
																	? `, checked ${fmt(r.ticketEmailCheckedAt)}`
																	: ''}){/if}{:else}· ticket not emailed yet{/if}
														</p>
													{:else if r.status === 'rejected'}
														<p class="note rejected">
															<X size={14} aria-hidden="true" />
															Rejected {fmt(r.reviewedAt)}{r.reviewedBy ? ` by ${r.reviewedBy}` : ''}{r.rejectionReason
																? `: ${r.rejectionReason}`
																: ''}
														</p>
													{/if}

													<dl class="facts">
														<div><dt>Phone</dt><dd><a href="tel:{r.phone}">{r.phone}</a></dd></div>
														<div><dt>Designation</dt><dd>{r.designation}</dd></div>
														<div><dt>Company</dt><dd>{r.companyName}</dd></div>
														<div><dt>Industry</dt><dd>{r.industry}</dd></div>
														<div><dt>About the business</dt><dd>{r.about ?? '—'}</dd></div>
														<div>
															<dt>Website</dt>
															<dd>
																{#if r.website}<a href={r.website} target="_blank" rel="noopener">{r.website}</a>{:else}—{/if}
															</dd>
														</div>
														<div><dt>Travelling from</dt><dd>{r.city}</dd></div>
														<div><dt>Interested in</dt><dd>{r.interests.map(interestLabel).join(', ')}</dd></div>
														<div><dt>Heard from</dt><dd>{r.heardFrom ?? '—'}</dd></div>
														<div><dt>WhatsApp updates</dt><dd>{r.whatsappUpdates ? 'Yes' : 'No'}</dd></div>
														<div><dt>Registered</dt><dd>{fmt(r.createdAt)}</dd></div>
														{#if r.paymentSubmittedAt}
															<div><dt>UPI ID submitted</dt><dd>{fmt(r.paymentSubmittedAt)}</dd></div>
														{/if}
													</dl>
												</div>
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
	.banner {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: 13px;
	}

	.banner :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.banner p {
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
		gap: var(--space-3);
	}

	.stat {
		display: grid;
		gap: 2px;
		padding: var(--space-3) var(--space-4);
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
		font-size: 12px;
		color: var(--text-supporting);
	}

	.stat strong {
		font: 600 22px/1.25 var(--font-sans);
		color: var(--charcoal);
		font-variant-numeric: tabular-nums;
	}

	.stat.attention strong {
		color: var(--warning);
	}

	.stat .hint {
		font-size: 12px;
		color: var(--text-supporting);
	}

	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-6) var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
		font-size: 14px;
	}

	.panel-head,
	.toolbar,
	.head-actions,
	.tool-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.panel-head,
	.toolbar {
		justify-content: space-between;
	}

	.toolbar {
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--rule);
	}

	h1 {
		font: 600 18px/1.3 var(--font-sans);
	}

	.head-actions {
		flex-wrap: nowrap;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 280px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		color: var(--text-supporting);
	}

	.search:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.search input {
		flex: 1;
		min-height: 34px;
		border: 0;
		background: none;
		color: var(--charcoal);
		font-size: 14px;
	}

	.search input:focus {
		outline: none;
	}

	.send-btn {
		border-color: var(--control-border);
		background: var(--white);
		color: var(--text-supporting);
	}

	.send-btn.has-queue {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--on-ink);
	}

	.send-btn.has-queue :global(svg) {
		color: var(--gold);
	}

	.send-btn.has-queue:hover:not(:disabled) {
		background: #2b2e28;
	}

	.send-btn:disabled:not(.has-queue) {
		opacity: 1;
	}

	.badge {
		min-width: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--gold);
		color: var(--ink);
		font: 700 12px/18px var(--font-sans);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-body);
		font: var(--text-ui);
		font-size: 13px;
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
		min-width: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--mist);
		font-size: 11px;
		line-height: 18px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.btn-sm {
		min-height: 32px;
		padding-inline: var(--space-3);
		font-size: 13px;
	}

	.active {
		background: var(--gold-tint);
		box-shadow: inset 0 0 0 1px var(--gold-ink);
	}

	.bulk-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
		font-size: 13px;
		color: var(--charcoal);
	}

	.bulk-bar > span {
		margin-right: auto;
	}

	.empty {
		padding: var(--space-12) var(--space-4);
		text-align: center;
		color: var(--text-supporting);
	}

	/* Table ------------------------------------------------------------- */

	.table-wrap {
		overflow-x: auto;
		margin-inline: calc(-1 * var(--space-6));
		padding-inline: var(--space-6);
	}

	.grid {
		width: 100%;
		min-width: 760px;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 13px;
	}

	th {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--rule);
		background: var(--paper);
		color: var(--text-supporting);
		font-size: 12px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}

	th:first-child {
		border-top-left-radius: var(--radius-sm);
	}

	th:last-child {
		border-top-right-radius: var(--radius-sm);
	}

	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--rule);
		color: var(--charcoal);
		vertical-align: middle;
		transition: background-color var(--duration-feedback) var(--ease-out);
	}

	.row:hover td {
		background: color-mix(in srgb, var(--paper) 60%, transparent);
	}

	.row.open td {
		border-bottom-color: transparent;
		background: var(--paper);
	}

	.row.picked td {
		background: var(--gold-tint);
	}

	.row.highlight td:first-child {
		box-shadow: inset 3px 0 0 var(--gold-ink);
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.col-check {
		width: 36px;
		padding-inline: var(--space-3) 0;
	}

	.col-check input {
		display: block;
		width: 16px;
		height: 16px;
		accent-color: var(--gold-ink);
		cursor: pointer;
	}

	.col-toggle {
		width: 36px;
		padding-inline: var(--space-2);
	}

	.col-actions {
		width: 1%;
		white-space: nowrap;
	}

	.toggle {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-supporting);
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--mist);
		color: var(--charcoal);
	}

	.toggle :global(svg) {
		transition: transform 220ms var(--ease-out);
	}

	.toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}

	.delegate {
		min-width: 190px;
	}

	.person {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.who {
		display: grid;
		min-width: 0;
	}

	.who strong {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.code {
		font-size: 11px;
		color: var(--text-supporting);
	}

	.photo {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		object-fit: cover;
		background: var(--mist);
	}

	.email a {
		color: var(--text-body);
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.email a:hover {
		text-decoration: underline;
	}

	.muted {
		color: var(--text-supporting);
		font-size: 12px;
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
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.copy :global(svg) {
		color: var(--gold-ink);
	}

	.copied {
		margin-left: var(--space-2);
		font-size: 12px;
		color: var(--success);
	}

	.status {
		display: inline-block;
		padding: 2px 9px;
		border-radius: 999px;
		font: 600 11px/1.6 var(--font-sans);
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

	/* Ticket email ---------------------------------------------------- */

	.mail {
		white-space: nowrap;
	}

	.mail-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 1px 9px;
		border: 1px solid transparent;
		border-radius: 999px;
		font: 600 11px/1.7 var(--font-sans);
	}

	.mail-pill .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	.mail-pill.not_sent {
		border-color: var(--rule);
		background: var(--mist);
		color: var(--text-supporting);
	}

	.mail-pill.sent {
		border-color: color-mix(in srgb, var(--gold-ink) 30%, transparent);
		background: var(--gold-tint);
		color: var(--gold-ink);
	}

	.mail-pill.delivered {
		border-color: color-mix(in srgb, var(--success) 30%, transparent);
		background: var(--success-tint);
		color: var(--success);
	}

	.mail-pill.failed {
		border-color: color-mix(in srgb, var(--danger) 30%, transparent);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.mail-detail {
		display: block;
		margin-top: 2px;
		font-size: 11px;
		color: var(--text-supporting);
	}

	.email-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.email-tabs-label {
		margin-right: var(--space-2);
		font-size: 12px;
		font-weight: 600;
		color: var(--text-supporting);
	}

	.email-tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px;
		border: 1px solid var(--rule);
		border-radius: 999px;
		color: var(--text-body);
		font-size: 12px;
		text-decoration: none;
	}

	.email-tab:hover {
		border-color: var(--control-border);
	}

	.email-tab[aria-current='page'] {
		border-color: var(--charcoal);
		background: var(--charcoal);
		color: var(--white);
	}

	.email-tab[aria-current='page'] .count {
		background: rgb(255 255 255 / 0.18);
	}

	.email-tab.failed:not([aria-current='page']) .count {
		background: var(--danger-tint);
		color: var(--danger);
	}

	.failed-btn {
		border-color: color-mix(in srgb, var(--danger) 40%, transparent);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.failed-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--danger-tint) 70%, var(--danger) 10%);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-1);
	}

	.row-actions form {
		display: contents;
	}

	/* Collapsed details: the inner wrapper animates, the cell carries no padding. */

	.details td {
		padding: 0;
		background: var(--paper);
	}

	.details-slide {
		overflow: hidden;
	}

	.details-body {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
		margin: 0 var(--space-3) var(--space-3) 48px;
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.details-body:has(> .details-main:only-child) {
		grid-template-columns: minmax(0, 1fr);
	}

	.poster img {
		width: 110px;
		height: auto;
		border-radius: 6px;
		box-shadow: 0 0 0 1px var(--rule);
	}

	.details-main {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3) var(--space-4);
		margin: 0;
	}

	.facts dt {
		font-size: 11px;
		color: var(--text-supporting);
	}

	.facts dd {
		margin: 0;
		color: var(--charcoal);
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.facts a {
		color: var(--gold-ink);
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--success);
	}

	.note.rejected {
		color: var(--danger);
	}

	.reject-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
	}

	.reject-form label {
		display: grid;
		gap: 4px;
		flex: 1 1 280px;
		font-size: 12px;
		color: var(--charcoal);
	}

	.reject-form input {
		min-height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		font-size: 13px;
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
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.panel {
			padding-inline: var(--space-4);
		}

		.head-actions {
			flex-wrap: wrap;
			width: 100%;
		}

		.search {
			width: 100%;
		}

		.table-wrap {
			margin-inline: calc(-1 * var(--space-4));
			padding-inline: var(--space-4);
		}

		.col-amount,
		.action-label {
			display: none;
		}

		.details-body {
			grid-template-columns: minmax(0, 1fr);
			margin-left: var(--space-3);
		}
	}
</style>
