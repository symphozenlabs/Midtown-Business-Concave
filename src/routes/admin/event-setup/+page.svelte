<script lang="ts">
	import { enhance } from '$app/forms';
	import { BadgeCheck, CircleAlert, Plus, QrCode, Save, Trash } from '@lucide/svelte';

	let { data, form } = $props();

	const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
	const clock = (iso: string | null) => (iso ? time.format(new Date(iso)) : '');
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: true });
</script>

<svelte:head>
	<title>Event setup · Admin · Midtown Business Conclave</title>
</svelte:head>

{#snippet message(scope: string)}
	{#if form?.scope === scope && form?.message}
		<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{form.message}</p></div>
	{:else if form?.scope === scope && form?.success}
		<div class="ops-banner ok" role="status"><BadgeCheck size={16} aria-hidden="true" /><p>{form.success}</p></div>
	{/if}
{/snippet}

{#if !data.available}
	<div class="ops-banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>Event setup is not switched on yet: run <code>db/schema.sql</code> in the Neon SQL editor (it only adds the new tables), then reload this page. Without a database (<code>DATABASE_URL</code>) it stays off.</p>
	</div>
{:else}
	{#if !data.passesReady}
		<div class="ops-banner warn" role="status">
			<CircleAlert size={16} aria-hidden="true" />
			<p>Set <code>PASS_SECRET</code> in the environment before sending passes: it signs every participant QR.</p>
		</div>
	{/if}

	<section class="ops-panel" aria-labelledby="rules-title">
		<div>
			<h1 id="rules-title">Entry and certificate rules</h1>
			<p class="ops-hint">{data.event.name}</p>
		</div>
		{@render message('rules')}
		<form method="post" action="?/rules" class="ops-form" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<label class="ops-check">
				<input type="checkbox" name="allowReentry" checked={data.event.allowReentry} />
				Allow re-entry: a second gate scan is recorded as a re-entry instead of being refused
			</label>
			<h3>A certificate needs</h3>
			<div class="ops-grid">
				<label class="ops-check"><input type="checkbox" name="requirePaid" checked={data.event.certificateRules.requirePaid} /> Approved, paid registration</label>
				<label class="ops-check"><input type="checkbox" name="requireCheckin" checked={data.event.certificateRules.requireCheckin} /> A gate check-in</label>
				<label class="ops-label">
					Minimum session attendance (%)
					<input type="number" name="minAttendancePct" min="0" max="100" step="1" value={data.event.certificateRules.minAttendancePct} />
				</label>
			</div>
			{#if data.sessions.length}
				<fieldset class="required">
					<legend>Sessions every certificate holder must attend</legend>
					{#each data.sessions as s (s.id)}
						<label class="ops-check">
							<input type="checkbox" name="requiredSessionIds" value={s.id} checked={data.event.certificateRules.requiredSessionIds.includes(s.id)} />
							{s.hall} · {s.title} ({clock(s.startsAt)})
						</label>
					{/each}
				</fieldset>
			{/if}
			<div class="ops-actions"><button class="btn btn-primary ops-btn-sm" type="submit"><Save size={15} aria-hidden="true" /> Save rules</button></div>
		</form>
	</section>

	<div class="cols">
		<section class="ops-panel" aria-labelledby="gates-title">
			<h2 id="gates-title">Gates</h2>
			{@render message('gates')}
			<ul class="items">
				{#each data.gates as g (g.id)}
					<li>
						<span>{g.name}</span>
						<form method="post" action="?/deleteGate" use:enhance>
							<input type="hidden" name="id" value={g.id} />
							<button class="btn btn-ghost ops-btn-sm" type="submit" aria-label="Remove {g.name}"><Trash size={14} aria-hidden="true" /></button>
						</form>
					</li>
				{:else}
					<li class="ops-hint">No gates yet. Gate handlers then record “Any gate”.</li>
				{/each}
			</ul>
			<form method="post" action="?/addGate" class="inline" use:enhance={keep}>
				<label class="ops-label">New gate<input name="name" maxlength="60" placeholder="Main gate" required /></label>
				<button class="btn btn-secondary ops-btn-sm" type="submit"><Plus size={15} aria-hidden="true" /> Add</button>
			</form>
		</section>

		<section class="ops-panel" aria-labelledby="pass-title">
			<h2 id="pass-title">Reissue a delegate’s QR</h2>
			<p class="ops-hint">For a lost phone or a shared screenshot. The old QR and “My pass” link stop working at once.</p>
			{@render message('pass')}
			<form method="post" action="?/reissue" class="ops-form" use:enhance={keep}>
				<label class="ops-label">Registration number<input name="code" placeholder="MBC-XXXXXX" required pattern="[Mm][Bb][Cc]-[A-Za-z0-9]{'{6}'}" /></label>
				<label class="ops-check"><input type="checkbox" name="email" checked /> Email the new pass to the delegate</label>
				<div class="ops-actions"><button class="btn btn-secondary ops-btn-sm" type="submit" disabled={!data.passesReady}><QrCode size={15} aria-hidden="true" /> Reissue QR</button></div>
			</form>
		</section>
	</div>

	<section class="ops-panel" aria-labelledby="sessions-title">
		<h2 id="sessions-title">Halls and sessions</h2>
		{@render message('sessions')}
		{#if data.sessions.length}
			<div class="ops-table-wrap">
				<table class="ops-table">
					<thead><tr><th>Hall</th><th>Session</th><th>Time</th><th>Counts for attendance</th><th></th></tr></thead>
					<tbody>
						{#each data.sessions as s (s.id)}
							<tr>
								<td>{s.hall}</td>
								<td>{s.title}</td>
								<td>{clock(s.startsAt)} – {clock(s.endsAt)}</td>
								<td>{s.countsForAttendance ? 'Yes' : 'No'}</td>
								<td>
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
			<p class="ops-hint">No sessions yet. Add one per hall and time slot, e.g. Hall A · Business Leadership.</p>
		{/if}
		<form method="post" action="?/addSession" class="ops-grid" use:enhance={keep}>
			<label class="ops-label">Hall<input name="hall" maxlength="60" placeholder="Hall A" required list="halls" /></label>
			<datalist id="halls">{#each [...new Set(data.sessions.map((s) => s.hall))] as h (h)}<option value={h}></option>{/each}</datalist>
			<label class="ops-label">Session title<input name="title" maxlength="120" placeholder="Business Leadership" required /></label>
			<label class="ops-label">Date<input type="date" name="date" value={data.eventDate} required /></label>
			<label class="ops-label">Starts<input type="time" name="start" required /></label>
			<label class="ops-label">Ends<input type="time" name="end" required /></label>
			<label class="ops-check"><input type="checkbox" name="counts" checked /> Counts for attendance %</label>
			<button class="btn btn-secondary ops-btn-sm" type="submit"><Plus size={15} aria-hidden="true" /> Add session</button>
		</form>
	</section>

	<section class="ops-panel" aria-labelledby="meals-title">
		<h2 id="meals-title">Meals</h2>
		{@render message('meals')}
		{#if data.meals.length}
			<div class="ops-table-wrap">
				<table class="ops-table">
					<thead><tr><th>Meal</th><th>Served</th><th>Per delegate</th><th>Who</th><th>Status</th><th></th></tr></thead>
					<tbody>
						{#each data.meals as m (m.id)}
							<tr>
								<td>{m.name}</td>
								<td>{m.startsAt ? `${clock(m.startsAt)} – ${clock(m.endsAt)}` : 'Any time'}</td>
								<td class="num">{m.maxPerParticipant}</td>
								<td>{m.eligibility === 'checked_in' ? 'Checked-in delegates' : 'Every paid delegate'}</td>
								<td><span class="ops-pill {m.active ? 'active' : 'inactive'}">{m.active ? 'Open' : 'Closed'}</span></td>
								<td>
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
			<p class="ops-hint">No meals yet. Add breakfast, lunch, evening snacks or dinner.</p>
		{/if}
		<form method="post" action="?/addMeal" class="ops-grid" use:enhance={keep}>
			<label class="ops-label">Meal<input name="name" maxlength="40" placeholder="Lunch" required list="meal-names" /></label>
			<datalist id="meal-names"><option value="Breakfast"></option><option value="Lunch"></option><option value="Evening snacks"></option><option value="Dinner"></option></datalist>
			<label class="ops-label">Date<input type="date" name="date" value={data.eventDate} /></label>
			<label class="ops-label">From <small>Optional</small><input type="time" name="start" /></label>
			<label class="ops-label">Until <small>Optional</small><input type="time" name="end" /></label>
			<label class="ops-label">Servings per delegate<input type="number" name="max" min="1" max="10" value="1" required /></label>
			<label class="ops-label">
				Who can collect
				<select name="eligibility"><option value="paid">Every paid delegate</option><option value="checked_in">Only delegates checked in at a gate</option></select>
			</label>
			<button class="btn btn-secondary ops-btn-sm" type="submit"><Plus size={15} aria-hidden="true" /> Add meal</button>
		</form>
	</section>
{/if}

<style>
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--space-6);
		align-items: start;
	}

	.required {
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.required legend {
		margin-bottom: var(--space-1);
		font-size: 13px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.items {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.items li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) 0;
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

	code {
		font-size: 12px;
	}
</style>
