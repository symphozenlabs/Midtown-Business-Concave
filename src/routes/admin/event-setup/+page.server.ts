import { fail, redirect } from '@sveltejs/kit';
import { sameName } from '#lib/catalog.ts';
import { fromEventFormFields, toEventFormFields } from '#lib/event-settings.ts';
import { sql, uniqueViolation } from '#lib/server/db.ts';
import { sendPassEmail } from '#lib/server/email.ts';
import {
	addGate,
	addMeal,
	addSession,
	audit,
	deleteGate,
	deleteMeal,
	deleteSession,
	getDefaultEvent,
	opsReady,
	listGates,
	listMeals,
	listSessions,
	saveEventRules,
	setMealActive,
	type MealEligibility
} from '#lib/server/ops/event.ts';
import { accessPath, isPassConfigured, markPassEmailed, passUrl, reissuePass } from '#lib/server/ops/passes.ts';
import { qrPng } from '#lib/server/qr-png.ts';
import { getEventSettings, getRegistration, isStoreAvailable, saveEventSettings } from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	// The date and time are editable even before the event-desk tables exist.
	const schedule = isStoreAvailable ? await getEventSettings() : null;
	if (!(await opsReady())) return { available: false as const, schedule };
	const event = await getDefaultEvent();
	const [gates, sessions, meals] = await Promise.all([listGates(event.id), listSessions(event.id), listMeals(event.id)]);
	return {
		available: true as const,
		passesReady: isPassConfigured,
		event,
		gates,
		sessions,
		meals,
		schedule,
		eventDate: schedule ? toEventFormFields(schedule).date : ''
	};
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const idOf = (form: FormData) => {
	const id = text(form, 'id');
	return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A date and a clock time in India as an instant. */
const at = (date: string, time: string) => (DATE.test(date) && TIME.test(time) ? `${date}T${time}:00+05:30` : null);

export const actions: Actions = {
	/** When the event happens, in Indian time: shown on the site, the countdown and the emails. */
	saveEvent: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'schedule', message: 'Sign in again.' });
		const form = await request.formData();
		const result = fromEventFormFields({ date: text(form, 'date'), start: text(form, 'start'), end: text(form, 'end') });
		if (!result.ok) return fail(400, { scope: 'schedule', errors: result.errors, message: 'Check the date and time.' });
		await saveEventSettings(result.settings, locals.admin.email);
		return { scope: 'schedule', success: 'Event date and time saved. The site, countdown and emails use them now.' };
	},

	rules: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'rules', message: 'Sign in again.' });
		const form = await request.formData();
		const event = await getDefaultEvent();
		const sessions = await listSessions(event.id);
		const pct = Number(text(form, 'minAttendancePct') || 0);
		if (!Number.isInteger(pct) || pct < 0 || pct > 100) return fail(400, { scope: 'rules', message: 'Attendance must be 0–100%.' });
		const rules = {
			requirePaid: form.get('requirePaid') === 'on',
			requireCheckin: form.get('requireCheckin') === 'on',
			minAttendancePct: pct,
			requiredSessionIds: form
				.getAll('requiredSessionIds')
				.map(String)
				.filter((id) => sessions.some((s) => s.id === id))
		};
		const allowReentry = form.get('allowReentry') === 'on';
		await saveEventRules(event.id, allowReentry, rules);
		await audit({
			eventId: event.id,
			actorType: 'admin',
			actor: locals.admin.email,
			action: 'event.rules',
			details: { allowReentry, before: { allowReentry: event.allowReentry, rules: event.certificateRules }, rules }
		});
		return { scope: 'rules', success: 'Entry and certificate rules saved.' };
	},

	addGate: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'gates', message: 'Sign in again.' });
		const name = text(await request.formData(), 'name').replace(/\s+/g, ' ').slice(0, 60);
		if (!name) return fail(400, { scope: 'gates', message: 'Name the gate.' });
		const event = await getDefaultEvent();
		// Case and spacing do not make a new gate: Main gate and main  GATE are the same.
		if ((await listGates(event.id)).some((g) => sameName(g.name, name))) {
			return fail(409, { scope: 'gates', message: `There is already a gate called ${name}.` });
		}
		try {
			await addGate(event.id, name);
		} catch (e) {
			if (uniqueViolation(e)) return fail(409, { scope: 'gates', message: 'There is already a gate with that name.' });
			throw e;
		}
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'gate.add', details: { name } });
		return { scope: 'gates', success: `Added ${name}.` };
	},

	deleteGate: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'gates', message: 'Sign in again.' });
		const id = idOf(await request.formData());
		if (!id) return fail(400, { scope: 'gates', message: 'Choose a gate.' });
		const event = await getDefaultEvent();
		await deleteGate(event.id, id);
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'gate.delete', targetType: 'gate', targetId: id });
		return { scope: 'gates', success: 'Gate removed. Check-ins through it keep their record.' };
	},

	addSession: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'sessions', message: 'Sign in again.' });
		const form = await request.formData();
		// An existing hall from the dropdown, or the name typed for a new one.
		const hall = (text(form, 'hall') || text(form, 'newHall')).replace(/\s+/g, ' ').slice(0, 60);
		const title = text(form, 'title').slice(0, 120);
		const startsAt = at(text(form, 'date'), text(form, 'start'));
		const endsAt = at(text(form, 'date'), text(form, 'end'));
		if (!hall || title.length < 2) return fail(400, { scope: 'sessions', message: 'Enter the hall and the session title.' });
		if (!startsAt || !endsAt || endsAt <= startsAt) return fail(400, { scope: 'sessions', message: 'Enter a start time before the end time.' });
		const event = await getDefaultEvent();
		await addSession(event.id, { hall, title, startsAt, endsAt, countsForAttendance: form.get('counts') === 'on' });
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'session.add', details: { hall, title, startsAt, endsAt } });
		return { scope: 'sessions', success: `Added ${title} in ${hall}.` };
	},

	deleteSession: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'sessions', message: 'Sign in again.' });
		const id = idOf(await request.formData());
		if (!id) return fail(400, { scope: 'sessions', message: 'Choose a session.' });
		const event = await getDefaultEvent();
		const [used] = await sql()`select count(*)::int as n from session_attendance where session_id = ${id}`;
		if (used?.n) return fail(409, { scope: 'sessions', message: `This session already has ${used.n} attendance records, so it stays.` });
		await deleteSession(event.id, id);
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'session.delete', targetType: 'session', targetId: id });
		return { scope: 'sessions', success: 'Session removed.' };
	},

	addMeal: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'meals', message: 'Sign in again.' });
		const form = await request.formData();
		const name = text(form, 'name').slice(0, 40);
		const date = text(form, 'date');
		const start = text(form, 'start');
		const end = text(form, 'end');
		const startsAt = start ? at(date, start) : null;
		const endsAt = end ? at(date, end) : null;
		const max = Number(text(form, 'max') || 1);
		const eligibility = (text(form, 'eligibility') === 'checked_in' ? 'checked_in' : 'paid') as MealEligibility;
		if (name.length < 2) return fail(400, { scope: 'meals', message: 'Name the meal.' });
		if ((start && !startsAt) || (end && !endsAt) || (startsAt && endsAt && endsAt <= startsAt)) {
			return fail(400, { scope: 'meals', message: 'Check the serving times.' });
		}
		if (!Number.isInteger(max) || max < 1 || max > 10) return fail(400, { scope: 'meals', message: 'Servings per delegate: 1 to 10.' });
		const event = await getDefaultEvent();
		try {
			await addMeal(event.id, { name, startsAt, endsAt, maxPerParticipant: max, eligibility });
		} catch (e) {
			if (uniqueViolation(e)) return fail(409, { scope: 'meals', message: 'There is already a meal with that name.' });
			throw e;
		}
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'meal.add', details: { name, startsAt, endsAt, max, eligibility } });
		return { scope: 'meals', success: `Added ${name}.` };
	},

	toggleMeal: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'meals', message: 'Sign in again.' });
		const form = await request.formData();
		const id = idOf(form);
		if (!id) return fail(400, { scope: 'meals', message: 'Choose a meal.' });
		const active = text(form, 'active') === 'true';
		const event = await getDefaultEvent();
		await setMealActive(event.id, id, active);
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: active ? 'meal.open' : 'meal.close', targetType: 'meal', targetId: id });
		return { scope: 'meals', success: active ? 'Meal opened.' : 'Meal closed: counters can no longer serve it.' };
	},

	deleteMeal: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'meals', message: 'Sign in again.' });
		const id = idOf(await request.formData());
		if (!id) return fail(400, { scope: 'meals', message: 'Choose a meal.' });
		const event = await getDefaultEvent();
		const [used] = await sql()`select count(*)::int as n from meal_redemptions where meal_id = ${id}`;
		if (used?.n) return fail(409, { scope: 'meals', message: `${used.n} servings are recorded for this meal. Close it instead.` });
		await deleteMeal(event.id, id);
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'meal.delete', targetType: 'meal', targetId: id });
		return { scope: 'meals', success: 'Meal removed.' };
	},

	/** Revokes a delegate's QR (lost phone, shared screenshot) and optionally emails the new one. */
	reissue: async ({ request, locals, url }) => {
		if (!locals.admin) return fail(401, { scope: 'pass', message: 'Sign in again.' });
		const form = await request.formData();
		const code = text(form, 'code').toUpperCase();
		const [row] = await sql()`select id from registrations where code = ${code}`;
		const reg = row && (await getRegistration(row.id));
		if (!reg) return fail(404, { scope: 'pass', message: `No registration ${code}.` });
		const event = await getDefaultEvent();
		const pass = await reissuePass(event.id, reg.id, locals.admin.email);
		if (form.get('email') === 'on') {
			try {
				await sendPassEmail(reg, {
					myPassUrl: url.origin + (await accessPath(reg.code, reg.id, pass.version)),
					qr: await qrPng(passUrl(url.origin, pass.token))
				});
				await markPassEmailed(reg.id);
			} catch (e) {
				console.error('[admin] reissued pass email failed', e);
				return fail(502, { scope: 'pass', message: `New QR issued for ${reg.fullName}, but the email failed. The old QR no longer works.` });
			}
		}
		return {
			scope: 'pass',
			success: `New QR issued for ${reg.fullName} (${reg.code}). The old QR and "My pass" link no longer work${form.get('email') === 'on' ? '; the new pass was emailed' : ''}.`
		};
	}
};
