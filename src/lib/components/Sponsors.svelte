<script lang="ts">
	import { reveal } from '#lib/actions/reveal.ts';

	// Logos are trimmed copies of the sponsors' artwork in posters/. `fit` says
	// which side limits the logo: tall marks fill the plate's height, wide
	// wordmarks its width, so both read at the same visual weight.
	const SPONSORS = [
		{ role: 'AI Technology Partner', name: 'ITK', src: '/poster/itk.webp', width: 444, height: 285, fit: 'tall' },
		{ role: 'Associate Sponsor', name: 'Namma Office', src: '/poster/namma-office.webp', width: 707, height: 179, fit: 'wide' }
	] as const;
</script>

<section class="sponsors on-ink" aria-labelledby="sponsors-title">
	<div class="container">
		<header class="intro" use:reveal>
			<span class="eyebrow">Sponsors &amp; partners</span>
			<h2 id="sponsors-title">The partners behind the <em>conclave</em></h2>
			<span class="rule" aria-hidden="true"></span>
		</header>

		<ul class="list">
			{#each SPONSORS as sponsor, i (sponsor.name)}
				<li class="sponsor" use:reveal={120 + i * 140}>
					<span class="role">{sponsor.role}</span>
					<div class="float" style="--float-delay: {-i * 3.5}s">
						<span class="halo" aria-hidden="true"></span>
						<div class="frame">
							<div class="plate {sponsor.fit}">
								<img src={sponsor.src} alt={sponsor.name} width={sponsor.width} height={sponsor.height} loading="lazy" decoding="async" />
								<span class="sheen" style="--sheen-delay: {1.2 + i * 3.5}s" aria-hidden="true"></span>
							</div>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</div>
</section>

<style>
	/* Picks up where the story map ends (#04070f) and settles before the paper of the form. */
	.sponsors {
		position: relative;
		padding-block: clamp(var(--section-space-min), 8vw, var(--section-space-max));
		background:
			radial-gradient(55% 60% at 50% 100%, rgb(255 172 72 / 0.1), transparent 70%),
			linear-gradient(180deg, #04070f 0%, #0a1330 100%);
		color: var(--on-ink-soft);
		overflow: hidden;
		isolation: isolate;
	}

	.intro {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	.intro .eyebrow {
		color: var(--gold);
	}

	h2 {
		font: var(--text-display);
		font-size: clamp(30px, 3.6vw, 46px);
		line-height: 1.1;
		color: var(--on-ink);
		max-width: 18ch;
	}

	h2 em {
		font-style: italic;
		background: linear-gradient(100deg, var(--gold-bright) 0%, var(--gold) 45%, var(--gold-deep) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.06em;
	}

	/* A gold hairline that draws outwards from the centre once the heading is in view. */
	.rule {
		width: 96px;
		height: 1px;
		margin-top: var(--space-2);
		background: linear-gradient(90deg, rgb(240 190 100 / 0), var(--gold), rgb(240 190 100 / 0));
		transform: scaleX(0);
		transition: transform 900ms var(--ease-out) 300ms;
	}

	.intro:global(.is-revealed) .rule {
		transform: scaleX(1);
	}

	.list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 420px));
		justify-content: center;
		gap: clamp(var(--space-8), 5vw, 72px);
		margin: clamp(var(--space-8), 5vw, 56px) 0 0;
		padding: 0;
		list-style: none;
	}

	.sponsor {
		display: grid;
		justify-items: center;
		gap: var(--space-4);
	}

	.role {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		font: var(--text-eyebrow);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.role::before,
	.role::after {
		content: '';
		width: 20px;
		height: 1px;
		background: var(--gold-line);
	}

	/* Each card drifts gently on its own phase. */
	.float {
		position: relative;
		width: 100%;
		animation: float 7s ease-in-out var(--float-delay, 0s) infinite;
		will-change: transform;
	}

	@keyframes float {
		50% {
			transform: translate3d(0, -6px, 0);
		}
	}

	/* A warm glow under the card that breathes slowly. */
	.halo {
		position: absolute;
		inset: 18% 8% -14%;
		z-index: -1;
		border-radius: 50%;
		background: radial-gradient(closest-side, rgb(255 180 80 / 0.28), transparent);
		filter: blur(18px);
		opacity: 0.55;
		animation: breathe 5.5s ease-in-out var(--float-delay, 0s) infinite;
	}

	@keyframes breathe {
		50% {
			opacity: 0.95;
			transform: scale(1.06);
		}
	}

	/* Gold gradient hairline around the white plate. */
	.frame {
		padding: 1px;
		border-radius: var(--radius-lg);
		background: linear-gradient(140deg, rgb(245 207 119 / 0.9), rgb(227 176 75 / 0.18) 40%, rgb(227 176 75 / 0.18) 60%, rgb(245 207 119 / 0.75));
		box-shadow:
			0 24px 60px rgb(0 0 0 / 0.45),
			0 2px 8px rgb(0 0 0 / 0.3);
		transition:
			transform var(--duration-entrance-max) var(--ease-out),
			box-shadow var(--duration-entrance-max) var(--ease-out);
	}

	.plate {
		position: relative;
		display: grid;
		/* A definite track, so the logo's percentage height resolves against the plate. */
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		place-items: center;
		height: clamp(150px, 15vw, 190px);
		padding: var(--space-6) var(--space-8);
		border-radius: calc(var(--radius-lg) - 1px);
		background: var(--white);
		overflow: hidden;
	}

	/* The logo always fits whole inside the plate, letterboxed on the white. */
	.plate img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		transition: transform var(--duration-entrance-max) var(--ease-out);
	}

	.plate.wide img {
		height: 70%;
	}

	/* A soft band of light that crosses the plate every few seconds. */
	.sheen {
		position: absolute;
		inset: -20% auto -20% 0;
		width: 40%;
		background: linear-gradient(100deg, transparent, rgb(255 236 190 / 0.55) 50%, transparent);
		transform: translate3d(-160%, 0, 0) skewX(-18deg);
		mix-blend-mode: multiply;
		animation: sheen 7s var(--ease-out) var(--sheen-delay, 0s) infinite;
		pointer-events: none;
	}

	@keyframes sheen {
		0% {
			transform: translate3d(-160%, 0, 0) skewX(-18deg);
		}
		28%,
		100% {
			transform: translate3d(360%, 0, 0) skewX(-18deg);
		}
	}

	@media (hover: hover) {
		.sponsor:hover .frame {
			transform: translate3d(0, -4px, 0);
			box-shadow:
				0 32px 70px rgb(0 0 0 / 0.5),
				0 0 0 1px rgb(245 207 119 / 0.5),
				0 0 36px rgb(255 180 80 / 0.22);
		}

		.sponsor:hover .plate img {
			transform: scale(1.04);
		}
	}

	@media (max-width: 720px) {
		.list {
			grid-template-columns: minmax(0, 420px);
		}

		.plate {
			height: 140px;
			padding: var(--space-4) var(--space-6);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.float,
		.halo,
		.sheen {
			animation: none;
		}

		.sheen {
			display: none;
		}

		.rule {
			transform: none;
		}
	}
</style>
