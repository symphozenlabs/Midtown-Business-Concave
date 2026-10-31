<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { page } from '$app/state';
	import {
		BadgeCheck,
		ChevronRight,
		CircleAlert,
		Copy,
		KeyRound,
		LayoutGrid,
		LoaderCircle,
		Search,
		UserPlus,
		Users
	} from '@lucide/svelte';
	import AssignmentFields from '#lib/components/ops/AssignmentFields.svelte';
	import CategoryIcon from '#lib/components/ops/CategoryIcon.svelte';
	import OpsDialog from '#lib/components/ops/OpsDialog.svelte';
	import SecretText from '#lib/components/ops/SecretText.svelte';
	import { CATEGORIES, categoryInfo, type Category } from '#lib/ops/categories.ts';

	let { data, form } = $props();

	const origin = $derived(page.url.origin);

	/* ---------- list filters ---------- */

	const FILTERS = [
		{ id: 'all', label: 'All' },
		{ id: 'active', label: 'Active' },
		{ id: 'new', label: 'Awaiting first sign-in' },
		{ id: 'off', label: 'Deactivated or locked' }
	] as const;
	type FilterId = (typeof FILTERS)[number]['id'];
	let filter = $state<FilterId>('all');
	let search = $state('');

	const handlers = $derived(data.available ? data.handlers : []);
	const matchesFilter = (h: (typeof handlers)[number], id: FilterId) => {
		const st = statusOf(h);
		return id === 'all' || (id === 'active' && st === 'active') || (id === 'new' && st === 'new') || (id === 'off' && !['active', 'new'].includes(st));
	};
	const countFor = (id: FilterId) => handlers.filter((h) => matchesFilter(h, id)).length;
	const shown = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return handlers.filter((h) => matchesFilter(h, filter) && (!q || h.fullName.toLowerCase().includes(q) || h.username.includes(q)));
	});

	/** Active handlers per desk, so empty desks stand out before the event. */
	const coverage = $derived(
		CATEGORIES.map((c) => ({
			code: c.code,
			label: c.label,
			count: handlers.filter((h) => h.status === 'active' && h.assignments.some((a) => a.category === c.code)).length
		}))
	);

	/** Every shape the create action answers with. */
	interface Feedback {
		message?: string;
		errors?: Record<string, string>;
		values?: { fullName?: string; username?: string; email?: string | null; mobile?: string | null };
		created?: { id: string; fullName: string; username: string; password: string };
	}
	const f = $derived(form as Feedback | null);

	// The create form opens in a popup; it stays open when the server finds a problem.
	let creating = $state(untrack(() => Boolean((form as Feedback | null)?.message && !(form as Feedback | null)?.created)));
	let pending = $state(false);
	let copied = $state(false);
	let fullName = $state(untrack(() => (form as Feedback | null)?.values?.fullName ?? ''));
	let username = $state(untrack(() => (form as Feedback | null)?.values?.username ?? ''));
	let formKey = $state(0);

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : 'Never');

	/** john_gate from "John" and the first ticked category. */
	function suggestUsername() {
		const first = fullName.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
		const cat = (document.querySelector<HTMLInputElement>('input[name="categories"]:checked')?.value ?? 'desk') as string;
		const suffix = crypto.getRandomValues(new Uint8Array(1))[0] % 90 + 10;
		username = first ? `${first}_${cat}` : `${cat}_${suffix}`;
	}

	async function copyCredentials(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	const statusOf = (h: { status: string; lockedUntil: string | null; mustChangePassword: boolean }) =>
		h.status !== 'active' ? h.status : h.lockedUntil ? 'locked' : h.mustChangePassword ? 'new' : 'active';
	const STATUS_LABEL: Record<string, string> = {
		active: 'Active',
		inactive: 'Deactivated',
		archived: 'Archived',
		locked: 'Locked',
		new: 'Awaiting first sign-in'
	};
</script>

<svelte:head>
	<title>Handlers · Admin · Midtown Business Conclave</title>
</svelte:head>

<header class="ops-page-head">
	<div>
		<h1>Event handlers</h1>
		<p class="ops-hint">Only you can create handler accounts. Each handler reaches only the desks you assign.</p>
	</div>
	{#if data.available}
		<div class="ops-head-actions">
			<dl class="ops-counts">
				<div><dt>Handlers</dt><dd>{data.summary.total}</dd></div>
				<div><dt>Active</dt><dd>{data.summary.active}</dd></div>
				<div><dt>Signed in now</dt><dd>{data.summary.onlineNow}</dd></div>
				<div><dt>Scans</dt><dd>{data.summary.scans}</dd></div>
			</dl>
			<button type="button" class="btn btn-primary ops-btn-sm create" onclick={() => (creating = true)}>
				<UserPlus size={15} aria-hidden="true" /> Create new handler
			</button>
		</div>
	{/if}
</header>

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>Event handlers is not switched on yet: run <code>db/schema.sql</code> in the Neon SQL editor (it only adds the new tables), then reload this page. Without a database (<code>DATABASE_URL</code>) it stays off.</p>
	</div>
{:else}
	{#if form?.created}
		<div class="ops-secret" role="status" transition:slide={{ duration: 200, easing: cubicOut }}>
			<BadgeCheck size={18} aria-hidden="true" />
			<span>
				Created <b>{form.created.fullName}</b>. Username <strong>{form.created.username}</strong> · password
				<strong>{form.created.password}</strong>
			</span>
			<button
				type="button"
				class="btn btn-secondary ops-btn-sm"
				onclick={() => copyCredentials(`Username: ${form!.created!.username}\nPassword: ${form!.created!.password}\nSign in: ${location.origin}/login`)}
			>
				<Copy size={14} aria-hidden="true" />
				{copied ? 'Copied' : 'Copy sign-in details'}
			</button>
			<span class="ops-muted">Same password as the admin sign-in.</span>
		</div>
	{:else if form?.message && !creating}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
	{/if}

	<div class="ops-layout">
		<div class="ops-column">
	<section class="ops-panel" aria-labelledby="list-title">
		<div class="ops-panel-head">
			<div class="ops-heading">
				<span class="ops-heading-icon"><Users size={16} aria-hidden="true" /></span>
				<h2 id="list-title">Accounts</h2>
			</div>
			{#if data.handlers.length}
				<div class="tools">
					<label class="search">
						<Search size={15} aria-hidden="true" />
						<span class="visually-hidden">Search handlers</span>
						<input type="search" bind:value={search} placeholder="Name or username" autocomplete="off" />
					</label>
				</div>
			{/if}
		</div>
		{#if data.handlers.length}
			<div class="chips" role="group" aria-label="Filter by status">
				{#each FILTERS as fl (fl.id)}
					<button type="button" class="chip" aria-pressed={filter === fl.id} onclick={() => (filter = fl.id)}>
						{fl.label} <span class="count">{countFor(fl.id)}</span>
					</button>
				{/each}
			</div>
		{/if}
		{#if data.handlers.length === 0}
			<div class="ops-empty">
				<p>No handlers yet. Create one for each desk: ticket, gate, hall, food, certificate or networking.</p>
			</div>
		{:else if shown.length === 0}
			<div class="ops-empty"><p>No handlers match.</p></div>
		{:else}
			<div class="ops-table-wrap">
				<table class="ops-table stack">
					<thead>
						<tr>
							<th>Handler</th>
							<th>Username</th>
							<th>Password</th>
							<th>Desks</th>
							<th>Status</th>
							<th class="num">Scans ✓ / dup / ✗</th>
							<th><span class="visually-hidden">Manage</span></th>
						</tr>
					</thead>
					<tbody>
						{#each shown as h (h.id)}
							{@const t = data.tallies[h.id] ?? { success: 0, duplicate: 0, rejected: 0 }}
							{@const st = statusOf(h)}
							<tr>
								<td class="lead">
									<a href="/admin/handlers/{h.id}">{h.fullName}</a>
									<div class="ops-muted signed">Last sign-in {fmt(h.lastLoginAt)}</div>
								</td>
								<td data-label="Username"><SecretText value={h.username} label="username" masked={false} /></td>
								<td data-label="Password">
									{#if data.passwords[h.id]}
										<SecretText value={data.passwords[h.id]!} label="password for {h.username}" />
									{:else}
										<span class="ops-muted" title="Set before passwords were kept. Reset it to store one.">Not stored</span>
									{/if}
								</td>
								<td>
									<div class="cats">
										{#each h.assignments as a (a.id)}
											<span class="ops-pill">{categoryInfo(a.category as Category).label}</span>
										{:else}
											<span class="ops-muted">None</span>
										{/each}
									</div>
								</td>
								<td><span class="ops-pill {st === 'new' ? 'warning' : st}">{STATUS_LABEL[st]}</span></td>
								<td class="num" data-label="Scans ✓ / dup / ✗">{t.success} / {t.duplicate} / {t.rejected}</td>
								<td class="end"><a class="btn btn-ghost ops-btn-sm" href="/admin/handlers/{h.id}">Manage <ChevronRight size={14} aria-hidden="true" /></a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
		</div>

		<aside class="ops-column">
			<section class="ops-panel" aria-labelledby="coverage-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><LayoutGrid size={16} aria-hidden="true" /></span>
					<div>
						<h2 id="coverage-title">Desk coverage</h2>
						<p class="ops-hint">Active handlers assigned to each desk.</p>
					</div>
				</div>
				<ul class="coverage">
					{#each coverage as c (c.code)}
						<li class:gap={c.count === 0}>
							<span class="desk"><CategoryIcon category={c.code} size={16} /> {c.label}</span>
							{#if c.count === 0}
								<span class="ops-pill warning">No one</span>
							{:else}
								<strong>{c.count}</strong>
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			<section class="ops-panel" aria-labelledby="signin-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><KeyRound size={16} aria-hidden="true" /></span>
					<h2 id="signin-title">How handlers sign in</h2>
				</div>
				<ol class="steps">
					<li>Create the account; it uses the admin password.</li>
					<li>They open the sign-in page on their phone and sign in with their username.</li>
					<li>They see only the desks you assigned.</li>
				</ol>
				<div class="signin-link">
					<code>{origin}/login</code>
					<button type="button" class="btn btn-secondary ops-btn-sm" onclick={() => copyCredentials(`${origin}/login`)}>
						<Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy link'}
					</button>
				</div>
			</section>
		</aside>
	</div>

	<OpsDialog
		bind:open={creating}
		wide
		title="Create a new handler"
		description="The handler signs in with their username and the admin password."
	>
		{#key formKey}
			<form
				method="post"
				action="?/create"
				class="ops-form"
				use:enhance={() => {
					pending = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						pending = false;
						if (result.type === 'success') {
							fullName = '';
							username = '';
							creating = false;
							formKey++;
						}
					};
				}}
			>
				{#if f?.message && !f?.created}
					<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{f.message}</p></div>
				{/if}
				<div class="ops-grid">
						<label class="ops-label">
							Full name
							<input name="fullName" bind:value={fullName} required maxlength="80" autocomplete="off" />
							{#if f?.errors?.fullName}<small class="err">{f?.errors?.fullName}</small>{/if}
						</label>
						<label class="ops-label">
							Username
							<span class="with-btn">
								<input name="username" bind:value={username} required maxlength="32" autocomplete="off" placeholder="john_gate" />
								<button type="button" class="btn btn-secondary ops-btn-sm" onclick={suggestUsername}>Generate</button>
							</span>
							{#if f?.errors?.username}<small class="err">{f?.errors?.username}</small>{/if}
						</label>
						<label class="ops-label">
							Email <small>Optional, for password resets</small>
							<input name="email" type="email" maxlength="120" value={f?.values?.email ?? ''} autocomplete="off" />
							{#if f?.errors?.email}<small class="err">{f?.errors?.email}</small>{/if}
						</label>
						<label class="ops-label">
							Mobile <small>Optional</small>
							<input name="mobile" inputmode="tel" value={f?.values?.mobile ?? ''} autocomplete="off" />
							{#if f?.errors?.mobile}<small class="err">{f?.errors?.mobile}</small>{/if}
						</label>
						<label class="ops-label">
							Event
							<select name="eventId" value={data.eventId}>
								{#each data.events as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
							</select>
						</label>
				</div>

				<AssignmentFields options={data.options} />

				<div class="ops-dialog-actions">
					<button type="button" class="btn btn-ghost ops-btn-sm" onclick={() => (creating = false)}>Cancel</button>
					<button type="submit" class="btn btn-primary ops-btn-sm" disabled={pending}>
						{#if pending}<LoaderCircle size={16} class="ops-spin" aria-hidden="true" /> Creating…{:else}<UserPlus size={16} aria-hidden="true" /> Create handler{/if}
					</button>
				</div>
			</form>
		{/key}
	</OpsDialog>
{/if}

<style>
	.with-btn {
		display: flex;
		gap: var(--space-2);
	}

	.err {
		color: var(--danger) !important;
	}

	.signed {
		font-size: 12px;
		white-space: nowrap;
	}

	.cats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: var(--text-supporting);
	}

	.search:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.search input {
		width: 200px;
		min-width: 0;
		border: 0;
		background: none;
		color: var(--charcoal);
		font-size: 14px;
	}

	.search input:focus {
		outline: none;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--white);
		color: var(--text-body);
		font-size: 13px;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		border-color: var(--charcoal);
		background: var(--charcoal);
		color: var(--white);
	}

	.chip .count {
		min-width: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--paper);
		color: var(--charcoal);
		font-size: 12px;
		text-align: center;
	}

	.coverage {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.coverage li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 40px;
		border-bottom: 1px solid var(--rule);
	}

	.coverage .desk {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--charcoal);
	}

	.coverage .desk :global(svg) {
		color: var(--gold-ink);
	}

	.coverage li.gap .desk {
		color: var(--text-supporting);
	}

	.steps {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding-left: 1.2em;
		font-size: 13px;
	}

	.signin-link {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.signin-link code {
		flex: 1 1 180px;
		min-width: 0;
		padding: var(--space-2);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--paper);
		font: 12px/1.4 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		overflow-wrap: anywhere;
	}

	code {
		font-size: 12px;
	}

	@media (max-width: 560px) {
		.ops-head-actions,
		.create {
			width: 100%;
		}

		.search,
		.search input {
			width: 100%;
		}

		.ops-panel-head > :global(.tools) {
			width: 100%;
		}
	}
</style>
