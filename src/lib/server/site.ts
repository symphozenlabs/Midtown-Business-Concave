import { dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { SITE_URL } from '#lib/event.ts';

/** Development against a throwaway local or in-memory database, where links should stay local. */
const localTesting = dev && (!DATABASE_URL || /@(localhost|127\.0\.0\.1|db\.localtest\.me)[:/]/.test(DATABASE_URL));

/**
 * The origin for links and QR codes sent to people. Always the live site, even when
 * the dashboard runs on a laptop against the live database; only a local test setup
 * keeps its own address, so its links work.
 */
export function publicOrigin(url: URL): string {
	return localTesting ? url.origin : SITE_URL;
}
