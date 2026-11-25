<script lang="ts">
	import { onMount } from 'svelte';
	import { CalendarClock, MapPin, Mic, X } from '@lucide/svelte';
	import { agenda, agendaClock, agendaSlots, loadAgenda } from '#lib/agenda.svelte.ts';
	import { EVENT } from '#lib/event.ts';

	/** A compact agenda in a popup, for visitors filling in a form. */
	let { block = false }: { block?: boolean } = $props();

	let dialog = $state<HTMLDialogElement | null>(null);

	onMount(() => {
		loadAgenda();
	});

	const slots = $derived(agendaSlots(agenda.items));
	const manyHalls = $derived(new Set(agenda.items.map((i) => i.hall)).size > 1);
</script>

{#if agenda.items.length}
	<button type="button" class="btn btn-ghost agenda-btn" class:block onclick={() => dialog?.showModal()}>
		<CalendarClock size={18} aria-hidden="true" /> Agenda
	</button>

	<dialog class="sheet" bind:this={dialog} aria-labelledby="agenda-dialog-title" onclick={(e) => e.target === dialog && dialog?.close()}>
		<div class="sheet-inner">
			<button type="button" class="close" onclick={() => dialog?.close()} aria-label="Close"><X size={20} aria-hidden="true" /></button>
			<header>
				<span class="eyebrow">Agenda</span>
				<h2 id="agenda-dialog-title">How the day unfolds</h2>
				<p>
					{EVENT.dateLabel} ·
					<a href={EVENT.venueMapUrl} target="_blank" rel="noopener noreferrer">{EVENT.venue}</a>
				</p>
			</header>

			<ol class="list">
				{#each slots as [startsAt, items] (startsAt)}
					<li class:quiet={items.every((x) => x.isBreak)}>
						<time datetime={startsAt}>{agendaClock(startsAt)}</time>
						<div class="items">
							{#each items as item (item.id)}
								<div class="item">
									<strong>{item.title}</strong>
									{#if item.speaker || (manyHalls && items.length > 1)}
										<span class="meta">
											{#if item.speaker}<span><Mic size={13} aria-hidden="true" /> {item.speaker}</span>{/if}
											{#if manyHalls && items.length > 1}<span><MapPin size={13} aria-hidden="true" /> {item.hall}</span>{/if}
										</span>
									{/if}
								</div>
							{/each}
						</div>
					</li>
				{/each}
			</ol>

			<button type="button" class="btn btn-primary done" onclick={() => dialog?.close()}>Close</button>
		</div>
	</dialog>
{/if}

<style>
	.agenda-btn {
		justify-self: start;
		padding-inline: var(--space-5, 20px);
		box-shadow: inset 0 0 0 1px var(--gold);
		color: var(--charcoal);
	}

	.agenda-btn :global(svg) {
		color: var(--gold-deep);
	}

	.agenda-btn.block {
		justify-self: center;
		width: 100%;
		max-width: 380px;
		justify-content: center;
	}

	.sheet {
		width: min(560px, calc(100vw - 24px));
		max-width: none;
		max-height: calc(100svh - 24px);
		padding: 0;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--white);
		color: var(--text-body);
		box-shadow: 0 40px 100px rgb(0 0 0 / 0.5);
	}

	.sheet::backdrop {
		background: rgb(6 11 26 / 0.72);
		backdrop-filter: blur(4px);
	}

	.sheet-inner {
		position: relative;
		display: grid;
		gap: var(--space-5, 20px);
		padding: clamp(var(--space-6), 4vw, 36px);
	}

	header {
		display: grid;
		gap: var(--space-1);
		padding-right: var(--space-8);
	}

	header .eyebrow {
		color: var(--gold-deep);
	}

	h2 {
		font: var(--text-h3);
		font-size: clamp(22px, 3vw, 28px);
	}

	header p:empty {
		display: none;
	}

	header p {
		color: var(--text-supporting);
	}

	.close {
		position: absolute;
		top: var(--space-4);
		right: var(--space-4);
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: var(--mist);
		color: var(--charcoal);
		cursor: pointer;
	}

	.list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list li {
		display: grid;
		grid-template-columns: 78px minmax(0, 1fr);
		gap: var(--space-3);
		padding-block: var(--space-3);
		border-top: 1px solid var(--rule);
	}

	.list li:first-child {
		border-top: 0;
	}

	time {
		font-weight: 600;
		color: var(--gold-deep);
		white-space: nowrap;
	}

	.items {
		display: grid;
		gap: var(--space-2);
	}

	.item {
		display: grid;
		gap: 2px;
	}

	.item strong {
		font-weight: 600;
		color: var(--charcoal);
	}

	.quiet .item strong {
		font-weight: 500;
		color: var(--text-supporting);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 2px var(--space-3);
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.done {
		justify-self: end;
	}
</style>
