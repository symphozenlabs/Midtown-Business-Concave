import { EVENT } from './event.ts';

/**
 * The part of the event the organisers can change from the dashboard: when it
 * happens. The name, venue and partners stay in `event.ts`, and the poster
 * artwork carries its own printed date.
 */
export interface EventSettings {
	/** ISO 8601 with the Indian offset, e.g. 2026-11-28T10:00:00+05:30 */
	startsAt: string;
	endsAt: string;
}

export const DEFAULT_EVENT: EventSettings = { startsAt: EVENT.startsAt, endsAt: EVENT.endsAt };

export const EVENT_TIME_ZONE = 'Asia/Kolkata';
const OFFSET = '+05:30';

export interface EventLabels {
	/** Saturday, 28 November 2026 */
	dateLabel: string;
	/** Sat, 28 Nov 2026 */
	compactDate: string;
	/** 28 Nov 2026 */
	shortDate: string;
	/** 10.00 am – 6.00 pm */
	timeLabel: string;
	/** 10 am – 6 pm */
	compactTime: string;
}

type Parts = Record<string, string>;

function parts(date: Date, options: Intl.DateTimeFormatOptions): Parts {
	const out: Parts = {};
	for (const p of new Intl.DateTimeFormat('en-GB', { ...options, timeZone: EVENT_TIME_ZONE }).formatToParts(date)) {
		if (p.type !== 'literal') out[p.type] = p.value;
	}
	return out;
}

function dayParts(d: Date, long: boolean) {
	return parts(d, { weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' });
}

/** "10.00 am", or "10 am" when compact and on the hour. */
function clock(d: Date, compact: boolean) {
	const p = parts(d, { hour: 'numeric', minute: '2-digit', hour12: true });
	const period = (p.dayPeriod ?? '').toLowerCase().replace(/\./g, '');
	const hour = p.hour.replace(/^0/, '');
	return compact && p.minute === '00' ? `${hour} ${period}` : `${hour}.${p.minute} ${period}`;
}

export function isValidEventSettings(value: unknown): value is EventSettings {
	if (typeof value !== 'object' || !value) return false;
	const v = value as Record<string, unknown>;
	if (typeof v.startsAt !== 'string' || typeof v.endsAt !== 'string') return false;
	const start = Date.parse(v.startsAt);
	const end = Date.parse(v.endsAt);
	return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/** Human labels for the hero, countdown and emails, in Indian time. */
export function eventLabels(settings: EventSettings): EventLabels {
	const start = new Date(settings.startsAt);
	const end = new Date(settings.endsAt);
	const s = dayParts(start, true);
	const e = dayParts(end, true);
	const sameDay = s.day === e.day && s.month === e.month && s.year === e.year;

	const long = `${s.weekday}, ${s.day} ${s.month} ${s.year}`;
	const sc = dayParts(start, false);
	const ec = dayParts(end, false);
	return {
		dateLabel: sameDay ? long : `${long} – ${e.weekday}, ${e.day} ${e.month} ${e.year}`,
		compactDate: sameDay
			? `${sc.weekday}, ${sc.day} ${sc.month} ${sc.year}`
			: `${sc.day} ${sc.month} – ${ec.day} ${ec.month} ${ec.year}`,
		shortDate: sameDay ? `${sc.day} ${sc.month} ${sc.year}` : `${sc.day}–${ec.day} ${ec.month} ${ec.year}`,
		timeLabel: `${clock(start, false)} – ${clock(end, false)}`,
		compactTime: `${clock(start, true)} – ${clock(end, true)}`
	};
}

/* ---------- admin form helpers: one day, Indian time ---------- */

export interface EventFormFields {
	/** YYYY-MM-DD */
	date: string;
	/** HH:MM, 24-hour */
	start: string;
	end: string;
}

/** Splits the stored instants into the date and time inputs of the settings form. */
export function toEventFormFields(settings: EventSettings): EventFormFields {
	const d = parts(new Date(settings.startsAt), { year: 'numeric', month: '2-digit', day: '2-digit' });
	const time = (iso: string) => {
		const p = parts(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
		return `${p.hour}:${p.minute}`;
	};
	return { date: `${d.year}-${d.month}-${d.day}`, start: time(settings.startsAt), end: time(settings.endsAt) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type EventFormErrors = Partial<Record<keyof EventFormFields, string>>;

/** Validates the form and returns the settings, or the field errors. */
export function fromEventFormFields(
	fields: EventFormFields
): { ok: true; settings: EventSettings } | { ok: false; errors: EventFormErrors } {
	const errors: EventFormErrors = {};
	if (!DATE.test(fields.date) || !Number.isFinite(Date.parse(`${fields.date}T00:00:00${OFFSET}`))) {
		errors.date = 'Choose the date of the event.';
	}
	if (!TIME.test(fields.start)) errors.start = 'Enter the start time.';
	if (!TIME.test(fields.end)) errors.end = 'Enter the end time.';
	if (!errors.date && !errors.start && !errors.end && fields.end <= fields.start) {
		errors.end = 'The end time must be after the start time.';
	}
	if (Object.keys(errors).length) return { ok: false, errors };
	return {
		ok: true,
		settings: {
			startsAt: `${fields.date}T${fields.start}:00${OFFSET}`,
			endsAt: `${fields.date}T${fields.end}:00${OFFSET}`
		}
	};
}
