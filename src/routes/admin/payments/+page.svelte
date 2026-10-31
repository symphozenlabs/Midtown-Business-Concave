<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import {
		BadgeCheck,
		Check,
		CircleAlert,
		Copy,
		Crown,
		LoaderCircle,
		Pencil,
		Plus,
		QrCode,
		RotateCcw,
		ScanLine,
		Smartphone,
		Store,
		Ticket,
		Trash,
		Wallet
	} from '@lucide/svelte';
	import {
		STALL_SIZES,
		VALIDITY_OPTIONS,
		areaLabel,
		paymentNote,
		sameName,
		sizeLabel,
		validityLabel,
		type CatalogKind,
		type MembershipPlan,
		type StallType
	} from '#lib/catalog.ts';
	import { DEFAULT_PAYMENT, formatRupees, parseUpiLink, upiLink } from '#lib/payment.ts';
	import { decodeQrImage } from '#lib/qr-decode.ts';
	import OpsDialog from '#lib/components/ops/OpsDialog.svelte';
	import UpiQr from '#lib/components/UpiQr.svelte';

	let { data, form } = $props();

	type Scope = 'qr' | 'stalls' | 'memberships';
	interface Feedback {
		scope?: Scope;
		message?: string;
		success?: string;
		dialog?: boolean;
		errors?: Record<string, string>;
	}
	const f = $derived(form as Feedback | null);
	const errorFor = (scope: Scope, field: string) => (f?.scope === scope ? f.errors?.[field] : undefined);

	const TABS = [
		{ id: 'pass', label: 'Delegate pass', icon: Ticket },
		{ id: 'stalls', label: 'Stalls', icon: Store },
		{ id: 'memberships', label: 'Memberships', icon: Crown }
	] as const;

	// "?/action" alone would drop ?tab=…, sending the page back to the first tab after a save.
	const act = (name: string) => `?/${name}&tab=${data.tab}`;

	const stalls = $derived(data.available ? data.stalls : []);
	const memberships = $derived(data.available ? data.memberships : []);
	const live = $derived(data.available ? data.payment : DEFAULT_PAYMENT);
	const liveLink = $derived(data.available ? data.link : '');

	/* ---------- delegate pass: fee and payment QR ---------- */

	const saved = untrack(() => (data.available ? data.payment : DEFAULT_PAYMENT));
	let price = $state(String(saved.priceRupees));
	let vpa = $state(saved.vpa);
	let payeeName = $state(saved.payeeName);
	let generating = $state(false);

	// The live QR is the one generated on the server; edits wait for "Generate QR".
	const changed = $derived(
		Number(price) !== live.priceRupees || vpa.trim() !== live.vpa || payeeName.trim().replace(/\s+/g, ' ') !== live.payeeName
	);

	let copied = $state<string | null>(null);
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			setTimeout(() => (copied = null), 1600);
		} catch {
			/* clipboard unavailable */
		}
	}

	// Fill the payee from an existing QR image, e.g. a Google Pay screenshot.
	let scanning = $state(false);
	let scanNote = $state<{ ok: boolean; text: string } | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function importQr(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		scanning = true;
		scanNote = null;
		try {
			const raw = await decodeQrImage(file);
			const parsed = raw ? parseUpiLink(raw) : null;
			if (!parsed) {
				scanNote = {
					ok: false,
					text: raw ? 'That QR code is not a UPI payment code.' : 'No QR code found. Try a sharper, closer image.'
				};
				return;
			}
			vpa = parsed.vpa;
			if (parsed.payeeName) payeeName = parsed.payeeName;
			if (parsed.amountRupees) price = String(parsed.amountRupees);
			scanNote = { ok: true, text: `Read ${parsed.vpa}. Press Generate QR to apply.` };
		} catch (e) {
			console.error('[payments] QR import failed', e);
			scanNote = { ok: false, text: `That image could not be read${e instanceof Error && e.message ? `: ${e.message}` : '.'}` };
		} finally {
			scanning = false;
			if (fileInput) fileInput.value = '';
		}
	}

	const generate: SubmitFunction = () => {
		generating = true;
		return async ({ update }) => {
			await update({ reset: false });
			generating = false;
		};
	};

	/* ---------- stalls and memberships ---------- */

	/** One editor for both kinds; the dialog shows the fields of its kind. */
	let editor = $state<{ kind: CatalogKind; id: string | null } | null>(null);
	let saving = $state(false);
	let draft = $state({
		name: '',
		widthM: '3',
		depthM: '3',
		priceRupees: '',
		quantity: '10',
		description: '',
		validityMonths: '12',
		benefits: '',
		ownPayee: false,
		vpa: '',
		payeeName: ''
	});

	function openStall(stall: StallType | null) {
		draft = {
			...draft,
			name: stall?.name ?? '',
			widthM: String(stall?.widthM ?? 3),
			depthM: String(stall?.depthM ?? 3),
			priceRupees: stall ? String(stall.priceRupees) : '',
			quantity: String(stall?.quantity ?? 10),
			description: stall?.description ?? '',
			ownPayee: Boolean(stall?.vpa),
			vpa: stall?.vpa ?? '',
			payeeName: stall?.payeeName ?? ''
		};
		editor = { kind: 'stall', id: stall?.id ?? null };
		dismissed = form;
		editorOpen = true;
	}

	function openMembership(plan: MembershipPlan | null) {
		draft = {
			...draft,
			name: plan?.name ?? '',
			priceRupees: plan ? String(plan.priceRupees) : '',
			validityMonths: plan ? (plan.validityMonths === null ? 'lifetime' : String(plan.validityMonths)) : '12',
			benefits: plan?.benefits.join('\n') ?? '',
			ownPayee: Boolean(plan?.vpa),
			vpa: plan?.vpa ?? '',
			payeeName: plan?.payeeName ?? ''
		};
		editor = { kind: 'membership', id: plan?.id ?? null };
		dismissed = form;
		editorOpen = true;
	}

	let editorOpen = $state(false);
	// A failed save's errors belong to that attempt; opening the editor again starts clean.
	let dismissed = $state<unknown>(null);
	const dialogErrorFor = (scope: Scope, field: string) => (form !== dismissed ? errorFor(scope, field) : undefined);
	const dialogMessage = $derived(form !== dismissed && f?.dialog ? f.message : undefined);

	/** Same name as another item of the same kind: blocked before it reaches the server. */
	const nameTaken = $derived.by(() => {
		if (!editor || draft.name.trim().length < 2) return false;
		const list: { id: string; name: string }[] = editor.kind === 'stall' ? stalls : memberships;
		return list.some((x) => x.id !== editor!.id && sameName(x.name, draft.name));
	});

	const presetValue = $derived(`${Number(draft.widthM)}x${Number(draft.depthM)}`);
	function choosePreset(value: string) {
		if (!value) return;
		const [w, d] = value.split('x');
		draft.widthM = w;
		draft.depthM = d;
	}

	const saveItem: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			saving = false;
			if (result.type === 'success') editorOpen = false;
		};
	};

	const keep: SubmitFunction = () => async ({ update }) => update({ reset: false });

	/* ---------- payment QR for one item ---------- */

	let qrFor = $state<{ kind: CatalogKind; name: string; priceRupees: number; vpa: string | null; payeeName: string | null } | null>(null);
	let qrOpen = $state(false);
	const qrPayee = $derived(qrFor?.vpa ? { vpa: qrFor.vpa, payeeName: qrFor.payeeName ?? '' } : { vpa: live.vpa, payeeName: live.payeeName });
	const qrLink = $derived(
		qrFor ? upiLink({ ...qrPayee, priceRupees: qrFor.priceRupees }, qrFor.priceRupees, paymentNote(qrFor.kind, qrFor.name)) : ''
	);
	function showQr(kind: CatalogKind, item: StallType | MembershipPlan) {
		qrFor = { kind, name: item.name, priceRupees: item.priceRupees, vpa: item.vpa, payeeName: item.payeeName };
		qrOpen = true;
	}

	const paidTo = (item: { vpa: string | null }) => item.vpa ?? live.vpa;
	const totalStalls = $derived(stalls.filter((s) => s.active).reduce((n, s) => n + s.quantity, 0));
	const stallValue = $derived(stalls.filter((s) => s.active).reduce((n, s) => n + s.quantity * s.priceRupees, 0));
</script>

<svelte:head>
	<title>Payments · Admin · Midtown Business Conclave</title>
</svelte:head>

{#snippet notice(scope: Scope)}
	{#if f?.scope === scope && f?.message && !f?.dialog}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{f.message}</p></div>
	{:else if f?.scope === scope && f?.success}
		<div class="ops-banner ok" role="status"><BadgeCheck size={16} aria-hidden="true" /><p>{f.success}</p></div>
	{/if}
{/snippet}

{#snippet payeeFields(scope: Scope)}
	<label class="ops-check">
		<input type="checkbox" name="ownPayee" bind:checked={draft.ownPayee} />
		Collect to a different UPI account
	</label>
	{#if draft.ownPayee}
		<div class="pair">
			<label class="ops-label">
				UPI ID
				<input name="vpa" bind:value={draft.vpa} placeholder="name@okbank" autocomplete="off" spellcheck="false" required />
				{#if dialogErrorFor(scope, 'vpa')}<small class="ops-field-error">{dialogErrorFor(scope, 'vpa')}</small>{/if}
			</label>
			<label class="ops-label">
				Payee name
				<input name="payeeName" bind:value={draft.payeeName} autocomplete="off" required />
				{#if dialogErrorFor(scope, 'payeeName')}<small class="ops-field-error">{dialogErrorFor(scope, 'payeeName')}</small>{/if}
			</label>
		</div>
	{:else}
		<p class="ops-hint">Paid to {live.payeeName} · {live.vpa}, the delegate-pass account.</p>
	{/if}
{/snippet}

{#snippet itemActions(kind: CatalogKind, item: StallType | MembershipPlan, edit: () => void)}
	<div class="ops-actions item-actions">
		<button type="button" class="btn btn-ghost ops-btn-sm" onclick={() => showQr(kind, item)} aria-label="Payment QR for {item.name}" title="Payment QR">
			<QrCode size={15} aria-hidden="true" />
		</button>
		<button type="button" class="btn btn-ghost ops-btn-sm" onclick={edit} aria-label="Edit {item.name}" title="Edit">
			<Pencil size={14} aria-hidden="true" />
		</button>
		<form method="post" action={act('toggle')} use:enhance={keep}>
			<input type="hidden" name="kind" value={kind} />
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="active" value={String(!item.active)} />
			<button class="btn btn-ghost ops-btn-sm" type="submit">{item.active ? 'Close' : 'Open'}</button>
		</form>
		<form method="post" action={act('remove')} use:enhance={keep}>
			<input type="hidden" name="kind" value={kind} />
			<input type="hidden" name="id" value={item.id} />
			<button class="btn btn-ghost ops-btn-sm" type="submit" aria-label="Remove {item.name}" title="Remove"><Trash size={14} aria-hidden="true" /></button>
		</form>
	</div>
{/snippet}

<header class="ops-page-head">
	<div>
		<h1>Payments</h1>
		<p class="ops-hint">Delegate passes, stalls and memberships: prices, UPI accounts and payment QRs.</p>
	</div>
	{#if data.available}
		<dl class="ops-counts">
			<div><dt>Delegate pass</dt><dd>{formatRupees(live.priceRupees)}</dd></div>
			<div><dt>Stall types</dt><dd>{stalls.length} <small>{totalStalls} stalls</small></dd></div>
			<div><dt>Memberships</dt><dd>{memberships.length}</dd></div>
		</dl>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>The database is not configured, so payments cannot be saved. Set <code>DATABASE_URL</code>.</p>
	</div>
{:else}
	<nav class="tabs" aria-label="Payment types">
		{#each TABS as t (t.id)}
			<a href="?tab={t.id}" aria-current={data.tab === t.id ? 'page' : undefined} data-sveltekit-reset="false" data-sveltekit-replacestate>
				<t.icon size={15} aria-hidden="true" />
				{t.label}
				{#if t.id === 'stalls'}<span class="count">{stalls.length}</span>{/if}
				{#if t.id === 'memberships'}<span class="count">{memberships.length}</span>{/if}
			</a>
		{/each}
	</nav>

	{#if data.tab === 'pass'}
		<section class="ops-panel" aria-labelledby="pass-title">
			<div class="ops-heading">
				<span class="ops-heading-icon"><Ticket size={16} aria-hidden="true" /></span>
				<div>
					<h2 id="pass-title">Delegate pass fee and payment QR</h2>
					<p class="ops-hint">Used by the registration form. Unpaid delegates move to a new fee as soon as you generate the QR.</p>
				</div>
			</div>
			{@render notice('qr')}

			<div class="qr-grid">
				<form method="post" action={act('generateQr')} use:enhance={generate} class="ops-form">
					<label class="ops-label">
						Event fee
						<span class="prefixed"><span aria-hidden="true">₹</span><input name="priceRupees" type="number" inputmode="decimal" min="1" step="0.01" bind:value={price} required /></span>
						{#if errorFor('qr', 'priceRupees')}<small class="ops-field-error">{errorFor('qr', 'priceRupees')}</small>{/if}
					</label>
					<label class="ops-label">
						UPI ID
						<input name="vpa" bind:value={vpa} placeholder="name@okbank" autocomplete="off" spellcheck="false" required />
						{#if errorFor('qr', 'vpa')}<small class="ops-field-error">{errorFor('qr', 'vpa')}</small>{/if}
					</label>
					<label class="ops-label">
						Payee name <small>As shown on the UPI account</small>
						<input name="payeeName" bind:value={payeeName} autocomplete="off" required />
						{#if errorFor('qr', 'payeeName')}<small class="ops-field-error">{errorFor('qr', 'payeeName')}</small>{/if}
					</label>

					<label class="import" class:busy={scanning}>
						{#if scanning}
							<LoaderCircle size={14} class="ops-spin" aria-hidden="true" /> Reading QR…
						{:else}
							<ScanLine size={14} aria-hidden="true" /> Fill from an existing QR image
						{/if}
						<input type="file" accept="image/*" class="visually-hidden" bind:this={fileInput} disabled={scanning} onchange={importQr} />
					</label>
					{#if scanNote}
						<p class="scan" class:bad={!scanNote.ok}>
							{#if scanNote.ok}<Check size={14} aria-hidden="true" />{:else}<CircleAlert size={14} aria-hidden="true" />{/if}
							{scanNote.text}
						</p>
					{/if}

					<div class="ops-actions">
						<button type="submit" class="btn btn-primary ops-btn-sm" disabled={generating}>
							{#if generating}<LoaderCircle size={15} class="ops-spin" aria-hidden="true" /> Generating…{:else}<QrCode size={15} aria-hidden="true" /> Generate QR{/if}
						</button>
						{#if changed}
							<button
								type="button"
								class="btn btn-ghost ops-btn-sm"
								onclick={() => {
									price = String(live.priceRupees);
									vpa = live.vpa;
									payeeName = live.payeeName;
									scanNote = null;
								}}
							>
								<RotateCcw size={14} aria-hidden="true" /> Discard
							</button>
						{/if}
					</div>
				</form>

				<div class="qr-card" class:stale={changed}>
					<span class="qr-label">Current QR</span>
					<div class="qr-wrap"><UpiQr link={liveLink} label="Payment QR: {formatRupees(live.priceRupees)} to {live.payeeName}" /></div>
					<strong class="qr-amount">{formatRupees(live.priceRupees)}</strong>
					<span class="qr-payee">{live.payeeName} · {live.vpa}</span>
					{#if changed}<span class="qr-stale-note">Unsaved changes: press Generate QR</span>{/if}
				</div>

				<div class="link">
					<span class="link-label">Payment link (mobile tap-to-pay)</span>
					<code>{liveLink}</code>
					<p class="ops-hint">Each delegate's note carries their own registration number in place of MBC-XXXXXX.</p>
					<div class="ops-actions">
						<button type="button" class="btn btn-secondary ops-btn-sm" onclick={() => copy(liveLink)}>
							{#if copied === liveLink}<Check size={14} aria-hidden="true" /> Copied{:else}<Copy size={14} aria-hidden="true" /> Copy link{/if}
						</button>
						<a class="btn btn-ghost ops-btn-sm" href={liveLink}><Smartphone size={14} aria-hidden="true" /> Test on phone</a>
					</div>
				</div>
			</div>
		</section>
	{:else}
		<div class="ops-layout">
			<div class="ops-column">
				{#if data.tab === 'stalls'}
					<section class="ops-panel" aria-labelledby="stalls-title">
						<div class="ops-panel-head">
							<div class="ops-heading">
								<span class="ops-heading-icon"><Store size={16} aria-hidden="true" /></span>
								<div>
									<h2 id="stalls-title">Stall types</h2>
									<p class="ops-hint">One row per size and kind of stall, with its own price and number available.</p>
								</div>
							</div>
							<button type="button" class="btn btn-primary ops-btn-sm" onclick={() => openStall(null)}>
								<Plus size={15} aria-hidden="true" /> Add stall type
							</button>
						</div>
						{@render notice('stalls')}
						{#if stalls.length}
							<div class="ops-table-wrap">
								<table class="ops-table stack">
									<thead>
										<tr><th>Stall</th><th>Size</th><th class="num">Price</th><th class="num">Available</th><th>Paid to</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr>
									</thead>
									<tbody>
										{#each stalls as s (s.id)}
											<tr class:closed={!s.active}>
												<td class="lead">
													<strong>{s.name}</strong>
													{#if s.description}<div class="ops-muted sub">{s.description}</div>{/if}
												</td>
												<td class="nowrap" data-label="Size">{sizeLabel(s)} <span class="ops-muted">· {areaLabel(s)}</span></td>
												<td class="num nowrap" data-label="Price">{formatRupees(s.priceRupees)}</td>
												<td class="num" data-label="Available">{s.quantity}</td>
												<td class="ops-muted mono-sm" data-label="Paid to">{paidTo(s)}</td>
												<td><span class="ops-pill {s.active ? 'active' : 'inactive'}">{s.active ? 'On sale' : 'Closed'}</span></td>
												<td class="row-end end">{@render itemActions('stall', s, () => openStall(s))}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<div class="ops-empty">
								<p>No stalls yet. Add each size you sell, for example <b>Standard 3 m × 3 m</b> or <b>Premium corner 6 m × 3 m</b>.</p>
							</div>
						{/if}
					</section>
				{:else}
					<section class="ops-panel" aria-labelledby="members-title">
						<div class="ops-panel-head">
							<div class="ops-heading">
								<span class="ops-heading-icon"><Crown size={16} aria-hidden="true" /></span>
								<div>
									<h2 id="members-title">Memberships</h2>
									<p class="ops-hint">Each plan has its own price, how long it lasts and what members get.</p>
								</div>
							</div>
							<button type="button" class="btn btn-primary ops-btn-sm" onclick={() => openMembership(null)}>
								<Plus size={15} aria-hidden="true" /> Add membership
							</button>
						</div>
						{@render notice('memberships')}
						{#if memberships.length}
							<ul class="plans">
								{#each memberships as m (m.id)}
									<li class="plan" class:closed={!m.active}>
										<div class="plan-head">
											<div>
												<h3>{m.name}</h3>
												<span class="ops-pill {m.active ? 'active' : 'inactive'}">{m.active ? 'On sale' : 'Closed'}</span>
											</div>
											<p class="plan-price">{formatRupees(m.priceRupees)}<small> / {validityLabel(m.validityMonths).toLowerCase()}</small></p>
										</div>
										{#if m.benefits.length}
											<ul class="benefits">
												{#each m.benefits as b, i (i)}<li><Check size={14} aria-hidden="true" /> {b}</li>{/each}
											</ul>
										{:else}
											<p class="ops-hint">No benefits listed.</p>
										{/if}
										<div class="plan-foot">
											<span class="ops-muted mono-sm">{paidTo(m)}</span>
											{@render itemActions('membership', m, () => openMembership(m))}
										</div>
									</li>
								{/each}
							</ul>
						{:else}
							<div class="ops-empty">
								<p>No memberships yet. Add plans such as <b>Annual member</b> or <b>Lifetime patron</b>.</p>
							</div>
						{/if}
					</section>
				{/if}
			</div>

			<aside class="ops-column">
				<section class="ops-panel" aria-labelledby="payee-title">
					<div class="ops-heading">
						<span class="ops-heading-icon"><Wallet size={16} aria-hidden="true" /></span>
						<h2 id="payee-title">Default UPI account</h2>
					</div>
					<dl class="facts">
						<div><dt>Payee</dt><dd>{live.payeeName}</dd></div>
						<div><dt>UPI ID</dt><dd class="mono-sm">{live.vpa}</dd></div>
					</dl>
					<p class="ops-hint">Items without their own UPI account are paid here. The payment note names the item, so payments are easy to match.</p>
					<a class="btn btn-secondary ops-btn-sm" href="?tab=pass" data-sveltekit-reset="false">Change on Delegate pass</a>
				</section>

				<section class="ops-panel" aria-labelledby="summary-title">
					<h2 id="summary-title">Summary</h2>
					{#if data.tab === 'stalls'}
						<dl class="facts">
							<div><dt>Stall types on sale</dt><dd>{stalls.filter((s) => s.active).length} of {stalls.length}</dd></div>
							<div><dt>Stalls available</dt><dd>{totalStalls}</dd></div>
							<div><dt>Value if all sell</dt><dd>{formatRupees(stallValue)}</dd></div>
						</dl>
					{:else}
						<dl class="facts">
							<div><dt>Plans on sale</dt><dd>{memberships.filter((m) => m.active).length} of {memberships.length}</dd></div>
							<div><dt>Lowest price</dt><dd>{memberships.length ? formatRupees(Math.min(...memberships.map((m) => m.priceRupees))) : '—'}</dd></div>
						</dl>
					{/if}
				</section>
			</aside>
		</div>
	{/if}

	<OpsDialog
		bind:open={editorOpen}
		title={editor?.kind === 'membership' ? (editor.id ? 'Edit membership' : 'Add a membership') : editor?.id ? 'Edit stall type' : 'Add a stall type'}
		description={editor?.kind === 'membership' ? 'Shown to members with its price and benefits.' : 'One entry per stall size and kind.'}
	>
		{@const scope = editor?.kind === 'membership' ? 'memberships' : 'stalls'}
		<form method="post" action={act(editor?.kind === 'membership' ? 'saveMembership' : 'saveStall')} class="ops-form" use:enhance={saveItem}>
			{#if dialogMessage}
				<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{dialogMessage}</p></div>
			{/if}
			<input type="hidden" name="id" value={editor?.id ?? ''} />
			<label class="ops-label">
				Name
				<input name="name" bind:value={draft.name} maxlength="60" required autocomplete="off" placeholder={editor?.kind === 'membership' ? 'Annual member' : 'Standard stall'} />
				{#if nameTaken}
					<small class="ops-field-error">That name is already used. Choose a different one.</small>
				{:else if dialogErrorFor(scope, 'name')}
					<small class="ops-field-error">{dialogErrorFor(scope, 'name')}</small>
				{/if}
			</label>

			{#if editor?.kind === 'membership'}
				<div class="pair">
					<label class="ops-label">
						Price
						<span class="prefixed"><span aria-hidden="true">₹</span><input name="priceRupees" type="number" inputmode="decimal" min="1" step="0.01" bind:value={draft.priceRupees} required /></span>
						{#if dialogErrorFor(scope, 'priceRupees')}<small class="ops-field-error">{dialogErrorFor(scope, 'priceRupees')}</small>{/if}
					</label>
					<label class="ops-label">
						Valid for
						<select name="validityMonths" bind:value={draft.validityMonths}>
							{#each VALIDITY_OPTIONS as o (o.label)}<option value={o.value === null ? 'lifetime' : String(o.value)}>{o.label}</option>{/each}
						</select>
					</label>
				</div>
				<label class="ops-label">
					Benefits <small>One per line</small>
					<textarea name="benefits" rows="4" bind:value={draft.benefits} placeholder={'Free entry to every conclave\nListing in the member directory'}></textarea>
				</label>
			{:else}
				<div class="size-row">
					<label class="ops-label">
						Size
						<select value={STALL_SIZES.some((s) => `${s.widthM}x${s.depthM}` === presetValue) ? presetValue : ''} onchange={(e) => choosePreset(e.currentTarget.value)}>
							<option value="">Custom size</option>
							{#each STALL_SIZES as s (`${s.widthM}x${s.depthM}`)}<option value="{s.widthM}x{s.depthM}">{sizeLabel(s)}</option>{/each}
						</select>
					</label>
					<label class="ops-label">Width (m)<input name="widthM" type="number" inputmode="decimal" min="0.5" max="100" step="0.5" bind:value={draft.widthM} required /></label>
					<label class="ops-label">Depth (m)<input name="depthM" type="number" inputmode="decimal" min="0.5" max="100" step="0.5" bind:value={draft.depthM} required /></label>
				</div>
				{#if dialogErrorFor(scope, 'size')}<small class="ops-field-error">{dialogErrorFor(scope, 'size')}</small>{/if}
				<div class="pair">
					<label class="ops-label">
						Price per stall
						<span class="prefixed"><span aria-hidden="true">₹</span><input name="priceRupees" type="number" inputmode="decimal" min="1" step="0.01" bind:value={draft.priceRupees} required /></span>
						{#if dialogErrorFor(scope, 'priceRupees')}<small class="ops-field-error">{dialogErrorFor(scope, 'priceRupees')}</small>{/if}
					</label>
					<label class="ops-label">
						Number available
						<input name="quantity" type="number" inputmode="numeric" min="1" max="1000" step="1" bind:value={draft.quantity} required />
						{#if dialogErrorFor(scope, 'quantity')}<small class="ops-field-error">{dialogErrorFor(scope, 'quantity')}</small>{/if}
					</label>
				</div>
				<label class="ops-label">
					Description <small>Optional</small>
					<input name="description" bind:value={draft.description} maxlength="200" autocomplete="off" placeholder="Corner stall, power socket and two chairs" />
				</label>
			{/if}

			{@render payeeFields(scope)}

			<div class="ops-dialog-actions">
				<button type="button" class="btn btn-ghost ops-btn-sm" onclick={() => (editorOpen = false)}>Cancel</button>
				<button type="submit" class="btn btn-primary ops-btn-sm" disabled={saving || nameTaken}>
					{#if saving}<LoaderCircle size={15} class="ops-spin" aria-hidden="true" /> Saving…{:else}<Check size={15} aria-hidden="true" /> {editor?.id ? 'Save changes' : 'Add'}{/if}
				</button>
			</div>
		</form>
	</OpsDialog>

	<OpsDialog bind:open={qrOpen} title={qrFor ? qrFor.name : 'Payment QR'} description="Scan with any UPI app. The amount and a note naming the item are filled in.">
		{#if qrFor}
			<div class="item-qr">
				<div class="qr-card">
					<span class="qr-label">{qrFor.kind === 'stall' ? 'Stall' : 'Membership'}</span>
					<div class="qr-wrap"><UpiQr link={qrLink} label="Payment QR: {formatRupees(qrFor.priceRupees)} for {qrFor.name}" /></div>
					<strong class="qr-amount">{formatRupees(qrFor.priceRupees)}</strong>
					<span class="qr-payee">{qrPayee.payeeName} · {qrPayee.vpa}</span>
				</div>
				<div class="link">
					<span class="link-label">Payment link</span>
					<code>{qrLink}</code>
					<div class="ops-actions">
						<button type="button" class="btn btn-secondary ops-btn-sm" onclick={() => copy(qrLink)}>
							{#if copied === qrLink}<Check size={14} aria-hidden="true" /> Copied{:else}<Copy size={14} aria-hidden="true" /> Copy link{/if}
						</button>
						<a class="btn btn-ghost ops-btn-sm" href={qrLink}><Smartphone size={14} aria-hidden="true" /> Test on phone</a>
					</div>
				</div>
			</div>
		{/if}
	</OpsDialog>
{/if}

<style>
	/* Scrolls sideways on narrow phones; the rule is a shadow so nothing overflows vertically. */
	.tabs {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		box-shadow: inset 0 -1px 0 var(--rule);
	}

	.tabs a {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 6px;
		padding: var(--space-2) var(--space-3);
		border-bottom: 2px solid transparent;
		color: var(--text-supporting);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}

	.tabs a:hover {
		color: var(--charcoal);
	}

	.tabs a[aria-current='page'] {
		border-bottom-color: var(--gold-ink);
		color: var(--charcoal);
	}

	.count {
		min-width: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--paper);
		font-size: 12px;
		text-align: center;
	}

	/* Delegate pass: fields, the live QR and the link side by side. */
	.qr-grid {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(220px, 260px) minmax(240px, 1fr);
		gap: var(--space-6);
		align-items: start;
	}

	.prefixed {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.prefixed:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.prefixed span {
		color: var(--text-supporting);
	}

	/* The shared .ops-label input style would draw a second box inside. */
	.ops-label .prefixed input {
		flex: 1;
		min-width: 0;
		min-height: 38px;
		padding: 0;
		border: 0;
		background: none;
		font-variant-numeric: tabular-nums;
	}

	.ops-label .prefixed input:focus {
		outline: none;
	}

	.ops-label textarea {
		min-height: 96px;
		padding: var(--space-2) var(--space-3);
		resize: vertical;
		font-family: inherit;
	}

	.import {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		justify-self: start;
		font-size: 12px;
		font-weight: 500;
		color: var(--gold-ink);
		cursor: pointer;
	}

	.import:hover {
		text-decoration: underline;
	}

	.import.busy {
		cursor: progress;
		color: var(--text-supporting);
	}

	.import:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.scan {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--success);
	}

	.scan.bad {
		color: var(--danger);
	}

	.qr-card {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: var(--space-4);
		border-radius: var(--radius-sm);
		background: #0c1730;
		color: var(--on-ink-soft);
		text-align: center;
		transition: opacity 160ms ease-out;
	}

	.qr-card.stale {
		opacity: 0.6;
	}

	.qr-label {
		font: 600 10px/1.4 var(--font-sans);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.qr-wrap {
		width: 100%;
		max-width: 176px;
		margin-block: var(--space-2);
	}

	.qr-amount {
		font: 600 18px/1.2 var(--font-sans);
		color: var(--on-ink);
	}

	.qr-payee {
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.qr-stale-note {
		margin-top: var(--space-1);
		font-size: 12px;
		color: var(--gold-bright);
	}

	.link {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	.link-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.link code {
		display: block;
		padding: var(--space-2);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--charcoal);
		font: 11px/1.5 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		overflow-wrap: anywhere;
		user-select: all;
	}

	/* Stalls table ------------------------------------------------------- */

	.sub {
		max-width: 320px;
		font-size: 12px;
	}

	.nowrap {
		white-space: nowrap;
	}

	.mono-sm {
		font: 12px/1.4 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		overflow-wrap: anywhere;
	}

	tr.closed td,
	.plan.closed {
		opacity: 0.65;
	}

	.row-end {
		width: 1%;
	}

	.item-actions {
		flex-wrap: nowrap;
		justify-content: flex-end;
		gap: 2px;
	}

	/* Membership plans ---------------------------------------------------- */

	.plans {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.plan {
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.plan-head {
		display: grid;
		gap: var(--space-2);
	}

	.plan-head > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.plan h3 {
		font: 600 15px/1.3 var(--font-sans);
		overflow-wrap: anywhere;
	}

	.plan-price {
		font: 600 22px/1.2 var(--font-sans);
		color: var(--charcoal);
	}

	.plan-price small {
		font-size: 13px;
		font-weight: 400;
		color: var(--text-supporting);
	}

	.benefits {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
	}

	.benefits li {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}

	.benefits :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--gold-ink);
	}

	.plan-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
	}

	/* Side column --------------------------------------------------------- */

	.facts {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	.facts div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--rule);
	}

	.facts dt {
		color: var(--text-supporting);
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
		text-align: right;
		color: var(--charcoal);
	}

	/* Dialog forms -------------------------------------------------------- */

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		align-items: start;
	}

	.size-row {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		align-items: end;
	}

	.item-qr {
		display: grid;
		grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}

	code {
		font-size: 12px;
	}

	@media (max-width: 1100px) {
		.qr-grid {
			grid-template-columns: minmax(0, 1fr) minmax(200px, 240px);
		}

		.qr-grid .link {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 480px) {
		.tabs a {
			flex: 1 0 auto;
			justify-content: center;
			padding-inline: var(--space-2);
		}

		.tabs a :global(svg) {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.qr-grid,
		.item-qr,
		.pair,
		.size-row {
			grid-template-columns: minmax(0, 1fr);
		}

		.qr-card {
			justify-self: stretch;
		}

		/* Avoid iOS zoom on focus. */
		.ops-label :is(input, select, textarea) {
			font-size: 16px;
		}
	}
</style>
