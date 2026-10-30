import { ADMIN_EMAIL, ADMIN_PASSWORD } from '$app/env/private';

export const SESSION_COOKIE = 'mbc_admin';
export const SESSION_HOURS = 12;

export const isAdminConfigured = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string) {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// The signing key is derived from the credentials, so changing the password
// in the environment signs out every existing session.
let keyPromise: Promise<CryptoKey> | null = null;
function key() {
	keyPromise ??= crypto.subtle
		.digest('SHA-256', enc.encode(`mbc-admin:${ADMIN_EMAIL}:${ADMIN_PASSWORD}`))
		.then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
	return keyPromise;
}

async function hmac(data: string) {
	return new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(data)));
}

/** Compares two strings in constant time by comparing their HMACs. */
async function safeEqual(a: string, b: string) {
	const [x, y] = await Promise.all([hmac(a), hmac(b)]);
	let diff = 0;
	for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
	return diff === 0;
}

export async function checkCredentials(email: string, password: string) {
	if (!isAdminConfigured) return false;
	const [emailOk, passwordOk] = await Promise.all([
		safeEqual(email.trim().toLowerCase(), ADMIN_EMAIL!.trim().toLowerCase()),
		safeEqual(password, ADMIN_PASSWORD!)
	]);
	return emailOk && passwordOk;
}

export async function createSession() {
	const payload = b64url(enc.encode(JSON.stringify({ email: ADMIN_EMAIL, exp: Date.now() + SESSION_HOURS * 3600_000 })));
	return `${payload}.${b64url(await hmac(payload))}`;
}

export async function readSession(cookie: string | undefined): Promise<{ email: string } | null> {
	if (!cookie || !isAdminConfigured) return null;
	const [payload, signature] = cookie.split('.');
	if (!payload || !signature) return null;
	try {
		const ok = await crypto.subtle.verify('HMAC', await key(), fromB64url(signature), enc.encode(payload));
		if (!ok) return null;
		const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
		if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
		return { email: String(data.email) };
	} catch {
		return null;
	}
}
