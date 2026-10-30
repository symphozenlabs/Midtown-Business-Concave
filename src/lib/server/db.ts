import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { DATABASE_URL } from '$app/env/private';

export const isDatabaseConfigured = Boolean(DATABASE_URL);

let client: NeonQueryFunction<false, false> | null = null;

/** Neon's HTTP driver: one round trip per query, works on Cloudflare Workers. */
export function sql() {
	client ??= neon(DATABASE_URL!);
	return client;
}

/** Postgres unique-violation details from a Neon error, if that is what it is. */
export function uniqueViolation(error: unknown): string | null {
	if (typeof error !== 'object' || !error) return null;
	const e = error as { code?: string; constraint?: string };
	return e.code === '23505' ? (e.constraint ?? 'unique') : null;
}
