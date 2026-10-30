<script lang="ts">
	import { CircleAlert, MapPin } from '@lucide/svelte';
	import { CITIES, SALEM, distanceKm, type City } from '#lib/event.ts';
	import { OTHER_CITY } from '#lib/registration.ts';
	import TextField from './TextField.svelte';

	interface Props {
		id: string;
		value: string;
		other: string;
		error?: string | null;
		otherError?: string | null;
		onchange?: () => void;
		onOtherBlur?: () => void;
	}

	let { id, value = $bindable(), other = $bindable(), error = null, otherError = null, onchange, onOtherBlur }: Props = $props();

	let hovered = $state<string | null>(null);

	// Simple equirectangular projection; latitude and longitude degrees are close
	// enough in size this near the equator for a stylised map.
	const W = 300;
	const LON0 = 76.2;
	const LAT0 = 13.6;
	const K = W / 4.5;
	const H = Math.round(5.5 * K);
	const project = (lat: number, lon: number) => ({ x: (lon - LON0) * K, y: (LAT0 - lat) * K });

	// Rough outline of Tamil Nadu: decorative, not survey-accurate.
	const OUTLINE: [number, number][] = [
		[13.45, 80.32], [13.2, 79.6], [13.15, 79.0], [12.95, 78.55], [12.75, 78.3], [12.85, 77.95],
		[12.6, 77.55], [12.2, 77.48], [11.95, 77.15], [11.75, 76.85], [11.65, 76.45], [11.35, 76.35],
		[11.15, 76.6], [10.75, 76.85], [10.35, 77.1], [9.85, 77.2], [9.4, 77.15], [8.85, 77.2],
		[8.45, 77.3], [8.08, 77.55], [8.4, 77.95], [8.8, 78.15], [9.15, 78.55], [9.3, 79.05],
		[9.65, 79.0], [10.1, 79.25], [10.3, 79.85], [10.75, 79.85], [11.35, 79.8], [11.9, 79.8],
		[12.45, 80.1], [12.9, 80.25]
	];
	const outlinePath =
		OUTLINE.map(([lat, lon], i) => {
			const p = project(lat, lon);
			return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
		}).join(' ') + ' Z';

	const hub = project(SALEM.lat, SALEM.lon);

	function arcPath(city: City) {
		const a = project(city.lat, city.lon);
		const mx = (a.x + hub.x) / 2;
		const my = (a.y + hub.y) / 2;
		const dx = hub.x - a.x;
		const dy = hub.y - a.y;
		const bend = 0.22;
		return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${hub.x.toFixed(1)} ${hub.y.toFixed(1)}`;
	}

	const nodes = CITIES.map((city) => ({ city, ...project(city.lat, city.lon), arc: arcPath(city) }));

	const options = [SALEM.name, ...CITIES.map((c) => c.name), OTHER_CITY];

	const active = $derived(hovered ?? value);
	const selectedCity = $derived(CITIES.find((c) => c.name === value));
	const summary = $derived.by(() => {
		if (value === SALEM.name) return 'You are local. See you at the venue.';
		if (selectedCity) return `${selectedCity.name} to Salem: about ${Math.round(distanceKm(selectedCity, SALEM) / 5) * 5} km as the crow flies.`;
		if (value === OTHER_CITY) return 'Wherever you are coming from, we will see you in Salem.';
		return 'Pick a city to draw your route to Salem.';
	});

	function choose(name: string) {
		value = name;
		onchange?.();
	}
</script>

<fieldset class="picker" {id} tabindex="-1" aria-describedby={error ? `${id}-error` : `${id}-summary`}>
	<legend class="legend">
		Travelling from <span class="req" aria-hidden="true">*</span><span class="visually-hidden">(required)</span>
	</legend>

	<div class="layout">
		<figure class="map" aria-hidden="true">
			<svg viewBox="-12 -12 {W + 24} {H + 24}" role="presentation">
				<defs>
					<pattern id="{id}-dots" width="9" height="9" patternUnits="userSpaceOnUse">
						<circle cx="1.5" cy="1.5" r="1" fill="currentColor" />
					</pattern>
					<clipPath id="{id}-clip"><path d={outlinePath} /></clipPath>
				</defs>

				<path d={outlinePath} class="land" />
				<rect x="0" y="0" width={W} height={H} fill="url(#{id}-dots)" class="dots" clip-path="url(#{id}-clip)" />

				{#each nodes as node (node.city.name)}
					<path d={node.arc} class="arc" class:on={active === node.city.name} pathLength="1" />
				{/each}

				{#each nodes as node (node.city.name)}
					{@const on = active === node.city.name}
					<g class="node" class:on>
						<circle cx={node.x} cy={node.y} r={on ? 5 : 3.5} />
						{#if on}
							<text x={node.x + (node.x > hub.x ? 9 : -9)} y={node.y + 4} text-anchor={node.x > hub.x ? 'start' : 'end'}>
								{node.city.name}
							</text>
						{/if}
					</g>
				{/each}

				<g class="hub" class:on={active === SALEM.name}>
					<circle cx={hub.x} cy={hub.y} r="13" class="halo" />
					<circle cx={hub.x} cy={hub.y} r="6.5" />
					<text x={hub.x + 12} y={hub.y - 10}>Salem</text>
				</g>
			</svg>
		</figure>

		<div class="choices">
			<div class="chips" role="radiogroup" aria-label="City">
				{#each options as name (name)}
					{@const checked = value === name}
					<label
						class="chip"
						class:checked
						onpointerenter={() => (hovered = name)}
						onpointerleave={() => (hovered = null)}
					>
						<input type="radio" name={id} value={name} {checked} onchange={() => choose(name)} />
						{#if name === SALEM.name}<MapPin size={14} aria-hidden="true" />{/if}
						{name === OTHER_CITY ? 'Somewhere else' : name}
					</label>
				{/each}
			</div>

			<p class="summary" id="{id}-summary" aria-live="polite">{summary}</p>

			{#if value === OTHER_CITY}
				<TextField
					id="field-cityOther"
					label="Your city"
					bind:value={other}
					required
					autocomplete="address-level2"
					maxlength={60}
					error={otherError}
					onblur={onOtherBlur}
				/>
			{/if}
		</div>
	</div>

	{#if error}
		<p class="error" id="{id}-error"><CircleAlert size={16} strokeWidth={2} aria-hidden="true" />{error}</p>
	{/if}
</fieldset>

<style>
	.picker {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.picker:focus {
		outline: none;
	}

	.legend {
		padding: 0;
		margin-bottom: var(--space-3);
		font: var(--text-ui);
		color: var(--charcoal);
	}

	.req {
		color: var(--gold-ink);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 200px) minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
		padding: var(--space-4);
		background: var(--white);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
	}

	.map {
		width: 100%;
		margin: 0;
		color: #cfc6b2;
	}

	.map svg {
		width: 100%;
		height: auto;
	}

	.land {
		fill: var(--gold-tint);
		stroke: #d9c9a3;
		stroke-width: 1;
		stroke-linejoin: round;
	}

	.dots {
		opacity: 0.7;
	}

	.arc {
		fill: none;
		stroke: var(--gold-ink);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		opacity: 0;
		transition:
			stroke-dashoffset var(--duration-entrance-max) var(--ease-out),
			opacity var(--duration-feedback) var(--ease-out);
	}

	.arc.on {
		stroke-dashoffset: 0;
		opacity: 1;
	}

	.node circle {
		fill: var(--white);
		stroke: var(--charcoal);
		stroke-width: 1.25;
		transition: r var(--duration-feedback) var(--ease-out);
	}

	.node.on circle {
		fill: var(--ink);
		stroke: var(--gold);
		stroke-width: 2;
	}

	text {
		font: 600 11px var(--font-sans);
		fill: var(--charcoal);
		paint-order: stroke;
		stroke: var(--white);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.hub circle {
		fill: var(--ink);
	}

	.hub .halo {
		fill: none;
		stroke: var(--gold-ink);
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}

	.hub.on .halo {
		stroke-dasharray: none;
		stroke-width: 2;
	}

	.choices {
		display: grid;
		gap: var(--space-4);
		align-content: start;
		min-width: 0;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 36px;
		padding: 0 var(--space-3);
		background: var(--white);
		border: 1px solid var(--control-border);
		border-radius: 999px;
		color: var(--charcoal);
		font: 500 14px/1 var(--font-sans);
		cursor: pointer;
		transition:
			background-color var(--duration-feedback) var(--ease-out),
			border-color var(--duration-feedback) var(--ease-out);
	}

	.chip:hover {
		border-color: var(--charcoal);
	}

	.chip.checked {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--on-ink);
	}

	.chip.checked :global(svg) {
		color: var(--gold);
	}

	.chip:has(input:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	.chip input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.summary {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font: var(--text-caption);
		color: var(--danger);
	}

	.error :global(svg) {
		margin-top: 2px;
		flex: none;
	}

	@media (max-width: 560px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.map {
			max-width: 200px;
			margin-inline: auto;
		}
	}
</style>
