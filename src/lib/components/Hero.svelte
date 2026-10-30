<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowDown, CalendarDays, Clock, MapPin } from '@lucide/svelte';
	import { EVENT } from '#lib/event.ts';
	import { eventLabels } from '#lib/event-settings.ts';
	import { loadSiteConfig, siteConfig } from '#lib/site-config.svelte.ts';
	import Countdown from './Countdown.svelte';
	import HeroBackdrop from './HeroBackdrop.svelte';
	import Skyline from './Skyline.svelte';

	let hero: HTMLElement;
	let logo: HTMLElement;

	// Centre the backdrop's sunburst exactly on the logo, whatever the layout.
	onMount(() => {
		loadSiteConfig();
		const align = () => {
			const h = hero.getBoundingClientRect();
			const l = logo.getBoundingClientRect();
			hero.style.setProperty('--vp-x', `${l.left + l.width / 2 - h.left}px`);
			hero.style.setProperty('--vp-y', `${l.top + l.height / 2 - h.top}px`);
		};
		align();
		const ro = new ResizeObserver(align);
		ro.observe(hero);
		ro.observe(logo);
		return () => ro.disconnect();
	});

	// Prerendered with the defaults; updates once the schedule set on the dashboard loads.
	const when = $derived(eventLabels(siteConfig.event));
	const facts = $derived([
		{ icon: CalendarDays, label: 'Date', value: when.compactDate, short: when.compactDate, full: when.dateLabel },
		{ icon: Clock, label: 'Time', value: when.compactTime, short: when.compactTime, full: when.timeLabel },
		{ icon: MapPin, label: 'Venue', value: EVENT.venue, short: EVENT.compactVenue, full: EVENT.venue }
	]);
</script>

<header class="hero on-ink" bind:this={hero}>
	<HeroBackdrop />

	<div class="container bar">
		<div class="organisers">
			<span class="organised-by">Organised by</span>
			<div class="logos">
				<img src="/poster/sef.webp" alt="Salem Entrepreneurs Forum" width="1948" height="637" class="sef" />
				<span class="divider" aria-hidden="true"></span>
				<img src="/poster/me.webp" alt="Midtown Events" width="2036" height="652" class="me" />
			</div>
		</div>
		<a href="#register" class="btn btn-gold small">Register</a>
	</div>

	<div class="container content">
		<div class="copy">
			<span class="eyebrow rise" style="--d: 0ms">{EVENT.name} 2026</span>
			<h1 class="rise" style="--d: 80ms">Connecting entrepreneurs across <em>Tamil Nadu</em></h1>
			<p class="lead rise" style="--d: 160ms">
				One day in Salem to meet founders, explore B2B stalls and join workshops.
				<span class="presenter">Presented by {EVENT.presenter}.</span>
			</p>

			<dl class="facts rise" style="--d: 240ms">
				{#each facts as fact (fact.label)}
					<div class="fact">
						<fact.icon size={22} strokeWidth={1.5} aria-hidden="true" />
						<div>
							<dt>{fact.label}</dt>
							<dd>
								<span class="long" aria-hidden="true">{fact.value}</span><span class="short" aria-hidden="true"
									>{fact.short}</span
								><span class="visually-hidden">{fact.full}</span>
							</dd>
						</div>
					</div>
				{/each}
			</dl>

			<div class="cta rise" style="--d: 320ms">
				<a href="#register" class="btn btn-gold">
					Register as a delegate <ArrowDown size={18} aria-hidden="true" />
				</a>
				<Countdown />
			</div>
		</div>

		<figure class="brand rise" style="--d: 120ms">
			<div class="logo" bind:this={logo}>
				<img src="/poster/mbc.webp" alt={EVENT.name} width="1655" height="747" fetchpriority="high" />
			</div>
		</figure>
	</div>

	<div class="skyline-wrap">
		<Skyline />
	</div>
</header>

<style>
	/*
	 * The hero always fits the first screen: type, spacing, logo and skyline scale
	 * with the viewport height (svh) as well as its width, so short laptop windows
	 * and phones show everything down to the register button.
	 */
	.hero {
		--gap: clamp(10px, 2.4svh, 24px);
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		min-height: 100svh;
		background: #08112a;
		color: var(--on-ink-soft);
		overflow: hidden;
		isolation: isolate;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding-block: clamp(10px, 2.4svh, 24px);
	}

	.organisers {
		display: grid;
		gap: var(--space-2);
	}

	.organised-by {
		font: 500 11px/1 var(--font-sans);
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: rgb(240 196 112 / 0.9);
	}

	.logos {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.logos img {
		width: auto;
	}

	.sef {
		height: clamp(30px, 5.6svh, 44px);
	}

	.me {
		height: clamp(23px, 4.3svh, 34px);
	}

	.divider {
		width: 1px;
		height: clamp(26px, 4.8svh, 38px);
		background: linear-gradient(180deg, rgb(240 190 100 / 0), rgb(240 190 100 / 0.9), rgb(240 190 100 / 0));
	}

	.small {
		min-height: 40px;
		padding-inline: var(--space-4);
	}

	.content {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
		gap: clamp(var(--space-8), 5vw, 80px);
		align-items: center;
		padding-block: clamp(4px, 2svh, 32px);
	}

	.copy {
		display: grid;
		gap: var(--gap);
		justify-items: start;
	}

	h1 {
		font: var(--text-display);
		font-size: clamp(32px, min(4.8vw, 7.4svh), 68px);
		line-height: 1.08;
		color: var(--on-ink);
	}

	h1 em {
		font-style: italic;
		background: linear-gradient(100deg, var(--gold-bright) 0%, var(--gold) 45%, var(--gold-deep) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.06em;
	}

	.lead {
		max-width: 46ch;
		font: var(--text-lead);
		font-size: clamp(15px, min(1.4vw, 2.4svh), 19px);
		color: var(--on-ink-soft);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(3, auto);
		justify-content: start;
		width: 100%;
		margin: 0;
		padding-block: clamp(8px, 1.8svh, 16px);
		border-block: 1px solid rgb(240 196 112 / 0.18);
	}

	.fact {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding-inline: clamp(12px, 2vw, 24px);
		border-left: 1px solid rgb(240 196 112 / 0.18);
		color: var(--gold);
	}

	.fact:first-child {
		padding-left: 0;
		border-left: 0;
	}

	.fact :global(svg) {
		margin-top: 2px;
		flex: none;
	}

	dt {
		font: var(--text-eyebrow);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--on-ink-soft);
	}

	dd {
		margin: 2px 0 0;
		font: var(--text-ui);
		color: var(--on-ink);
		white-space: nowrap;
	}

	dd .short {
		display: none;
	}

	.cta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4) var(--space-8);
	}

	.cta :global(.value) {
		font-size: clamp(20px, 3.6svh, 28px);
	}

	.brand {
		display: grid;
		place-items: center;
		margin: 0;
	}

	.logo {
		/* Never taller than about half the screen. */
		width: min(100%, 580px, 118svh);
	}

	.logo img {
		width: 100%;
		height: auto;
		filter: drop-shadow(0 18px 40px rgb(0 0 0 / 0.55)) drop-shadow(0 0 30px rgb(255 170 60 / 0.18));
	}

	.skyline-wrap {
		margin-top: auto;
		line-height: 0;
	}

	.skyline-wrap :global(.skyline) {
		height: clamp(48px, min(11vw, 13svh), 160px);
	}

	.rise {
		animation: rise var(--duration-entrance-max) var(--ease-out) both;
		animation-delay: calc(var(--d, 0ms) + 120ms);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
	}

	@media (max-width: 1023px) {
		.content {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--gap);
		}

		/* Logo first on narrow screens, kept to about a fifth of the screen height. */
		.brand {
			order: -1;
		}

		/* The logo right above already names the event. */
		.copy > .eyebrow {
			display: none;
		}

		.logo {
			width: min(100%, 460px, 46svh);
		}

		h1 {
			font-size: clamp(30px, min(9vw, 5.6svh), 56px);
		}
	}

	@media (max-width: 600px) {
		.hero {
			--gap: clamp(8px, 1.9svh, 18px);
		}

		.organised-by {
			font-size: 10px;
		}

		.logos {
			gap: var(--space-3);
		}

		.lead {
			font-size: clamp(14px, 2.2svh, 16px);
		}

		/* The organisers are already in the top bar. */
		.presenter {
			display: none;
		}

		/* Compact text-only strip so the facts take one short row on phones. */
		.facts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.fact {
			padding-inline: clamp(8px, 3vw, 14px);
		}

		.fact :global(svg) {
			display: none;
		}

		dt {
			font-size: 10px;
			letter-spacing: 0.14em;
		}

		dd {
			font-size: 13px;
		}

		dd .long {
			display: none;
		}

		dd .short {
			display: inline;
		}

		.cta {
			width: 100%;
		}

		.cta .btn {
			width: 100%;
		}
	}
</style>
