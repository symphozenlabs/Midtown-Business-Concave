<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, MailCheck } from '@lucide/svelte';

	/** For delegates who aren't signed in on this phone: posts to /stallDirectory?/sendLink. */
	let { next, lead = 'Registered for the conclave? Sign in to message exhibitors.' }: { next: string; lead?: string } = $props();

	let sending = $state(false);
	let sent = $state(false);
	let message = $state('');
</script>

<div class="signin">
	<p class="lead">{lead}</p>
	<p class="ops-muted">Tap <strong>Open my pass</strong> in your ticket email on this phone, or get the link again:</p>
	{#if sent}
		<div class="ops-banner ok" role="status">
			<MailCheck size={18} aria-hidden="true" />
			<p>If that email is registered, we’ve sent your link. Open it on this phone.</p>
		</div>
	{:else}
		{#if message}
			<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{message}</p></div>
		{/if}
		<form
			method="post"
			action="/stallDirectory?/sendLink"
			class="row"
			use:enhance={() => {
				sending = true;
				message = '';
				return async ({ result }) => {
					sending = false;
					if (result.type === 'success') sent = true;
					else if (result.type === 'failure') message = String(result.data?.message ?? 'That did not work. Try again.');
					else message = 'That did not work. Try again.';
				};
			}}
		>
			<input type="hidden" name="next" value={next} />
			<label class="visually-hidden" for="signin-email">Email you registered with</label>
			<input id="signin-email" type="email" name="email" autocomplete="email" inputmode="email" required maxlength="120" placeholder="Email you registered with" />
			<button class="btn btn-primary" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Email me my link'}</button>
		</form>
	{/if}
</div>

<style>
	.signin {
		display: grid;
		gap: var(--space-2);
	}
	.lead {
		color: var(--charcoal);
		font-weight: 600;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.row input {
		flex: 1 1 220px;
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-md);
		background: var(--white);
		font: 400 16px var(--font-sans);
	}
	.row input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
