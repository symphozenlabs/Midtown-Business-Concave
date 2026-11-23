<script lang="ts">
	import { enhance } from '$app/forms';
	import { CircleAlert, MailCheck } from '@lucide/svelte';

	/** Every directory screen except the open directory itself. */
	let { screen }: { screen: 'not-ready' | 'signed-out' | 'unpaid' | 'closed' } = $props();

	let sending = $state(false);
	let sent = $state(false);
	let message = $state('');
</script>

<section class="ops-card" aria-labelledby="dir-state-title">
	<span class="ops-eyebrow">Visitors directory</span>
	{#if screen === 'signed-out'}
		<h1 id="dir-state-title" class="title">Open your pass on this phone first.</h1>
		<p class="ops-sub">
			The directory is only for registered delegates. Tap <strong>Open my pass</strong> in your ticket email on this phone, then
			come back.
		</p>
		{#if sent}
			<div class="ops-banner ok" role="status">
				<MailCheck size={18} aria-hidden="true" />
				<p>If that email is registered, we’ve sent your link. Open it on this phone.</p>
			</div>
		{:else}
			<p class="ops-muted">Can’t find the email? We’ll send the link again.</p>
			{#if message}
				<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{message}</p></div>
			{/if}
			<!-- Posts to the directory page, so this works from a conversation link too. -->
			<form
				method="post"
				action="/visitorDirectory?/sendLink"
				class="ops-form"
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
				<label class="ops-label">
					Email you registered with
					<input type="email" name="email" autocomplete="email" inputmode="email" required maxlength="120" />
				</label>
				<button class="ops-big-btn" type="submit" disabled={sending}>
					{sending ? 'Sending…' : 'Email me my pass link'}
				</button>
			</form>
		{/if}
	{:else if screen === 'unpaid'}
		<h1 id="dir-state-title" class="title">Your payment isn’t confirmed yet.</h1>
		<p class="ops-sub">The directory opens once it is.</p>
	{:else if screen === 'closed'}
		<h1 id="dir-state-title" class="title">The visitors directory has closed.</h1>
		<p class="ops-sub">Thank you for joining us.</p>
	{:else}
		<h1 id="dir-state-title" class="title">The visitors directory opens soon.</h1>
		<p class="ops-sub">Check back closer to the event.</p>
	{/if}
</section>

<style>
	.title {
		font: 500 24px/1.25 var(--font-display);
		color: var(--charcoal);
	}
</style>
