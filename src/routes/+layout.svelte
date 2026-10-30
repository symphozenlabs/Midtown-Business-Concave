<script lang="ts">
	import '../../design/tokens.css';
	import '../app.css';
	import '#lib/poster/fonts.css';
	import 'lenis/dist/lenis.css';
	import { onMount } from 'svelte';
	import { startSmoothScroll } from '#lib/smooth-scroll.ts';

	let { children } = $props();

	onMount(() => startSmoothScroll());
</script>

{@render children()}
