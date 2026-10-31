<script lang="ts">
	import '#lib/ops/ops.css';
	import { onMount } from 'svelte';
	import { KeyRound, LogOut } from '@lucide/svelte';

	let { data, children } = $props();

	let online = $state(true);

	onMount(() => {
		online = navigator.onLine;
		const up = () => (online = true);
		const down = () => (online = false);
		addEventListener('online', up);
		addEventListener('offline', down);
		return () => {
			removeEventListener('online', up);
			removeEventListener('offline', down);
		};
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="theme-color" content="#0c1730" />
</svelte:head>

{#if data.handler}
	<div class="ops-shell">
		<header class="ops-top">
			<a href="/handler" aria-label="Your desks"><img src="/poster/mbc.webp" alt="Midtown Business Conclave" width="1655" height="747" /></a>
			<div class="ops-who">
				<strong>{data.handler.fullName}</strong>
				<span>Event handler · {data.handler.username}</span>
			</div>
			<span class="ops-net" class:offline={!online} role="status">{online ? 'Online' : 'Offline'}</span>
			{#if !data.handler.mustChangePassword}
				<a class="ops-icon-btn" href="/handler/password" aria-label="Change password" title="Change password">
					<KeyRound size={20} aria-hidden="true" />
				</a>
			{/if}
			<form method="post" action="/handler/logout">
				<button type="submit" class="ops-icon-btn" aria-label="Sign out" title="Sign out"><LogOut size={20} aria-hidden="true" /></button>
			</form>
		</header>
		{@render children()}
	</div>
{:else}
	{@render children()}
{/if}
