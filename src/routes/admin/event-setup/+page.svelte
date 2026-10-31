<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import {
		BadgeCheck,
		CalendarDays,
		CircleAlert,
		DoorOpen,
		LoaderCircle,
		Plus,
		Presentation,
		QrCode,
		Save,
		ShieldCheck,
		Trash,
		Utensils
	} from '@lucide/svelte';
	import { sameName } from '#lib/catalog.ts';
	import { DEFAULT_EVENT, eventLabels, fromEventFormFields, toEventFormFields } from '#lib/event-settings.ts';
	import OpsDialog from '#lib/components/ops/OpsDialog.svelte';

	let { data, form } = $props();

	/* ---------- event date and time ---------- */

	const initialSchedule = untrack(() => toEventFormFields(data.schedule ?? DEFAULT_EVENT));
	let date = $state(initialSchedule.date);
	let start = $state(initialSchedule.start);
	let end = $state(initialSchedule.end);
	let savingSchedule = $state(false);
	const schedulePreview = $derived.by(() => {
		const result = fromEventFormFields({ date, start, end });
		return result.ok ? eventLabels(result.settings) : null;
	});
	const scheduleErrors = $derived(
		(form?.scope === 'schedule' && form && 'errors' in form ? form.errors : {}) as Record<string, string>
	);
	const saveSchedule: SubmitFunction = () => {
		savingSchedule = true;
		return async ({ update }) => {
			await update({ reset: false });
			savingSchedule = false;
		};
	};

	/* ---------- gates ---------- */

	let gateName = $state('');
	// Blocked here and on the server: the same name in any case or spacing is the same gate.
	const gateTaken = $derived(
		data.available && gateName.trim().length > 0 && data.gates.some((g) => sameName(g.name, gateName))
	);
	const addGateSubmit: SubmitFunction = ({ cancel }) => {
		if (gateTaken) return cancel();
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') gateName = '';
		};
	};

	const MEAL_NAMES = ['Breakfast', 'Morning tea', 'Lunch', 'Evening snacks', 'Dinner'];
	// The hall dropdown's "New hall" option; the typed name is sent as newHall.
	const NEW_HALL = '';

	const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
	const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
	const clock = (iso: string | null) => (iso ? time.format(new Date(iso)) : '');
	const dayOf = (iso: string) => day.format(new Date(iso));

	let sessionOpen = $state(false);
	let mealOpen = $state(false);
	let hallChoice = $state(NEW_HALL);

	const halls = $derived(data.available ? [...new Set(data.sessions.map((s) => s.hall))].sort() : []);
	const usedMeals = $derived(new Set(data.available ? data.meals.map((m) => m.name.toLowerCase()) : []));
	const firstFreeMeal = $derived(MEAL_NAMES.find((n) => !usedMeals.has(n.toLowerCase())) ?? '');
	// Sessions on more than one day show their date as well as the time.
	const multiDay = $derived(data.available && new Set(data.sessions.map((s) => dayOf(s.startsAt))).size > 1);

	function openSession() {
		hallChoice = halls[0] ?? NEW_HALL;
		sessionOpen = true;
	}

	const keep: SubmitFunction = () => async ({ update }) => update({ reset: true });
	/** Dialog forms close once the server accepts them; errors keep the dialog open. */
	const closeOnSuccess =
		(close: () => void): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			await update({ reset: true });
			if (result.type === 'success') close();
		};
</script>

<svelte:head>
	<title>Event setup · Admin · Midtown Business Conclave</title>
</svelte:head>

{#snippet notice(scope: string, dialogOpen = false)}
	{#if form?.scope === scope && form?.message && !dialogOpen}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
	{:else if form?.scope === scope && form?.success}
		<div class="ops-banner ok" role="status"><BadgeCheck size={16} aria-hidden="true" /><p>{form.success}</p></div>
	{/if}
{/snippet}

{#snippet dialogError(scope: string)}
	{#if form?.scope === scope && form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
	{/if}
{/snippet}

{#snippet schedulePanel()}
	<section class="ops-panel" aria-labelledby="schedule-title">
		<div class="ops-heading">
			<span class="ops-heading-icon"><CalendarDays size={16} aria-hidden="true" /></span>
			<div>
				<h2 id="schedule-title">Event date and time</h2>
				<p class="ops-hint">Shown on the site, the countdown and ticket emails.</p>
			</div>
		</div>
		{@render notice('schedule')}
		{#if data.schedule}
			<form method="post" action="?/saveEvent" class="schedule" use:enhance={saveSchedule}>
				<label class="ops-label wide">
					Date
					<input type="date" name="date" bind:value={date} required />
					{#if scheduleErrors.date}<small class="ops-field-error">{scheduleErrors.date}</small>{/if}
				</label>
				<label class="ops-label">
					Starts
					<input type="time" name="start" bind:value={start} required />
					{#if scheduleErrors.start}<small class="ops-field-error">{scheduleErrors.start}</small>{/if}
				</label>
				<label class="ops-label">
					Ends
					<input type="time" name="end" bind:value={end} required />
					{#if scheduleErrors.end}<small class="ops-field-error">{scheduleErrors.end}</small>{/if}
				</label>
				<p class="preview wide">
					{#if schedulePreview}
						Shown as <strong>{schedulePreview.dateLabel}</strong>, {schedulePreview.timeLabel} (IST)
					{:else}
						Choose a date, a start time and a later end time.
					{/if}
				</p>
				<div class="wide">
					<button type="submit" class="btn btn-primary ops-btn-sm" disabled={savingSchedule}>
						{#if savingSchedule}<LoaderCircle size={15} class="ops-spin" aria-hidden="true" /> Saving…{:else}<Save size={15} aria-hidden="true" /> Save schedule{/if}
					</button>
				</div>
				<p class="ops-hint wide">The poster artwork keeps its own printed date; this does not redraw posters.</p>
			</form>
		{:else}
			<p class="ops-hint">Set <code>DATABASE_URL</code> to change the date and time.</p>
		{/if}
	</section>
{/snippet}

{#if !data.available}
	<header class="ops-page-head">
		<div>
			<h1>Event setup</h1>
			<p class="ops-hint">Schedule, gates, halls, meals and certificate rules.</p>
		</div>
	</header>
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>Gates, halls, meals and certificates are not switched on yet: run <code>db/schema.sql</code> in the Neon SQL editor (it only adds the new tables), then reload this page. Without a database (<code>DATABASE_URL</code>) they stay off.</p>
	</div>
	<div class="ops-layout">
		<div class="ops-column">{@render schedulePanel()}</div>
	</div>
{:else}
	<header class="ops-page-head">
		<div>
			<h1>Event setup</h1>
			<p class="ops-hint">{data.event.name}</p>
		</div>
		<dl class="ops-counts">
			<div><dt>Gates</dt><dd>{data.gates.length}</dd></div>
			<div><dt>Halls</dt><dd>{halls.length}</dd></div>
			<div><dt>Sessions</dt><dd>{data.sessions.length}</dd></div>
			<div><dt>Meals</dt><dd>{data.meals.length}</dd></div>
		</dl>
	</header>

	{#if !data.passesReady}
		<div class="ops-banner warn" role="status">
			<CircleAlert size={16} aria-hidden="true" />
			<p>Set <code>PASS_SECRET</code> in the environment before sending passes: it signs every participant QR.</p>
		</div>
	{/if}

	<div class="ops-layout">
		<div class="ops-column">
			<section class="ops-panel" aria-labelledby="sessions-title">
				<div class="ops-panel-head">
					<div class="ops-heading">
						<span class="ops-heading-icon"><Presentation size={16} aria-hidden="true" /></span>
						<div>
							<h2 id="sessions-title">Halls and sessions</h2>
							<p class="ops-hint">Hall handlers record attendance against these.</p>
						</div>
					</div>
					<button type="button" class="btn btn-primary ops-btn-sm" onclick={openSession}>
						<Plus size={15} aria-hidden="true" /> Add session
					</button>
				</div>
				{@render notice('sessions', sessionOpen)}
				{#if data.sessions.length}
					<div class="ops-table-wrap">
						<table class="ops-table stack">
							<thead>
								<tr><th>Hall</th><th>Session</th><th>Time</th><th>Attendance %</th><th><span class="visually-hidden">Actions</span></th></tr>
							</thead>
							<tbody>
								{#each data.sessions as s (s.id)}
									<tr>
										<td><span class="hall">{s.hall}</span></td>
										<td class="lead"><strong>{s.title}</strong></td>
										<td class="nowrap" data-label="Time">
											{#if multiDay}<span class="ops-muted">{dayOf(s.startsAt)} ·</span>{/if}
											{clock(s.startsAt)} – {clock(s.endsAt)}
										</td>
										<td data-label="Attendance %">{s.countsForAttendance ? 'Counts' : 'Not counted'}</td>
										<td class="row-end end">
											<form method="post" action="?/deleteSession" use:enhance>
												<input type="hidden" name="id" value={s.id} />
												<button class="btn btn-ghost ops-btn-sm" type="submit" aria-label="Remove {s.title}"><Trash size={14} aria-hidden="true" /></button>
											</form>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="ops-empty">
						<p>No sessions yet. Add one per hall and time slot, for example <b>Hall A · Business Leadership</b>.</p>
					</div>
				{/if}
			</section>

			<section class="ops-panel" aria-labelledby="meals-title">
				<div class="ops-panel-head">
					<div class="ops-heading">
						<span class="ops-heading-icon"><Utensils size={16} aria-hidden="true" /></span>
						<div>
							<h2 id="meals-title">Meals</h2>
							<p class="ops-hint">Food counters can serve only open meals.</p>
						</div>
					</div>
					<button type="button" class="btn btn-primary ops-btn-sm" onclick={() => (mealOpen = true)}>
						<Plus size={15} aria-hidden="true" /> Add meal
					</button>
				</div>
				{@render notice('meals', mealOpen)}
				{#if data.meals.length}
					<div class="ops-table-wrap">
						<table class="ops-table stack">
							<thead>
								<tr><th>Meal</th><th>Served</th><th class="num">Per delegate</th><th>Who can collect</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr>
							</thead>
							<tbody>
								{#each data.meals as m (m.id)}
									<tr>
										<td class="lead"><strong>{m.name}</strong></td>
										<td class="nowrap" data-label="Served">{m.startsAt ? `${clock(m.startsAt)} – ${clock(m.endsAt)}` : 'Any time'}</td>
										<td class="num" data-label="Per delegate">{m.maxPerParticipant}</td>
										<td data-label="Who">{m.eligibility === 'checked_in' ? 'Checked-in delegates' : 'Every paid delegate'}</td>
										<td><span class="ops-pill {m.active ? 'active' : 'inactive'}">{m.active ? 'Open' : 'Closed'}</span></td>
										<td class="row-end end">
											<div class="ops-actions">
												<form method="post" action="?/toggleMeal" use:enhance>
													<input type="hidden" name="id" value={m.id} />
													<input type="hidden" name="active" value={String(!m.active)} />
													<button class="btn btn-ghost ops-btn-sm" type="submit">{m.active ? 'Close' : 'Open'}</button>
												</form>
												<form method="post" action="?/deleteMeal" use:enhance>
													<input type="hidden" name="id" value={m.id} />
													<button class="btn btn-ghost ops-btn-sm" type="submit" aria-label="Remove {m.name}"><Trash size={14} aria-hidden="true" /></button>
												</form>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="ops-empty">
						<p>No meals yet. Add breakfast, lunch, evening snacks or dinner.</p>
					</div>
				{/if}
			</section>

			<section class="ops-panel" aria-labelledby="pass-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><QrCode size={16} aria-hidden="true" /></span>
					<div>
						<h2 id="pass-title">Reissue a delegate’s QR</h2>
						<p class="ops-hint">For a lost phone or a shared screenshot. The old QR and “My pass” link stop working at once.</p>
					</div>
				</div>
				{@render notice('pass')}
				<form method="post" action="?/reissue" class="reissue" use:enhance={keep}>
					<label class="ops-label">Registration number<input name="code" autocomplete="off" placeholder="MBC-XXXXXX" required pattern="[Mm][Bb][Cc]-[A-Za-z0-9]{'{6}'}" /></label>
					<label class="ops-check"><input type="checkbox" name="email" checked /> Email the new pass</label>
					<button class="btn btn-secondary ops-btn-sm" type="submit" disabled={!data.passesReady}><QrCode size={15} aria-hidden="true" /> Reissue QR</button>
				</form>
			</section>
		</div>

		<div class="ops-column">
			{@render schedulePanel()}

			<section class="ops-panel" aria-labelledby="gates-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><DoorOpen size={16} aria-hidden="true" /></span>
					<h2 id="gates-title">Gates</h2>
				</div>
				{@render notice('gates')}
				{#if data.gates.length}
					<ul class="gates">
						{#each data.gates as g (g.id)}
							<li>
								<span>{g.name}</span>
								<form method="post" action="?/deleteGate" use:enhance>
									<input type="hidden" name="id" value={g.id} />
									<button class="btn btn-ghost ops-btn-sm" type="submit" aria-label="Remove {g.name}"><Trash size={14} aria-hidden="true" /></button>
								</form>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ops-hint">No gates yet. Gate handlers then record “Any gate”.</p>
				{/if}
				<form method="post" action="?/addGate" class="inline" use:enhance={addGateSubmit}>
					<label class="ops-label">
						<span class="visually-hidden">New gate</span>
						<input name="name" maxlength="60" placeholder="New gate, e.g. Main gate" required autocomplete="off" bind:value={gateName} aria-invalid={gateTaken} aria-describedby="gate-taken" />
					</label>
					<button class="btn btn-secondary ops-btn-sm" type="submit" disabled={gateTaken}><Plus size={15} aria-hidden="true" /> Add</button>
				</form>
				{#if gateTaken}<small id="gate-taken" class="ops-field-error">There is already a gate with that name.</small>{/if}
			</section>

			<section class="ops-panel" aria-labelledby="rules-title">
				<div class="ops-heading">
					<span class="ops-heading-icon"><ShieldCheck size={16} aria-hidden="true" /></span>
					<h2 id="rules-title">Entry and certificate rules</h2>
				</div>
				{@render notice('rules')}
				<form method="post" action="?/rules" class="ops-form compact" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<label class="ops-check">
						<input type="checkbox" name="allowReentry" checked={data.event.allowReentry} />
						<span>Allow re-entry <small class="ops-muted">a second gate scan counts as re-entry</small></span>
					</label>
					<fieldset class="group">
						<legend>A certificate needs</legend>
						<label class="ops-check"><input type="checkbox" name="requirePaid" checked={data.event.certificateRules.requirePaid} /> Approved, paid registration</label>
						<label class="ops-check"><input type="checkbox" name="requireCheckin" checked={data.event.certificateRules.requireCheckin} /> A gate check-in</label>
						<label class="ops-label">
							Minimum session attendance (%)
							<input type="number" name="minAttendancePct" min="0" max="100" step="1" value={data.event.certificateRules.minAttendancePct} />
						</label>
					</fieldset>
					{#if data.sessions.length}
						<fieldset class="group">
							<legend>Sessions every certificate holder must attend</legend>
							{#each data.sessions as s (s.id)}
								<label class="ops-check">
									<input type="checkbox" name="requiredSessionIds" value={s.id} checked={data.event.certificateRules.requiredSessionIds.includes(s.id)} />
									{s.hall} · {s.title}
								</label>
							{/each}
						</fieldset>
					{/if}
					<div><button class="btn btn-primary ops-btn-sm" type="submit"><Save size={15} aria-hidden="true" /> Save rules</button></div>
				</form>
			</section>
		</div>
	</div>

	<OpsDialog bind:open={sessionOpen} title="Add a session" description="One per hall and time slot.">
		<form method="post" action="?/addSession" class="ops-form" use:enhance={closeOnSuccess(() => (sessionOpen = false))}>
			{@render dialogError('sessions')}
			<div class="pair">
				<label class="ops-label">
					Hall
					<select name="hall" bind:value={hallChoice}>
						{#each halls as h (h)}<option value={h}>{h}</option>{/each}
						<option value={NEW_HALL}>+ New hall…</option>
					</select>
				</label>
				{#if hallChoice === NEW_HALL}
					<label class="ops-label">New hall name<input name="newHall" maxlength="60" placeholder="Hall A" required autocomplete="off" /></label>
				{/if}
			</div>
			<label class="ops-label">Session title<input name="title" maxlength="120" placeholder="Business Leadership" required autocomplete="off" /></label>
			<div class="triple">
				<label class="ops-label">Date<input type="date" name="date" value={data.eventDate} required /></label>
				<label class="ops-label">Starts<input type="time" name="start" required /></label>
				<label class="ops-label">Ends<input type="time" name="end" required /></label>
			</div>
			<label class="ops-check"><input type="checkbox" name="counts" checked /> Counts towards the attendance % for certificates</label>
			<div class="ops-dialog-actions">
				<button type="button" class="btn btn-ghost ops-btn-sm" onclick={() => (sessionOpen = false)}>Cancel</button>
				<button class="btn btn-primary ops-btn-sm" type="submit"><Plus size={15} aria-hidden="true" /> Add session</button>
			</div>
		</form>
	</OpsDialog>

	<OpsDialog bind:open={mealOpen} title="Add a meal" description="Leave the times empty to serve it any time the counter is open.">
		<form method="post" action="?/addMeal" class="ops-form" use:enhance={closeOnSuccess(() => (mealOpen = false))}>
			{@render dialogError('meals')}
			<div class="pair">
				<label class="ops-label">
					Meal
					<select name="name" required value={firstFreeMeal}>
						<option value="" disabled>Choose a meal</option>
						{#each MEAL_NAMES as name (name)}
							{@const added = usedMeals.has(name.toLowerCase())}
							<option value={name} disabled={added}>{name}{added ? ' (added)' : ''}</option>
						{/each}
					</select>
				</label>
				<label class="ops-label">Date<input type="date" name="date" value={data.eventDate} /></label>
			</div>
			<div class="pair">
				<label class="ops-label">From <small>Optional</small><input type="time" name="start" /></label>
				<label class="ops-label">Until <small>Optional</small><input type="time" name="end" /></label>
			</div>
			<div class="pair">
				<label class="ops-label">
					Servings per delegate
					<select name="max">
						{#each [1, 2, 3, 4, 5] as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</label>
				<label class="ops-label">
					Who can collect
					<select name="eligibility">
						<option value="paid">Every paid delegate</option>
						<option value="checked_in">Only delegates checked in at a gate</option>
					</select>
				</label>
			</div>
			<div class="ops-dialog-actions">
				<button type="button" class="btn btn-ghost ops-btn-sm" onclick={() => (mealOpen = false)}>Cancel</button>
				<button class="btn btn-primary ops-btn-sm" type="submit" disabled={!firstFreeMeal}><Plus size={15} aria-hidden="true" /> Add meal</button>
			</div>
		</form>
	</OpsDialog>
{/if}

<style>
	.hall {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--paper);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	.nowrap {
		white-space: nowrap;
	}

	.row-end {
		width: 1%;
		text-align: right;
	}

	.row-end .ops-actions {
		flex-wrap: nowrap;
		justify-content: flex-end;
	}

	.reissue {
		display: grid;
		grid-template-columns: minmax(180px, 280px) auto auto;
		gap: var(--space-3) var(--space-4);
		align-items: end;
		justify-content: start;
	}

	.gates {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.gates li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 2px 0;
		border-bottom: 1px solid var(--rule);
	}

	.inline {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
	}

	.inline .ops-label {
		flex: 1;
	}

	.compact {
		gap: var(--space-3);
	}

	.compact .ops-check {
		min-height: 32px;
	}

	.compact .ops-check small {
		display: block;
		font-size: 12px;
	}

	.group {
		display: grid;
		gap: 0;
		margin: 0;
		padding: var(--space-3) 0 0;
		border: 0;
		border-top: 1px solid var(--rule);
	}

	.group legend {
		float: left;
		width: 100%;
		margin-bottom: var(--space-1);
		font-size: 13px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.group .ops-label {
		margin-top: var(--space-2);
	}

	/* Schedule: date across, start and end side by side. */
	.schedule {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.schedule .wide {
		grid-column: 1 / -1;
	}

	.preview {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--paper);
		font-size: 13px;
	}

	.preview strong {
		font-weight: 600;
		color: var(--charcoal);
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		align-items: end;
	}

	.triple {
		display: grid;
		grid-template-columns: 1.2fr 1fr 1fr;
		gap: var(--space-3);
	}

	code {
		font-size: 12px;
	}

	@media (max-width: 560px) {
		.pair,
		.triple,
		.reissue {
			grid-template-columns: minmax(0, 1fr);
		}

		/* Avoid iOS zoom on focus. */
		.ops-label :is(input, select) {
			font-size: 16px;
		}
	}
</style>
