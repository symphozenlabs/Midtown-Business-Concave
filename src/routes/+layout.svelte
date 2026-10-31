<script lang="ts">
	import '../../design/tokens.css';
	import '../app.css';
	import '#lib/poster/fonts.css';
	import 'lenis/dist/lenis.css';
	import { page } from '$app/state';
	import { startSmoothScroll } from '#lib/smooth-scroll.ts';

	let { children } = $props();

	// Inertial scrolling belongs to the public site. Organiser, handler and pass pages
	// scroll natively, so popups and long tables behave like any other web page.
	const APP_PAGES = /^\/(admin|handler|login|pass|me|certificate)(\/|$)/;
	const smooth = $derived(!APP_PAGES.test(page.url.pathname));

	$effect(() => {
		if (smooth) return startSmoothScroll();
	});
</script>

{@render children()}
