import { b64url, bytesEqual, DUMMY_HASH, fromB64url, hashPassword, hmac, hmacKey, verifyPassword } from './crypto.ts';
import { isDatabaseConfigured, sql } from './db.ts';

export const SESSION_COOKIE = 'mbc_admin';
export const SESSION_HOURS = 12;
// Site-wide, so /login can tell a signed-in organiser to go straight to the dashboard.
export const SESSION_COOKIE_PATH = '/';

// Organiser accounts live in the admin_users table in Neon (db/schema.sql);
// db/set-admin.ts adds one or resets its password.
export const isAdminConfigured = isDatabaseConfigured;

const enc = new TextEncoder();

interface AdminRow {
	email: string;
	password_hash: string;
}

async function findAdmin(email: string): Promise<AdminRow | null> {
	const rows = (await sql()`
		select email, password_hash from admin_users where lower(email) = lower(${email}) limit 1`) as AdminRow[];
	return rows[0] ?? null;
}

// Each session is signed with a key derived from the account's password hash,
// so resetting the password signs out every existing session.
function sessionKey(admin: AdminRow) {
	return hmacKey(`mbc-admin:${admin.email.toLowerCase()}:${admin.password_hash}`);
}

export async function checkCredentials(email: string, password: string): Promise<AdminRow | null> {
	if (!isAdminConfigured) return null;
	const admin = await findAdmin(email.trim());
	// Unknown emails take as long as wrong passwords.
	const ok = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);
	if (!admin || !ok) return null;
	await sql()`update admin_users set last_login_at = now() where lower(email) = lower(${admin.email})`;
	return admin;
}

/**
 * Replaces the password after checking the current one. The new hash changes the
 * signing key, so every open session ends; the caller signs this one in again.
 */
export async function changeAdminPassword(email: string, current: string, next: string): Promise<AdminRow | null> {
	const admin = await findAdmin(email);
	if (!admin || !(await verifyPassword(current, admin.password_hash))) return null;
	const hash = await hashPassword(next);
	await sql()`
		update admin_users set password_hash = ${hash}, updated_at = now() where lower(email) = lower(${admin.email})`;
	return { email: admin.email, password_hash: hash };
}

export async function createSession(admin: AdminRow) {
	const payload = b64url(enc.encode(JSON.stringify({ email: admin.email, exp: Date.now() + SESSION_HOURS * 3600_000 })));
	return `${payload}.${b64url(await hmac(await sessionKey(admin), payload))}`;
}

export async function readSession(cookie: string | undefined): Promise<{ email: string } | null> {
	if (!cookie || !isAdminConfigured) return null;
	const [payload, signature] = cookie.split('.');
	if (!payload || !signature) return null;
	try {
		const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
		if (typeof data.exp !== 'number' || data.exp < Date.now() || typeof data.email !== 'string') return null;
		const admin = await findAdmin(data.email);
		if (!admin) return null;
		if (!bytesEqual(await hmac(await sessionKey(admin), payload), fromB64url(signature))) return null;
		return { email: admin.email };
	} catch {
		return null;
	}
}
