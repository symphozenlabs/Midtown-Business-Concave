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

const ensured = new Map<string, Promise<void>>();

/**
 * Adds a nullable column the code needs if db/schema.sql has not been rerun yet,
 * once per server instance. Same statement as the schema, so it is safe to repeat.
 */
export function ensureColumn(table: 'registrations' | 'event_handlers', column: string) {
	if (!/^[a-z_]+$/.test(column)) throw new Error(`Bad column name: ${column}`);
	const key = `${table}.${column}`;
	let done = ensured.get(key);
	if (!done) {
		done = sql()
			.query(`alter table ${table} add column if not exists ${column} text`)
			.then(() => undefined)
			.catch((e) => {
				ensured.delete(key);
				throw e;
			});
		ensured.set(key, done);
	}
	return done;
}

/** Postgres unique-violation details from a Neon error, if that is what it is. */
export function uniqueViolation(error: unknown): string | null {
	if (typeof error !== 'object' || !error) return null;
	const e = error as { code?: string; constraint?: string };
	return e.code === '23505' ? (e.constraint ?? 'unique') : null;
}
