<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, BadgeCheck, CircleAlert, Copy, LogOut, Power, RotateCcwKey, Save, Trash } from '@lucide/svelte';
	import AssignmentFields from '#lib/components/ops/AssignmentFields.svelte';
	import { categoryInfo, type Category } from '#lib/ops/categories.ts';

	let { data, form } = $props();

	const errors = $derived((form as { errors?: Record<string, string> } | null)?.errors);

	const h = $derived(data.handler);
	let copied = $state(false);
	let confirmRemove = $state(false);

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '—');
	const RESULT = { success: 'Done', duplicate: 'Duplicate', rejected: 'Rejected' } as const;

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}
</script>

<svelte:head>
	<title>{h.fullName} · Handlers · Admin · Midtown Business Conclave</title>
</svelte:head>

<a class="back" href="/admin/handlers"><ArrowLeft size={16} aria-hidden="true" /> All handlers</a>

{#if form?.password}
	<div class="ops-secret" role="status">
		<RotateCcwKey size={18} aria-hidden="true" />
		<span>New temporary password for <strong>{h.username}</strong>: <strong>{form.password}</strong></span>
		<button type="button" class="btn btn-secondary ops-btn-sm" onclick={() => copy(`Username: ${h.username}\nTemporary password: ${form!.password}`)}>
			<Copy size={14} aria-hidden="true" />
			{copied ? 'Copied' : 'Copy'}
		</button>
		<span class="ops-muted">Shown once.</span>
	</div>
{:else if form?.message}
	<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
{:else if form?.success}
	<div class="ops-banner ok" role="status"><BadgeCheck size={16} aria-hidden="true" /><p>{form.success}</p></div>
{/if}

<section class="ops-panel" aria-labelledby="who">
	<div class="ops-panel-head">
		<div>
			<h1 id="who">{h.fullName}</h1>
			<p class="ops-hint">
				<span class="ops-mono">{h.username}</span> · created {fmt(h.createdAt)} by {h.createdBy} · last sign-in {fmt(h.lastLoginAt)} ·
				{h.activeSessions} signed-in {h.activeSessions === 1 ? 'device' : 'devices'}
			</p>
		</div>
		<span class="ops-pill {h.status}">{h.status === 'active' ? (h.lockedUntil ? 'Locked' : 'Active') : h.status === 'inactive' ? 'Deactivated' : 'Archived'}</span>
	</div>

	<div class="ops-actions">
		<form method="post" action="?/resetPassword" use:enhance>
			<button class="btn btn-secondary ops-btn-sm" type="submit"><RotateCcwKey size={15} aria-hidden="true" /> Reset password</button>
		</form>
		<form method="post" action="?/revoke" use:enhance>
			<button class="btn btn-secondary ops-btn-sm" type="submit" disabled={h.activeSessions === 0}><LogOut size={15} aria-hidden="true" /> Sign out everywhere</button>
		</form>
		{#if h.status === 'active'}
			<form method="post" action="?/deactivate" use:enhance>
				<button class="btn btn-secondary ops-btn-sm" type="submit"><Power size={15} aria-hidden="true" /> Deactivate</button>
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
	{#if confirmRemove}
		<p class="ops-hint">An account with no scans is deleted. One with scan history is archived, so the records stay.</p>
	{/if}
</section>

<div class="two">
	<section class="ops-panel" aria-labelledby="details">
		<h2 id="details">Details</h2>
		<form method="post" action="?/update" class="ops-form" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<label class="ops-label">Full name<input name="fullName" value={h.fullName} required maxlength="80" />
				{#if errors?.fullName}<small class="err">{errors?.fullName}</small>{/if}</label>
			<label class="ops-label">Username<input name="username" value={h.username} required maxlength="32" />
				{#if errors?.username}<small class="err">{errors?.username}</small>{/if}</label>
			<label class="ops-label">Email <small>Optional</small><input name="email" type="email" value={h.email ?? ''} maxlength="120" />
				{#if errors?.email}<small class="err">{errors?.email}</small>{/if}</label>
			<label class="ops-label">Mobile <small>Optional</small><input name="mobile" value={h.mobile ?? ''} inputmode="tel" />
				{#if errors?.mobile}<small class="err">{errors?.mobile}</small>{/if}</label>
			<div class="ops-actions"><button class="btn btn-primary ops-btn-sm" type="submit"><Save size={15} aria-hidden="true" /> Save details</button></div>
		</form>
	</section>

	<section class="ops-panel" aria-labelledby="cats">
		<h2 id="cats">Categories</h2>
		<p class="ops-hint">The handler cannot change these. Changes apply on their next tap; their current page refuses a desk they lose.</p>
		<form method="post" action="?/assignments" class="ops-form" use:enhance={() => async ({ update }) => update({ reset: false })}>
			{#key h.assignments}
				<AssignmentFields options={data.options} current={h.assignments.filter((a) => a.eventId === data.eventId)} />
			{/key}
			<div class="ops-actions"><button class="btn btn-primary ops-btn-sm" type="submit"><Save size={15} aria-hidden="true" /> Save categories</button></div>
		</form>
	</section>
</div>

<section class="ops-panel" aria-labelledby="scans">
	<div class="ops-panel-head">
		<h2 id="scans">Recent scans</h2>
		<a class="btn btn-ghost ops-btn-sm" href="/admin/activity?handler={h.id}">All activity</a>
	</div>
	{#if data.transactions.length === 0}
		<p class="ops-hint">No scans yet.</p>
	{:else}
		<div class="ops-table-wrap">
			<table class="ops-table">
				<thead><tr><th>Time</th><th>Desk</th><th>Participant</th><th>Result</th></tr></thead>
				<tbody>
					{#each data.transactions as t (t.id)}
						<tr>
							<td class="ops-muted">{fmt(t.at)}</td>
							<td>{categoryInfo(t.category as Category).label}</td>
							<td>{t.participantName ?? '—'} <span class="ops-muted ops-mono">{t.participantCode ?? ''}</span></td>
							<td><span class="ops-pill {t.result}">{RESULT[t.result]}</span> <span class="ops-muted">{t.title}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="ops-panel" aria-labelledby="audit">
	<h2 id="audit">Account history</h2>
	{#if data.auditLog.length === 0}
		<p class="ops-hint">Nothing recorded yet.</p>
	{:else}
		<div class="ops-table-wrap">
			<table class="ops-table">
				<thead><tr><th>Time</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
				<tbody>
					{#each data.auditLog as a (a.id)}
						<tr>
							<td class="ops-muted">{fmt(a.at)}</td>
							<td>{a.actor} <span class="ops-muted">({a.actorType})</span></td>
							<td class="ops-mono">{a.action}</td>
							<td class="ops-muted details">{a.details ? JSON.stringify(a.details) : ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-body);
		font-size: 14px;
		text-decoration: none;
	}

	.two {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
		gap: var(--space-6);
		align-items: start;
	}

	.err {
		color: var(--danger) !important;
	}

	.details {
		max-width: 420px;
		overflow-wrap: anywhere;
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		font-size: 11px;
	}

	@media (max-width: 1000px) {
		.two {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
