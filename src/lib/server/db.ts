import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';
import { dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';

export const isDatabaseConfigured = Boolean(DATABASE_URL);

let client: NeonQueryFunction<false, false> | null = null;

/** Neon's HTTP driver: one round trip per query, works on Cloudflare Workers. */
export function sql() {
	if (!client) {
		// A local Neon HTTP proxy (postgresql://…@localhost:4444/…) for development
		// against a throwaway database instead of the live one.
		if (dev && /@(localhost|127\.0\.0\.1|db\.localtest\.me)[:/]/.test(DATABASE_URL!)) {
			neonConfig.fetchEndpoint = (host, port) => `http://${host}:${port}/sql`;
		}
		client = neon(DATABASE_URL!);
	}
	return client;
}

/** Postgres unique-violation details from a Neon error, if that is what it is. */
export function uniqueViolation(error: unknown): string | null {
	if (typeof error !== 'object' || !error) return null;
	const e = error as { code?: string; constraint?: string };
	return e.code === '23505' ? (e.constraint ?? 'unique') : null;
}
