import { dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { SITE_URL } from '#lib/event.ts';
import { linkOrigin } from '#lib/site-origin.ts';

/** Development against a throwaway local or in-memory database, where links should stay local. */
const localTesting = dev && (!DATABASE_URL || /@(localhost|127\.0\.0\.1|db\.localtest\.me)[:/]/.test(DATABASE_URL));

/** "production", "preview" or "development" on Vercel; undefined elsewhere. */
const vercelEnv = typeof process !== 'undefined' ? process.env?.VERCEL_ENV : undefined;

/**
 * The origin for links and QR codes sent to people. Always the live site, even when
 * the dashboard runs on a laptop against the live database; only a local test setup
 * keeps its own address, so its links work. Ticket emails and the QR on ID cards use
 * this, so a card made from a preview deployment still points at the live site.
 */
export function publicOrigin(url: URL): string {
	return linkOrigin({ requestOrigin: url.origin, siteUrl: SITE_URL, localTesting, vercelEnv: undefined });
}

/**
 * Visitors directory sign-in and "Read and reply" links: like publicOrigin, but a Vercel
 * preview keeps its own address, so testers stay on the preview they're testing.
 */
export function directoryOrigin(url: URL): string {
	return linkOrigin({ requestOrigin: url.origin, siteUrl: SITE_URL, localTesting, vercelEnv });
}
