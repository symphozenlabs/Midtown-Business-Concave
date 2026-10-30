<script lang="ts">
	import { EVENT } from '#lib/event.ts';
	import Hero from '#lib/components/Hero.svelte';
	import StoryMap from '#lib/components/StoryMap.svelte';
	import RegistrationSection from '#lib/components/RegistrationSection.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
</script>

<svelte:head>
	<title>Register · {EVENT.name} 2026</title>
	<meta
		name="description"
		content="Register for the {EVENT.name}: {EVENT.dateLabel}, {EVENT.timeLabel}, {EVENT.venue}. Presented by {EVENT.presenter}."
	/>
	<meta property="og:title" content="Register · {EVENT.name} 2026" />
	<meta property="og:description" content={EVENT.tagline} />
	<meta property="og:image" content="/poster/sample.webp" />
	<meta property="og:type" content="website" />
</svelte:head>

<a class="skip" href="#register">Skip to registration</a>

<Hero />
<main>
	<StoryMap />
	<RegistrationSection />
</main>
<SiteFooter />

<style>
	.skip {
		position: absolute;
		left: var(--space-4);
		top: -100px;
		z-index: 10;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--gold);
		color: var(--ink);
		font: var(--text-ui);
	}

	.skip:focus {
		top: var(--space-4);
	}
</style>
