<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		BadgeCheck,
		Check,
		CircleAlert,
		Copy,
		History,
		KeyRound,
		LayoutGrid,
		LogOut,
		Power,
		RotateCcwKey,
		Save,
		ScanLine,
		Trash,
		UserPen
	} from '@lucide/svelte';
	import AssignmentFields from '#lib/components/ops/AssignmentFields.svelte';
	import SecretText from '#lib/components/ops/SecretText.svelte';
	import { categoryInfo, type Category } from '#lib/ops/categories.ts';

	let { data, form } = $props();

	const errors = $derived((form as { errors?: Record<string, string> } | null)?.errors);

	const h = $derived(data.handler);
	let copied = $state<string | null>(null);
	let confirmRemove = $state(false);

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '—');
	const RESULT = { success: 'Done', duplicate: 'Duplicate', rejected: 'Rejected' } as const;
	const status = $derived(h.status === 'active' ? (h.lockedUntil ? 'Locked' : 'Active') : h.status === 'inactive' ? 'Deactivated' : 'Archived');
	const signInUrl = $derived(`${page.url.origin}/login`);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			setTimeout(() => (copied = null), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<svelte:head>
	<title>{h.fullName} · Handlers · Admin · Midtown Business Conclave</title>
</svelte:head>

<a class="back" href="/admin/handlers"><ArrowLeft size={16} aria-hidden="true" /> All handlers</a>

<header class="ops-page-head">
	<div>
		<h1>{h.fullName} <span class="ops-pill {h.status}">{status}</span></h1>
		<p class="ops-hint">
			Created {fmt(h.createdAt)} by {h.createdBy} · last sign-in {fmt(h.lastLoginAt)} · {h.activeSessions}
			{h.activeSessions === 1 ? 'device' : 'devices'} signed in
		</p>
	</div>
	<div class="ops-actions">
		<form method="post" action="?/resetPassword" use:enhance>
			<button class="btn btn-secondary ops-btn-sm" type="submit"><RotateCcwKey size={15} aria-hidden="true" /> Reset password</button>
		</form>
		<form method="post" action="?/revoke" use:enhance>
			<button class="btn btn-ghost ops-btn-sm" type="submit" disabled={h.activeSessions === 0}><LogOut size={15} aria-hidden="true" /> Sign out everywhere</button>
		</form>
		{#if h.status === 'active'}
			<form method="post" action="?/deactivate" use:enhance>
				<button class="btn btn-ghost ops-btn-sm" type="submit"><Power size={15} aria-hidden="true" /> Deactivate</button>
			</form>
		{:else}
			<form method="post" action="?/activate" use:enhance>
				<button class="btn btn-primary ops-btn-sm" type="submit"><Power size={15} aria-hidden="true" /> Activate</button>
			</form>
		{/if}
		{#if h.status !== 'archived'}
			{#if confirmRemove}
				<form method="post" action="?/remove" use:enhance>
					<button class="btn ops-danger ops-btn-sm" type="submit"><Trash size={15} aria-hidden="true" /> Yes, delete or archive</button>
				</form>
				<button class="btn btn-ghost ops-btn-sm" type="button" onclick={() => (confirmRemove = false)}>Cancel</button>
			{:else}
				<button class="btn btn-ghost ops-btn-sm" type="button" onclick={() => (confirmRemove = true)}><Trash size={15} aria-hidden="true" /> Delete</button>
			{/if}
		{/if}
	</div>
</header>

{#if confirmRemove}
	<p class="ops-hint">An account with no scans is deleted. One with scan history is archived, so the records stay.</p>
{/if}

{#if form?.password}
	<div class="ops-banner ok" role="status">
		<RotateCcwKey size={16} aria-hidden="true" />
		<p>New temporary password set. It is shown under Sign-in below; they choose their own at their next sign-in.</p>
	</div>
{:else if form?.message}
	<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
{:else if form?.success}
	<div class="ops-banner ok" role="status"><BadgeCheck size={16} aria-hidden="true" /><p>{form.success}</p></div>
{/if}

<section class="ops-panel signin-panel" aria-labelledby="signin-title">
	<div class="ops-heading">
		<span class="ops-heading-icon"><KeyRound size={16} aria-hidden="true" /></span>
		<h2 id="signin-title">Sign-in</h2>
	</div>
	<dl class="signin">
		<div>
			<dt>Username</dt>
			<dd>
				<code>{h.username}</code>
				<button type="button" class="icon-btn" onclick={() => copy(h.username)} aria-label="Copy username" title="Copy">
					{#if copied === h.username}<Check size={14} aria-hidden="true" />{:else}<Copy size={14} aria-hidden="true" />{/if}
				</button>
			</dd>
		</div>
		<div>
			<dt>Password{#if data.password && h.mustChangePassword}<small> · temporary</small>{/if}</dt>
			<dd>
				{#if data.password}
					<SecretText value={data.password} label="password for {h.username}" />
				{:else if data.passwordLookup}
					<span class="ops-muted">Not stored yet: reset the password to store one.</span>
				{:else}
					<span class="ops-muted">Set PASS_SECRET to keep passwords for look-up.</span>
				{/if}
			</dd>
		</div>
		<div>
			<dt>Sign-in page</dt>
			<dd>
				<code>{signInUrl}</code>
				<button type="button" class="icon-btn" onclick={() => copy(signInUrl)} aria-label="Copy sign-in link" title="Copy">
					{#if copied === signInUrl}<Check size={14} aria-hidden="true" />{:else}<Copy size={14} aria-hidden="true" />{/if}
				</button>
			</dd>
		</div>
		{#if data.password}
			<div class="all">
				<button
					type="button"
					class="btn btn-secondary ops-btn-sm"
					onclick={() => copy(`Sign in: ${signInUrl}\nUsername: ${h.username}\nPassword: ${data.password}`)}
				>
					<Copy size={14} aria-hidden="true" />
					{copied?.startsWith('Sign in:') ? 'Copied' : 'Copy all sign-in details'}
				</button>
			</div>
		{/if}
	</dl>
</section>

<div class="ops-layout">
	<div class="ops-column">
		<section class="ops-panel" aria-labelledby="cats">
			<div class="ops-heading">
				<span class="ops-heading-icon"><LayoutGrid size={16} aria-hidden="true" /></span>
				<div>
					<h2 id="cats">Desks</h2>
					<p class="ops-hint">Changes apply on their next tap; a desk they lose stops working at once.</p>
				</div>
			</div>
			<form method="post" action="?/assignments" class="ops-form" use:enhance={keep}>
				{#key h.assignments}
					<AssignmentFields options={data.options} current={h.assignments.filter((a) => a.eventId === data.eventId)} />
				{/key}
				<div><button class="btn btn-primary ops-btn-sm" type="submit"><Save size={15} aria-hidden="true" /> Save desks</button></div>
			</form>
		</section>

		<section class="ops-panel" aria-labelledby="scans">
			<div class="ops-panel-head">
				<div class="ops-heading">
					<span class="ops-heading-icon"><ScanLine size={16} aria-hidden="true" /></span>
					<h2 id="scans">Recent scans</h2>
				</div>
				<a class="btn btn-ghost ops-btn-sm" href="/admin/activity?handler={h.id}">All activity</a>
			</div>
			{#if data.transactions.length === 0}
				<p class="ops-hint">No scans yet.</p>
			{:else}
				<div class="ops-table-wrap">
					<table class="ops-table stack">
						<thead><tr><th>Time</th><th>Desk</th><th>Participant</th><th>Result</th></tr></thead>
						<tbody>
							{#each data.transactions.slice(0, 15) as t (t.id)}
								<tr>
									<td class="ops-muted nowrap" data-label="Time">{fmt(t.at)}</td>
									<td data-label="Desk">{categoryInfo(t.category as Category).label}</td>
									<td class="lead">{t.participantName ?? '—'} <span class="ops-muted ops-mono">{t.participantCode ?? ''}</span></td>
									<td class="end"><span class="ops-pill {t.result}">{RESULT[t.result]}</span> <span class="ops-muted">{t.title}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>

	<aside class="ops-column">
		<section class="ops-panel" aria-labelledby="details">
			<div class="ops-heading">
				<span class="ops-heading-icon"><UserPen size={16} aria-hidden="true" /></span>
				<h2 id="details">Details</h2>
			</div>
			<form method="post" action="?/update" class="ops-form compact" use:enhance={keep}>
				<label class="ops-label">Full name<input name="fullName" value={h.fullName} required maxlength="80" autocomplete="off" />
					{#if errors?.fullName}<small class="ops-field-error">{errors?.fullName}</small>{/if}</label>
				<label class="ops-label">Username<input name="username" value={h.username} required maxlength="32" autocomplete="off" />
					{#if errors?.username}<small class="ops-field-error">{errors?.username}</small>{/if}</label>
				<label class="ops-label">Email <small>Optional</small><input name="email" type="email" value={h.email ?? ''} maxlength="120" autocomplete="off" />
					{#if errors?.email}<small class="ops-field-error">{errors?.email}</small>{/if}</label>
				<label class="ops-label">Mobile <small>Optional</small><input name="mobile" value={h.mobile ?? ''} inputmode="tel" autocomplete="off" />
					{#if errors?.mobile}<small class="ops-field-error">{errors?.mobile}</small>{/if}</label>
				<div><button class="btn btn-primary ops-btn-sm" type="submit"><Save size={15} aria-hidden="true" /> Save details</button></div>
			</form>
		</section>

		<section class="ops-panel" aria-labelledby="audit">
			<details class="history">
				<summary>
					<span class="ops-heading">
						<span class="ops-heading-icon"><History size={16} aria-hidden="true" /></span>
						<h2 id="audit">Account history <small class="ops-muted">({data.auditLog.length})</small></h2>
					</span>
				</summary>
				{#if data.auditLog.length === 0}
					<p class="ops-hint">Nothing recorded yet.</p>
				{:else}
					<ul class="log">
						{#each data.auditLog as a (a.id)}
							<li>
								<span class="ops-mono">{a.action}</span>
								<span class="ops-muted">{fmt(a.at)} · {a.actor}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</details>
		</section>
	</aside>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		justify-self: start;
		color: var(--text-body);
		font-size: 14px;
		text-decoration: none;
	}

	h1 .ops-pill {
		margin-left: var(--space-2);
		vertical-align: middle;
	}

	.signin-panel {
		padding-block: var(--space-4);
	}

	.signin {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3) var(--space-8);
		margin: 0;
	}

	.signin dt {
		font-size: 12px;
		color: var(--text-supporting);
	}

	.signin dd {
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: 30px;
		margin: 0;
		font-size: 13px;
	}

	.signin dd > code {
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--paper);
		color: var(--charcoal);
		font: 12px/1.5 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		overflow-wrap: anywhere;
	}

	.signin .all {
		margin-left: auto;
	}

	.icon-btn {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-supporting);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--paper);
		color: var(--charcoal);
	}

	.compact {
		gap: var(--space-3);
	}

	.nowrap {
		white-space: nowrap;
	}

	.history summary {
		list-style: none;
		cursor: pointer;
	}

	.history summary::-webkit-details-marker {
		display: none;
	}

	.history[open] summary {
		margin-bottom: var(--space-3);
	}

	.log {
		display: grid;
		max-height: 320px;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.log li {
		display: grid;
		gap: 2px;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--rule);
		font-size: 13px;
	}

	.log li .ops-muted {
		font-size: 12px;
	}

	@media (max-width: 640px) {
		.signin .all {
			margin-left: 0;
		}
	}
</style>
