/**
 * Fixed-window request counter, per server instance. Serverless platforms run
 * several instances, so this slows abuse rather than stopping it outright; the
 * durable limits (login lockout, unique indexes) live in the database.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

/** True when the request may go ahead. */
export function allow(key: string, limit: number, windowMs: number) {
	const now = Date.now();
	if (windows.size > 10_000) {
		for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
	}
	const w = windows.get(key);
	if (!w || w.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	w.count++;
	return w.count <= limit;
}
