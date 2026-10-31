<script lang="ts">
	import { page } from '$app/state';
	import { ShieldCheck } from '@lucide/svelte';
</script>

<svelte:head>
	<title>{page.status === 403 ? 'Not your desk' : 'Something went wrong'} · Midtown Business Conclave</title>
</svelte:head>

<main class="ops-wrap">
	<div class="ops-card">
		<span class="ops-eyebrow">{page.status === 403 ? 'Access refused' : `Error ${page.status}`}</span>
		<h1 class="ops-title">{page.status === 403 ? 'Not your desk' : 'Something went wrong'}</h1>
		<p class="ops-sub">{page.error?.message ?? 'Please try again.'}</p>
		<a class="ops-big-btn secondary" href="/handler"><ShieldCheck size={22} aria-hidden="true" /> Go to my desks</a>
	</div>
</main>
