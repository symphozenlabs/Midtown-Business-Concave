<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { BadgeCheck, ChevronRight, CircleAlert, Copy, LoaderCircle, UserPlus, X } from '@lucide/svelte';
	import AssignmentFields from '#lib/components/ops/AssignmentFields.svelte';
	import { categoryInfo, type Category } from '#lib/ops/categories.ts';

	let { data, form } = $props();

	/** Every shape the create action answers with. */
	interface Feedback {
		message?: string;
		errors?: Record<string, string>;
		values?: { fullName?: string; username?: string; email?: string | null; mobile?: string | null };
		created?: { id: string; fullName: string; username: string; password: string };
	}
	const f = $derived(form as Feedback | null);

	let creating = $state(untrack(() => data.available && data.handlers.length === 0));
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
				Created <b>{form.created.fullName}</b>. Username <strong>{form.created.username}</strong> · temporary password
				<strong>{form.created.password}</strong>
			</span>
			<button
				type="button"
				class="btn btn-secondary ops-btn-sm"
				onclick={() => copyCredentials(`Username: ${form!.created!.username}\nTemporary password: ${form!.created!.password}\nSign in: ${location.origin}/handler/login`)}
			>
				<Copy size={14} aria-hidden="true" />
				{copied ? 'Copied' : 'Copy sign-in details'}
			</button>
			<span class="ops-muted">Shown once. They must choose their own password at first sign-in.</span>
		</div>
	{:else if form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
	{/if}

	<section class="ops-stats" aria-label="Handlers">
		<div class="ops-stat"><span>Total handlers</span><strong>{data.summary.total}</strong></div>
		<div class="ops-stat"><span>Active accounts</span><strong>{data.summary.active}</strong></div>
		<div class="ops-stat"><span>Signed in now</span><strong>{data.summary.onlineNow}</strong></div>
		<div class="ops-stat"><span>Total scans</span><strong>{data.summary.scans}</strong></div>
	</section>

	<section class="ops-panel" aria-labelledby="create-title">
		<div class="ops-panel-head">
			<div>
				<h1 id="create-title">Event handler management</h1>
				<p class="ops-hint">Only you can create handler accounts. Each handler reaches only the desks you assign.</p>
			</div>
			<button type="button" class="btn {creating ? 'btn-ghost' : 'btn-primary'} ops-btn-sm" onclick={() => (creating = !creating)}>
				{#if creating}<X size={15} aria-hidden="true" /> Close{:else}<UserPlus size={15} aria-hidden="true" /> Create new handler{/if}
			</button>
		</div>

		{#if creating}
			{#key formKey}
				<form
					method="post"
					action="?/create"
					class="ops-form"
					transition:slide={{ duration: 220, easing: cubicOut }}
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
						<div class="ops-label">
							Password
							<p class="ops-hint">A temporary password is generated and shown once after you create the account.</p>
						</div>
					</div>

					<AssignmentFields options={data.options} />

					<div class="ops-actions">
						<button type="submit" class="btn btn-primary" disabled={pending}>
							{#if pending}<LoaderCircle size={18} class="ops-spin" aria-hidden="true" /> Creating…{:else}<UserPlus size={18} aria-hidden="true" /> Create handler{/if}
						</button>
					</div>
				</form>
			{/key}
		{/if}
	</section>

	<section class="ops-panel" aria-labelledby="list-title">
		<h2 id="list-title">Handlers ({data.handlers.length})</h2>
		{#if data.handlers.length === 0}
			<p class="ops-hint">No handlers yet.</p>
		{:else}
			<div class="ops-table-wrap">
				<table class="ops-table">
					<thead>
						<tr>
							<th>Handler</th>
							<th>Categories</th>
							<th>Status</th>
							<th>Last sign-in</th>
							<th class="num">Scans ✓ / dup / ✗</th>
							<th><span class="visually-hidden">Manage</span></th>
						</tr>
					</thead>
					<tbody>
						{#each data.handlers as h (h.id)}
							{@const t = data.tallies[h.id] ?? { success: 0, duplicate: 0, rejected: 0 }}
							{@const st = statusOf(h)}
							<tr>
								<td>
									<a href="/admin/handlers/{h.id}">{h.fullName}</a>
									<div class="ops-muted ops-mono">{h.username}</div>
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
								<td class="ops-muted">{fmt(h.lastLoginAt)}</td>
								<td class="num">{t.success} / {t.duplicate} / {t.rejected}</td>
								<td><a class="btn btn-ghost ops-btn-sm" href="/admin/handlers/{h.id}">Manage <ChevronRight size={14} aria-hidden="true" /></a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
{/if}

<style>
	.with-btn {
		display: flex;
		gap: var(--space-2);
	}

	.err {
		color: var(--danger) !important;
	}

	.cats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	code {
		font-size: 12px;
	}
</style>
