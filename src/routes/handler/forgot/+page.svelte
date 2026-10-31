<script lang="ts">
	import { enhance } from '$app/forms';
	import { BadgeCheck, CircleAlert, LoaderCircle, Mail } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';
	import AuthCard from '#lib/components/ops/AuthCard.svelte';

	let { form } = $props();

	let identifier = $state('');
	let pending = $state(false);
</script>

<svelte:head>
	<title>Forgot password · Event handler · Midtown Business Conclave</title>
</svelte:head>

<AuthCard
	eyebrow="Event handler"
	title="Forgot your password?"
	intro="We email a reset link to the address on your account. No email on your account? The event administrator can reset your password."
>
	{#if form?.sent}
		<div class="alert ok" role="status">
			<BadgeCheck size={18} aria-hidden="true" />
			<p>{form.sent}</p>
		</div>
		<div class="links"><a href="/handler/login">Back to sign in</a></div>
	{:else}
		<form
			method="post"
			use:enhance={() => {
				pending = true;
				return async ({ update }) => {
					await update({ reset: false });
					pending = false;
				};
			}}
		>
			<TextField id="identifier" label="Username or email" bind:value={identifier} required autocomplete="username" />
			{#if form?.message}
				<div class="alert" role="alert">
					<CircleAlert size={18} aria-hidden="true" />
					<p>{form.message}</p>
				</div>
			{/if}
			<button type="submit" class="btn btn-primary" disabled={pending}>
				{#if pending}<LoaderCircle size={18} class="ops-spin" aria-hidden="true" /> Sending…{:else}<Mail size={18} aria-hidden="true" /> Email me a reset link{/if}
			</button>
			<div class="links"><a href="/handler/login">Back to sign in</a></div>
		</form>
	{/if}
</AuthCard>
