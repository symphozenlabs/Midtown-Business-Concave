<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { CATEGORIES, type Category } from '#lib/ops/categories.ts';
	import CategoryIcon from './CategoryIcon.svelte';

	interface Options {
		gates: { id: string; name: string }[];
		halls: string[];
		sessions: { id: string; hall: string; title: string; startsAt: string }[];
		meals: { id: string; name: string; active: boolean }[];
	}

	interface Current {
		category: Category;
		gateId: string | null;
		hall: string | null;
		sessionId: string | null;
		mealId: string | null;
		counterName: string | null;
		canIssueCertificates: boolean;
	}

	let { options, current = [] }: { options: Options; current?: Current[] } = $props();

	const initial = untrack(() => current);
	const find = (c: Category) => initial.find((a) => a.category === c);
	const picked = new SvelteSet<Category>(initial.map((a) => a.category));

	const hall = find('hall');
	const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

	// Desks with their own settings (which gate, hall, meal…) open across the full width.
	const HAS_CONTEXT = new Set<Category>(['gate', 'hall', 'food', 'certificate']);

	function toggle(c: Category) {
		if (picked.has(c)) picked.delete(c);
		else picked.add(c);
	}
</script>

<fieldset class="assign">
	<legend>Assigned categories</legend>
	{#each CATEGORIES as c (c.code)}
		{@const on = picked.has(c.code)}
		<div class="row" class:on class:wide={on && HAS_CONTEXT.has(c.code)}>
			<label class="pick">
				<input type="checkbox" name="categories" value={c.code} checked={on} onchange={() => toggle(c.code)} />
				<span class="icon"><CategoryIcon category={c.code} size={18} /></span>
				<span><strong>{c.label}</strong><small>{c.description}</small></span>
			</label>

			{#if on && c.code === 'gate'}
				<label class="ops-label context">
					Gate
					<select name="gateId" value={find('gate')?.gateId ?? ''}>
						<option value="">Any gate</option>
						{#each options.gates as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
					</select>
					{#if !options.gates.length}<small>Add gates under Event setup to name them.</small>{/if}
				</label>
			{/if}

			{#if on && c.code === 'hall'}
				<label class="ops-label context">
					Hall or session
					<select
						name="hallScope"
						value={hall?.sessionId ? `session:${hall.sessionId}` : hall?.hall ? `hall:${hall.hall}` : ''}
						required
					>
						<option value="" disabled>Choose…</option>
						{#each options.halls as h (h)}
							<optgroup label={h}>
								<option value="hall:{h}">Every session in {h}</option>
								{#each options.sessions.filter((s) => s.hall === h) as s (s.id)}
									<option value="session:{s.id}">{time.format(new Date(s.startsAt))} · {s.title}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
					{#if !options.halls.length}<small>Add halls and sessions under Event setup first.</small>{/if}
				</label>
			{/if}

			{#if on && c.code === 'food'}
				<div class="context two">
					<label class="ops-label">
						Meal
						<select name="mealId" value={find('food')?.mealId ?? ''}>
							<option value="">Any open meal</option>
							{#each options.meals as m (m.id)}<option value={m.id}>{m.name}{m.active ? '' : ' (closed)'}</option>{/each}
						</select>
					</label>
					<label class="ops-label">
						Counter <small>Optional</small>
						<input name="counterName" maxlength="40" value={find('food')?.counterName ?? ''} placeholder="Counter 1" />
					</label>
				</div>
			{/if}

			{#if on && c.code === 'certificate'}
				<label class="ops-check context">
					<input type="checkbox" name="canIssue" checked={find('certificate')?.canIssueCertificates ?? false} />
					Can issue certificates (otherwise check and verify only)
				</label>
			{/if}
		</div>
	{/each}
</fieldset>

<style>
	/* Compact: two columns of desks; a chosen desk with settings spans both. */
	.assign {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--space-2);
		font-size: 13px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.row {
		display: grid;
		gap: var(--space-2);
		align-content: start;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.row.wide {
		grid-column: 1 / -1;
	}

	.row.on {
		border-color: var(--gold-ink);
		background: var(--gold-tint);
	}

	.pick {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		cursor: pointer;
	}

	.pick input {
		flex: none;
		width: 20px;
		height: 20px;
		accent-color: var(--gold-ink);
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		background: var(--ink);
		color: var(--gold);
	}

	.pick span:last-child {
		display: grid;
	}

	.pick strong {
		font-size: 14px;
		color: var(--charcoal);
	}

	.pick small {
		font-size: 11px;
		line-height: 1.35;
		color: var(--text-supporting);
	}

	.context {
		margin-left: 32px;
	}

	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-3);
	}
</style>
