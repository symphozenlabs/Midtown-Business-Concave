<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { BadgeCheck, CircleAlert, LoaderCircle, LockKeyhole } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';
	import AuthCard from '#lib/components/ops/AuthCard.svelte';

	let { data, form } = $props();

	let identifier = $state(untrack(() => form?.identifier ?? ''));
	let password = $state('');
	let pending = $state(false);
</script>

<svelte:head>
	<title>Sign in · Event handler · Midtown Business Conclave</title>
</svelte:head>

<AuthCard eyebrow="Event handler" title="Sign in" intro="Use the account your event administrator gave you.">
	{#if !data.available}
		<div class="alert" role="alert">
			<CircleAlert size={18} aria-hidden="true" />
			<p>Event operations are not set up yet: the database is not configured.</p>
		</div>
	{/if}
	{#if data.reset}
		<div class="alert ok" role="status">
			<BadgeCheck size={18} aria-hidden="true" />
			<p>Password changed. Sign in with your new password.</p>
		</div>
	{/if}

	<form
		method="post"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update({ reset: false });
				pending = false;
				password = '';
			};
		}}
	>
		<TextField id="identifier" label="Username or email" bind:value={identifier} required autocomplete="username" />
		<TextField id="password" label="Password" type="password" bind:value={password} required autocomplete="current-password" />

		<label class="ops-check">
			<input type="checkbox" name="remember" />
			Remember me on this phone for 30 days
		</label>

		{#if form?.message}
			<div class="alert" role="alert">
				<CircleAlert size={18} aria-hidden="true" />
				<p>{form.message}</p>
			</div>
		{/if}

		<button type="submit" class="btn btn-primary" disabled={pending || !data.available}>
			{#if pending}
				<LoaderCircle size={18} class="ops-spin" aria-hidden="true" /> Signing in…
			{:else}
				<LockKeyhole size={18} aria-hidden="true" /> Sign in
			{/if}
		</button>

		<div class="links">
			<a href="/handler/forgot">Forgot password?</a>
			<span class="ops-muted">No account? Ask the administrator.</span>
		</div>
	</form>
</AuthCard>
