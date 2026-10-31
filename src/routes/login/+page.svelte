<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { CircleAlert, LoaderCircle, LockKeyhole } from '@lucide/svelte';
	import TextField from '#lib/components/TextField.svelte';

	let { form } = $props();

	let identifier = $state(untrack(() => form?.identifier ?? ''));
	let password = $state('');
	let pending = $state(false);
</script>

<svelte:head>
	<title>Sign in · Midtown Business Conclave</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="login">
	<section class="card" aria-labelledby="login-title">
		<img src="/poster/mbc.webp" alt="Midtown Business Conclave" width="1655" height="747" class="logo" />
		<div class="head">
			<span class="eyebrow">Organisers and event handlers</span>
			<h1 id="login-title">Sign in</h1>
			<p>Organisers sign in with their email. Event handlers use the username and password the organiser gave them.</p>
		</div>

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

			{#if form?.message}
				<div class="alert" role="alert">
					<CircleAlert size={18} aria-hidden="true" />
					<p>{form.message}</p>
				</div>
			{/if}

			<button type="submit" class="btn btn-primary" disabled={pending}>
				{#if pending}
					<LoaderCircle size={18} class="spin" aria-hidden="true" /> Signing in…
				{:else}
					<LockKeyhole size={18} aria-hidden="true" /> Sign in
				{/if}
			</button>
		</form>
	</section>
</main>

<style>
	.login {
		display: grid;
		place-items: center;
		min-height: 100svh;
		padding: var(--space-6) var(--gutter-phone);
		background:
			radial-gradient(60% 50% at 50% 0%, rgb(255 172 72 / 0.18), transparent 70%),
			linear-gradient(180deg, #0c1730, #04070f);
	}

	.card {
		display: grid;
		gap: var(--space-6);
		width: 100%;
		max-width: 420px;
		padding: clamp(var(--space-6), 5vw, 40px);
		background: var(--white);
		border-radius: var(--radius-lg);
	}

	.logo {
		width: 180px;
		height: auto;
		margin-inline: auto;
		padding: 12px 18px;
		border-radius: var(--radius-md);
		background: #0c1730;
		box-sizing: content-box;
	}

	.head {
		display: grid;
		gap: var(--space-2);
	}

	h1 {
		font: var(--text-h3);
	}

	.head p {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	form {
		display: grid;
		gap: var(--space-4);
	}

	.btn {
		width: 100%;
		margin-top: var(--space-2);
	}

	.alert {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.alert :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.alert p {
		font: var(--text-caption);
		color: var(--charcoal);
	}

	:global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
