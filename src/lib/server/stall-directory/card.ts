import { bytesEqual, fromB64url } from '../crypto.ts';
import { sql } from '../db.ts';
import { prepareBookings } from '../bookings.ts';
import { qrPng } from '../qr-png.ts';
import { isExhibitorLoginAvailable, sign } from './exhibitor.ts';

/*
 * A stall's contact card, shared the way delegates share theirs: a QR the exhibitor
 * shows at the stall (and gets with the confirmation email) opens
 * /stallDirectory/card/<code>.<signature>, with phone, email and "Save contact".
 * The signature keeps the link unguessable, so the contact details reach only people
 * who were shown the QR. No database row: it is recomputed from the booking.
 */

const CODE = /^STL-[A-Z0-9]{6}$/;

/** The exhibitor's contact card as anyone who scans the stall QR sees it. */
export interface StallCard {
	id: string;
	code: string;
	businessName: string;
	contactName: string;
	email: string;
	phone: string;
	stall: number | null;
	stallType: string;
}

export const isStallCardAvailable = isExhibitorLoginAvailable;

export async function stallCardPath(b: { id: string; code: string }): Promise<string> {
	return `/stallDirectory/card/${b.code}.${await sign('card', b.id)}`;
}

/** Every confirmed stall's contact-card link, by booking id: the directory's "Save contact" buttons. */
export async function stallCardPaths(): Promise<Record<string, string>> {
	if (!isStallCardAvailable) return {};
	await prepareBookings();
	const rows = await sql()`select id, code from stall_bookings where status = 'paid'`;
	const entries = await Promise.all(rows.map(async (r) => [r.id as string, await stallCardPath({ id: r.id, code: r.code })] as const));
	return Object.fromEntries(entries);
}

/** The QR to print or show at the stall, as a PNG. */
export async function stallCardQr(origin: string, b: { id: string; code: string }): Promise<Uint8Array> {
	return qrPng(origin + (await stallCardPath(b)));
}

/** The confirmed stall behind a card link, or null when the link is wrong or the booking isn't confirmed. */
export async function resolveStallCard(param: string): Promise<StallCard | null> {
	if (!isStallCardAvailable) return null;
	const [code, signature] = param.split('.');
	if (!code || !signature || !CODE.test(code)) return null;
	await prepareBookings();
	const rows = await sql()`
		select id, code, business_name, full_name, email, phone, allotted_stall, stall_type
		from stall_bookings where code = ${code} and status = 'paid'`;
	const r = rows[0];
	if (!r) return null;
	try {
		if (!bytesEqual(fromB64url(signature), fromB64url(await sign('card', r.id)))) return null;
	} catch {
		return null;
	}
	return {
		id: r.id,
		code: r.code,
		businessName: r.business_name,
		contactName: r.full_name,
		email: r.email,
		phone: r.phone,
		stall: r.allotted_stall ?? null,
		stallType: r.stall_type
	};
}
