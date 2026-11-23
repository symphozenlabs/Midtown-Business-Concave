import { indiaDay } from './rules.ts';

const clock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });

/** "11:42 am" for today in India, "27 Nov, 6:45 pm" for earlier days. */
export function messageTime(iso: string, now: Date = new Date()): string {
	const at = new Date(iso);
	const time = clock.format(at).toLowerCase();
	return indiaDay(at) === indiaDay(now) ? time : `${day.format(at)}, ${time}`;
}
