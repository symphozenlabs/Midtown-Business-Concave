<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, KeyRound, LoaderCircle } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';
	import AuthCard from '#lib/components/ops/AuthCard.svelte';

	let { data, form } = $props();

	let password = $state('');
	let confirm = $state('');
	let pending = $state(false);
</script>

<svelte:head>
	<title>New password · Event handler · Midtown Business Conclave</title>
</svelte:head>

<AuthCard eyebrow="Event handler" title="Choose a new password">
	{#if !data.valid}
		<div class="alert" role="alert">
			<CircleAlert size={18} aria-hidden="true" />
			<p>This link has expired or was already used.</p>
		</div>
		<div class="links"><a href="/handler/forgot">Ask for a new link</a></div>
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
			<TextField id="password" label="New password" type="password" bind:value={password} required autocomplete="new-password" help="At least 10 characters, with letters and numbers." />
			<TextField id="confirm" label="Repeat new password" type="password" bind:value={confirm} required autocomplete="new-password" />
			{#if form?.message}
				<div class="alert" role="alert">
					<CircleAlert size={18} aria-hidden="true" />
					<p>{form.message}</p>
				</div>
			{/if}
			<button type="submit" class="btn btn-primary" disabled={pending}>
				{#if pending}<LoaderCircle size={18} class="ops-spin" aria-hidden="true" /> Saving…{:else}<KeyRound size={18} aria-hidden="true" /> Save password{/if}
			</button>
		</form>
	{/if}
</AuthCard>
