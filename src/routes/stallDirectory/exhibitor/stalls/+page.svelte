<script lang="ts">
	import StallBrowser from '#lib/components/directory/StallBrowser.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Stalls · Exhibitor · Midtown Business Conclave</title>
</svelte:head>

<StallBrowser exhibitors={data.exhibitors} mine={data.mine} canMessage={false} />
