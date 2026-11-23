import type { RequestEvent } from '@sveltejs/kit';
import { purgeCheckDue } from '#lib/directory/rules.ts';
import { background } from '../background.ts';
import { purgeIfDue } from './messages.ts';
import { directoryReady, getDirectorySettings } from './settings.ts';

let lastCheck: number | null = null;

/**
 * Deletes the directory's messages 30 days after it closes. There is no scheduler, so
 * any request to the site checks (at most hourly per server, after the response):
 * by January hardly anyone is still signed in to the directory itself.
 */
export function checkDirectoryPurge(event: RequestEvent): void {
	const now = Date.now();
	if (!purgeCheckDue(lastCheck, now)) return;
	lastCheck = now;
	background(event, async () => {
		if (await directoryReady()) await purgeIfDue(await getDirectorySettings());
	});
}
