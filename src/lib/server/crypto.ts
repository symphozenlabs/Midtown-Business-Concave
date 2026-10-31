/** WebCrypto helpers that run the same on Cloudflare Workers, Vercel and Node. */

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array) {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string) {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string) {
	return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

/** Unguessable token for cookies and links: 32 random bytes, URL-safe. */
export function randomToken(bytes = 32) {
	return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function hmacKey(secret: string) {
	return crypto.subtle
		.digest('SHA-256', enc.encode(secret))
		.then((raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
}

export async function hmac(key: CryptoKey, data: string) {
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Constant-time comparison of two equal-length byte arrays. */
export function bytesEqual(a: Uint8Array, b: Uint8Array) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/* ---------- reversible encryption ---------- */

function aesKey(secret: string, purpose: string) {
	return crypto.subtle
		.digest('SHA-256', enc.encode(`${purpose}:${secret}`))
		.then((raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
}

/** AES-GCM: "<iv>.<ciphertext>", both base64url. Tampering makes unseal fail. */
export async function seal(text: string, secret: string, purpose: string) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret, purpose), enc.encode(text));
	return `${b64url(iv)}.${b64url(new Uint8Array(data))}`;
}

export async function unseal(sealed: string, secret: string, purpose: string): Promise<string | null> {
	const [iv, data] = sealed.split('.');
	if (!iv || !data) return null;
	try {
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(secret, purpose), fromB64url(data));
		return new TextDecoder().decode(plain);
	} catch {
		return null;
	}
}

/* ---------- passwords ---------- */

// Cloudflare Workers cap PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		256
	);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return `pbkdf2-sha256$${ITERATIONS}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [scheme, iterations, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2-sha256' || !salt || !hash) return false;
	const derived = await pbkdf2(password, fromB64url(salt), Number(iterations));
	return bytesEqual(derived, fromB64url(hash));
}

/** A hash that never matches, so unknown usernames take as long as wrong passwords. */
export const DUMMY_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// No 0/O, 1/I/l: easy to read out over the phone.
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Temporary password like "Kq7m-Xw3p-Tz9a": 12 random characters, easy to type. */
export function temporaryPassword() {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	const chars = [...bytes].map((b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]);
	return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-');
}

export const MIN_PASSWORD = 10;

export function passwordProblem(password: string): string | null {
	if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
	if (password.length > 128) return 'Use at most 128 characters.';
	if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use both letters and numbers.';
	return null;
}
