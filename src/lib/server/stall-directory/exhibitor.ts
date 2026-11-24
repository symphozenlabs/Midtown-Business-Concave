import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { PASS_SECRET } from '$app/env/private';
import { normalisePhone } from '#lib/registration.ts';
import { b64url, bytesEqual, fromB64url, hmac, hmacKey } from '../crypto.ts';
import { isDatabaseConfigured, sql } from '../db.ts';
import { prepareBookings } from '../bookings.ts';

/*
 * Exhibitor sign-in for the stall directory. The organisers asked for the email the
 * stall was booked with as the login and the mobile number as the password, so there
 * is no password to store: a confirmed booking with that email and phone signs in.
 * Several confirmed bookings under one email and phone are one exhibitor.
 */

export const EXHIBITOR_COOKIE = 'mbc_stall';
const EXHIBITOR_DAYS = 30;

const secret = PASS_SECRET ?? (dev ? 'mbc-development-pass-secret' : undefined);
export const isExhibitorLoginAvailable = Boolean(secret) && isDatabaseConfigured;

let keyPromise: Promise<CryptoKey> | null = null;
const key = () => (keyPromise ??= hmacKey(`mbc-exhibitor:${secret}`));

/** 128-bit HMAC of the parts with the exhibitor key: 22 URL-safe characters. */
export async function sign(...parts: (string | number)[]) {
	return b64url((await hmac(await key(), parts.join(':'))).slice(0, 16));
}

/** The signed-in exhibitor: their confirmed stalls under one email and phone. */
export interface ExhibitorSession {
	/** The booking they signed in with. */
	bookingId: string;
	/** Every confirmed booking with the same email and phone. */
	bookingIds: string[];
	contactName: string;
	businessName: string;
	email: string;
	stalls: { id: string; code: string; businessName: string; stall: number | null }[];
}

async function sessionFor(email: string, phone: string): Promise<ExhibitorSession | null> {
	await prepareBookings();
	const rows = await sql()`
		select id, code, full_name, business_name, email, allotted_stall from stall_bookings
		where lower(email) = lower(${email}) and phone = ${phone} and status = 'paid'
		order by allotted_stall nulls last, created_at`;
	if (!rows.length) return null;
	const first = rows[0];
	return {
		bookingId: first.id,
		bookingIds: rows.map((r) => r.id),
		contactName: first.full_name,
		businessName: first.business_name,
		email: first.email,
		stalls: rows.map((r) => ({ id: r.id, code: r.code, businessName: r.business_name, stall: r.allotted_stall ?? null }))
	};
}

/** Checks the login: the booking email and the 10-digit mobile number it was booked with. */
export async function checkExhibitorLogin(emailRaw: string, phoneRaw: string): Promise<ExhibitorSession | null> {
	if (!isExhibitorLoginAvailable) return null;
	const email = emailRaw.trim();
	const phone = normalisePhone(phoneRaw);
	if (!email || !phone) return null;
	return sessionFor(email, phone);
}

/** Signed with the phone, so the cookie stops working if the booking's details change. */
export async function exhibitorCookie(bookingId: string, phone: string) {
	const exp = Date.now() + EXHIBITOR_DAYS * 86_400_000;
	return { value: `${bookingId}.${exp}.${await sign('session', bookingId, exp, phone)}`, maxAge: EXHIBITOR_DAYS * 86_400 };
}

export function setExhibitorCookie(cookies: Cookies, cookie: { value: string; maxAge: number }) {
	cookies.set(EXHIBITOR_COOKIE, cookie.value, { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: cookie.maxAge });
}

export function clearExhibitorCookie(cookies: Cookies) {
	cookies.delete(EXHIBITOR_COOKIE, { path: '/' });
}

/** The exhibitor signed in on this browser, while their booking is still confirmed. */
export async function readExhibitor(cookies: Cookies): Promise<ExhibitorSession | null> {
	const cookie = cookies.get(EXHIBITOR_COOKIE);
	if (!cookie || !isExhibitorLoginAvailable) return null;
	const [id, exp, signature] = cookie.split('.');
	if (!id || !exp || !signature || !/^[0-9a-f-]{36}$/i.test(id) || Number(exp) < Date.now()) return null;
	await prepareBookings();
	const rows = await sql()`select email, phone from stall_bookings where id = ${id} and status = 'paid'`;
	const r = rows[0];
	if (!r) return null;
	try {
		if (!bytesEqual(fromB64url(signature), fromB64url(await sign('session', id, Number(exp), r.phone)))) return null;
	} catch {
		return null;
	}
	return sessionFor(r.email, r.phone);
}
