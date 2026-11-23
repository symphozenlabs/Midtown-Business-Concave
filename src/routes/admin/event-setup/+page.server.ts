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
	shiftScheduleDays,
	updateSession,
	SESSION_LIMITS,
	type ConferenceSession,
	type MealEligibility
} from '#lib/server/ops/event.ts';
import { accessPath, isPassConfigured, markPassEmailed, passUrl, reissuePass } from '#lib/server/ops/passes.ts';
import { qrPng } from '#lib/server/qr-png.ts';
import { publicOrigin } from '#lib/server/site.ts';
import { getEventSettings, getRegistration, isStoreAvailable, saveEventSettings, setFrontsOutdated } from '#lib/server/store.ts';
import { directoryReady, getDirectorySettings, saveDirectorySettings } from '#lib/server/directory/settings.ts';
import { isPushConfigured } from '#lib/server/push.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	// The date and time are editable even before the event-desk tables exist.
	const schedule = isStoreAvailable ? await getEventSettings() : null;
	if (!(await opsReady())) return { available: false as const, schedule };
	const event = await getDefaultEvent();
	const [gates, sessions, meals, directory] = await Promise.all([
		listGates(event.id),
		listSessions(event.id),
		listMeals(event.id),
		directoryPanel()
	]);
	return {
		available: true as const,
		directory,
		passesReady: isPassConfigured,
		event,
		gates,
		sessions,
		meals,
		schedule,
		eventDate: schedule ? toEventFormFields(schedule).date : ''
	};
};

const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const istTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

/** The visitors directory panel: closing time in India, daily email cap, push switch. */
async function directoryPanel() {
	if (!(await directoryReady())) return null;
	const s = await getDirectorySettings();
	const closes = new Date(s.closesAt);
	return {
		closeDate: istDate.format(closes),
		closeTime: istTime.format(closes),
		emailCapPerDay: s.emailCapPerDay,
		pushEnabled: s.pushEnabled,
		pushConfigured: isPushConfigured
	};
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const idOf = (form: FormData) => {
	const id = text(form, 'id');
	return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A date and a clock time in India as an instant. */
const at = (date: string, time: string) => (DATE.test(date) && TIME.test(time) ? `${date}T${time}:00+05:30` : null);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The add and edit session forms share their fields. */
function readSessionForm(form: FormData):
	| { ok: true; session: Omit<ConferenceSession, 'id'> }
	| { ok: false; message: string } {
	// An existing hall from the dropdown, or the name typed for a new one.
	const hall = oneLine(text(form, 'hall') || text(form, 'newHall'));
	const title = oneLine(text(form, 'title'));
	const speaker = oneLine(text(form, 'speaker'));
	const description = text(form, 'description').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
	const startsAt = at(text(form, 'date'), text(form, 'start'));
	const endsAt = at(text(form, 'date'), text(form, 'end'));
	if (!hall || title.length < 2) return { ok: false, message: 'Enter the hall and the session title.' };
	if (hall.length > SESSION_LIMITS.hall) return { ok: false, message: `Keep the hall name under ${SESSION_LIMITS.hall} characters.` };
	if (title.length > SESSION_LIMITS.title) return { ok: false, message: `Keep the title under ${SESSION_LIMITS.title} characters.` };
	if (speaker.length > SESSION_LIMITS.speaker) return { ok: false, message: `Keep the speaker under ${SESSION_LIMITS.speaker} characters.` };
	if (description.length > SESSION_LIMITS.description) return { ok: false, message: `Keep the description under ${SESSION_LIMITS.description} characters.` };
	if (!startsAt || !endsAt || endsAt <= startsAt) return { ok: false, message: 'Enter a start time before the end time.' };
	return {
		ok: true,
		session: {
			hall,
			title,
			startsAt,
			endsAt,
			countsForAttendance: form.get('counts') === 'on',
			speaker: speaker || null,
			description: description || null,
			showOnAgenda: form.get('agenda') === 'on'
		}
	};
}

export const actions: Actions = {
	/** Visitors directory: when it closes (India time), backup emails per day, push on or off. */
	saveDirectory: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'directory', message: 'Sign in again.' });
		if (!(await directoryReady())) return fail(503, { scope: 'directory', message: 'Run db/schema.sql first: the visitors directory tables are missing.' });
		const form = await request.formData();
		const date = text(form, 'closeDate');
		const time = text(form, 'closeTime');
		// Until the end of that minute.
		const closesAt = DATE.test(date) && TIME.test(time) ? `${date}T${time}:59+05:30` : null;
		if (!closesAt || Number.isNaN(Date.parse(closesAt))) return fail(400, { scope: 'directory', message: 'Choose the closing date and time.' });
		const cap = Number(text(form, 'emailCap'));
		if (!Number.isInteger(cap) || cap < 0 || cap > 1000) return fail(400, { scope: 'directory', message: 'Backup emails per day must be a whole number from 0 to 1000.' });
		const pushEnabled = form.get('push') === 'on' && isPushConfigured;
		const settings = { closesAt, emailCapPerDay: cap, pushEnabled };
		await saveDirectorySettings(settings, locals.admin.email);
		const event = await getDefaultEvent();
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'directory.settings', details: settings });
		return { scope: 'directory', success: 'Visitors directory settings saved.' };
	},

	/** When the event happens, in Indian time: shown on the site, the countdown and the emails. */
	saveEvent: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'schedule', message: 'Sign in again.' });
		const form = await request.formData();
		const result = fromEventFormFields({ date: text(form, 'date'), start: text(form, 'start'), end: text(form, 'end') });
		if (!result.ok) return fail(400, { scope: 'schedule', errors: result.errors, message: 'Check the date and time.' });
		const before = await getEventSettings();
		await saveEventSettings(result.settings, locals.admin.email);

		const changed = before.startsAt !== result.settings.startsAt || before.endsAt !== result.settings.endsAt;
		if (!changed) return { scope: 'schedule', success: 'Event date and time saved. Nothing changed.' };

		const parts = ['Event date and time saved. The site, countdown, emails and new ID cards use them now.'];
		// Moved to another day: sessions and meals go with it, at the same clock times.
		const dayOf = (iso: string) => toEventFormFields({ startsAt: iso, endsAt: iso }).date;
		const days = Math.round((Date.parse(dayOf(result.settings.startsAt)) - Date.parse(dayOf(before.startsAt))) / 86_400_000);
		if (days !== 0 && (await opsReady())) {
			const event = await getDefaultEvent();
			const moved = await shiftScheduleDays(event.id, days);
			if (moved.sessions || moved.meals) {
				const what = [
					moved.sessions ? `${moved.sessions} session${moved.sessions === 1 ? '' : 's'}` : '',
					moved.meals ? `${moved.meals} meal${moved.meals === 1 ? '' : 's'}` : ''
				]
					.filter(Boolean)
					.join(' and ');
				parts.push(`${what} moved ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'later' : 'earlier'}, at the same times.`);
			}
			await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'event.reschedule', details: { days } });
		}
		// ID card fronts already made show the old date and time until they are redrawn.
		await setFrontsOutdated({ since: new Date().toISOString(), by: locals.admin.email }, locals.admin.email);
		parts.push('Open the Dashboard to redraw the ID cards already issued.');
		return { scope: 'schedule', success: parts.join(' ') };
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
		const read = readSessionForm(await request.formData());
		if (!read.ok) return fail(400, { scope: 'sessions', message: read.message });
		const s = read.session;
		const event = await getDefaultEvent();
		await addSession(event.id, s);
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'session.add', details: { hall: s.hall, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt } });
		return { scope: 'sessions', success: `Added ${s.title} in ${s.hall}.` };
	},

	/** Changes a session in place; attendance already recorded for it stays attached. */
	updateSession: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'sessions', message: 'Sign in again.' });
		const form = await request.formData();
		const id = idOf(form);
		if (!id) return fail(400, { scope: 'sessions', message: 'Choose a session.' });
		const read = readSessionForm(form);
		if (!read.ok) return fail(400, { scope: 'sessions', message: read.message });
		const s = read.session;
		const event = await getDefaultEvent();
		if (!(await updateSession(event.id, id, s))) return fail(404, { scope: 'sessions', message: 'That session no longer exists.' });
		await audit({ eventId: event.id, actorType: 'admin', actor: locals.admin.email, action: 'session.update', targetType: 'session', targetId: id, details: { hall: s.hall, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt } });
		return { scope: 'sessions', success: `Saved ${s.title}.` };
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
					myPassUrl: publicOrigin(url) + (await accessPath(reg.code, reg.id, pass.version)),
					qr: await qrPng(passUrl(publicOrigin(url), pass.token))
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
