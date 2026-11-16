<script lang="ts">
	import { onMount } from 'svelte';
	import { MapPin, Mic } from '@lucide/svelte';
	import { agenda, loadAgenda, type AgendaItem } from '#lib/agenda.svelte.ts';
	import { EVENT_TIME_ZONE } from '#lib/event-settings.ts';
	import { reveal } from '#lib/actions/reveal.ts';

	onMount(() => {
		loadAgenda();
	});

	const fmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: EVENT_TIME_ZONE });

	/** "9.30 am", "12 pm": the site's own way of writing times. */
	function clock(iso: string) {
		const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
		const period = (parts.dayPeriod ?? '').toLowerCase().replace(/\./g, '');
		return parts.minute === '00' ? `${parts.hour} ${period}` : `${parts.hour}.${parts.minute} ${period}`;
	}

	/** Sessions that start together (parallel tracks) share one slot on the timeline. */
	const slots = $derived.by(() => {
		const bySlot = new Map<string, AgendaItem[]>();
		for (const item of agenda.items) {
			const list = bySlot.get(item.startsAt) ?? [];
			list.push(item);
			bySlot.set(item.startsAt, list);
		}
		return [...bySlot.entries()].sort(([a], [b]) => Date.parse(a) - Date.parse(b));
	});

	// Hall names only help when there is more than one.
	const manyHalls = $derived(new Set(agenda.items.map((i) => i.hall)).size > 1);
</script>

{#if agenda.items.length}
	<section class="agenda on-ink" id="agenda" aria-labelledby="agenda-title">
		<div class="container">
			<header class="intro" use:reveal>
				<span class="eyebrow">Agenda</span>
				<h2 id="agenda-title">How the <em>day</em> unfolds</h2>
				<span class="rule" aria-hidden="true"></span>
			</header>

			<ol class="timeline">
				{#each slots as [startsAt, items], i (startsAt)}
					{@const quiet = items.every((x) => x.isBreak)}
					<li class="slot" class:quiet use:reveal={60 + Math.min(i, 6) * 70}>
						<time class="when" datetime={startsAt}>{clock(startsAt)}</time>
						<span class="dot" aria-hidden="true"></span>
						<div class="items" class:parallel={items.length > 1} style:--cols={items.length === 3 ? 3 : 2}>
							{#each items as item (item.id)}
								<article class="item" class:break={item.isBreak}>
									<h3>{item.title}</h3>
									{#if item.speaker || (manyHalls && items.length > 1)}
										<p class="meta">
											{#if item.speaker}<span><Mic size={14} aria-hidden="true" /> {item.speaker}</span>{/if}
											{#if manyHalls && items.length > 1}<span><MapPin size={14} aria-hidden="true" /> {item.hall}</span>{/if}
										</p>
									{/if}
									{#if item.description}<p class="desc">{item.description}</p>{/if}
								</article>
							{/each}
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</section>
{/if}

<style>
	/* Sits between the story map and the sponsors, both dark, so it stays on ink. */
	.agenda {
		position: relative;
		padding-block: clamp(var(--section-space-min), 8vw, var(--section-space-max));
		background:
			radial-gradient(50% 40% at 15% 30%, rgb(255 172 72 / 0.08), transparent 70%),
			#04070f;
		color: var(--on-ink-soft);
		scroll-margin-top: 0;
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
	}

	h2 em {
		font-style: italic;
		background: linear-gradient(100deg, var(--gold-bright) 0%, var(--gold) 45%, var(--gold-deep) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.06em;
	}

	.rule {
		width: 96px;
		height: 1px;
		margin-top: var(--space-2);
		background: linear-gradient(90deg, rgb(240 190 100 / 0), var(--gold), rgb(240 190 100 / 0));
	}

	.timeline {
		position: relative;
		display: grid;
		gap: var(--space-6);
		max-width: 920px;
		margin: clamp(var(--space-8), 5vw, 56px) auto 0;
		padding: 0;
		list-style: none;
	}

	/* The gold line the slots hang from. */
	.timeline::before {
		content: '';
		position: absolute;
		top: 10px;
		bottom: 10px;
		left: calc(var(--time-w) + 11px);
		width: 1px;
		background: linear-gradient(180deg, rgb(240 190 100 / 0), var(--gold-line) 6%, var(--gold-line) 94%, rgb(240 190 100 / 0));
	}

	.timeline {
		--time-w: 104px;
	}

	.slot {
		display: grid;
		grid-template-columns: var(--time-w) 23px minmax(0, 1fr);
		gap: 0 var(--space-4);
		align-items: start;
	}

	.when {
		padding-top: 2px;
		font: 500 22px/1.2 var(--font-display);
		color: var(--gold-bright);
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: lining-nums;
	}

	.dot {
		width: 11px;
		height: 11px;
		margin: 9px 6px 0;
		border-radius: 50%;
		background: var(--gold);
		box-shadow:
			0 0 0 4px #04070f,
			0 0 14px rgb(255 180 80 / 0.55);
	}

	.quiet .dot {
		background: #04070f;
		box-shadow:
			0 0 0 4px #04070f,
			inset 0 0 0 1.5px var(--gold);
	}

	.items {
		display: grid;
		gap: var(--space-3);
	}

	/* Parallel sessions: three in a row, otherwise two per row (four make a 2 × 2). */
	.items.parallel {
		grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
	}

	.item {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-5, 20px);
		border-radius: var(--radius-lg);
		background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.025));
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.22);
	}

	.item h3 {
		font: 600 18px/1.35 var(--font-sans);
		color: var(--on-ink);
	}

	/* Openings, tea and lunch: plain lines, no card. */
	.item.break {
		padding-block: 4px;
		background: none;
		box-shadow: none;
	}

	.item.break h3 {
		font-weight: 500;
		color: var(--on-ink-soft);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		font: var(--text-caption);
		color: var(--gold);
	}

	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.desc {
		font: var(--text-caption);
		color: var(--on-ink-soft);
		white-space: pre-line;
	}

	@media (max-width: 600px) {
		.timeline {
			--time-w: 68px;
			gap: var(--space-5, 20px);
		}

		.slot {
			gap: 0 var(--space-2);
		}

		.when {
			font-size: 17px;
		}

		.item {
			padding: var(--space-3) var(--space-4);
		}

		.item h3 {
			font-size: 16px;
		}

		.items.parallel {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
