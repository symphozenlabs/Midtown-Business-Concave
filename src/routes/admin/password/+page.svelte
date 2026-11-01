<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, CircleCheck, KeyRound, LoaderCircle } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';
	import AuthCard from '#lib/components/ops/AuthCard.svelte';

	let { form } = $props();

	let current = $state('');
	let password = $state('');
	let confirm = $state('');
	let pending = $state(false);
</script>

<svelte:head>
	<title>Change password · Organiser · Midtown Business Conclave</title>
</svelte:head>

<AuthCard inline eyebrow="Your account" title="Change password" intro="Other devices signed in to the dashboard will be signed out.">
	<form
		method="post"
		use:enhance={() => {
			pending = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') current = password = confirm = '';
				pending = false;
			};
		}}
	>
		<TextField id="current" label="Current password" type="password" bind:value={current} required autocomplete="current-password" />
		<TextField id="password" label="New password" type="password" bind:value={password} required autocomplete="new-password" help="At least 10 characters, with letters and numbers." />
		<TextField id="confirm" label="Repeat new password" type="password" bind:value={confirm} required autocomplete="new-password" />
		{#if form?.message}
			<div class="alert" role="alert">
				<CircleAlert size={18} aria-hidden="true" />
				<p>{form.message}</p>
			</div>
		{:else if form?.saved}
			<div class="alert ok" role="status">
				<CircleCheck size={18} aria-hidden="true" />
				<p>Password changed. Use the new one next time you sign in.</p>
			</div>
		{/if}
		<button type="submit" class="btn btn-primary" disabled={pending}>
			{#if pending}<LoaderCircle size={18} class="ops-spin" aria-hidden="true" /> Saving…{:else}<KeyRound size={18} aria-hidden="true" /> Save password{/if}
		</button>
		<div class="links"><a href="/admin">Back to the dashboard</a></div>
	</form>
</AuthCard>
