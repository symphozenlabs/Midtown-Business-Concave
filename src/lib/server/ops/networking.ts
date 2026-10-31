import { ensureColumn, sql } from '../db.ts';
import { audit } from './event.ts';

export type Side = 'pending' | 'accepted' | 'declined';

/** What anyone may see after scanning a participant's QR: what is on their poster, and their line about the business. */
export interface PublicProfile {
	registrationId: string;
	fullName: string;
	designation: string;
	companyName: string;
	industry: string;
	city: string;
	about: string | null;
	website: string | null;
}

/** Shared only while both sides have accepted. */
export interface Contact {
	email: string;
	phone: string;
}

export type ConnectionState =
	| 'none'
	/** I asked; waiting for them. */
	| 'requested'
	/** They asked (or a desk introduced us); waiting for me. */
	| 'incoming'
	| 'connected'
	/** I declined or withdrew. */
	| 'declined';

export interface Connection {
	other: PublicProfile;
	state: ConnectionState;
	contact: Contact | null;
	introduced: boolean;
	updatedAt: string;
}

export function profileFrom(r: Record<string, any>): PublicProfile {
	return {
		registrationId: r.id,
		fullName: r.full_name,
		designation: r.designation,
		companyName: r.company_name,
		industry: r.industry,
		city: r.city,
		about: r.about,
		website: r.website
	};
}

export async function publicProfile(registrationId: string): Promise<PublicProfile | null> {
	const rows = await sql()`
		select id, full_name, designation, company_name, industry, city, about, website
		from registrations where id = ${registrationId} and status = 'paid'`;
	return rows[0] ? profileFrom(rows[0]) : null;
}

/** What scanning the QR on the ID card shows: the details the delegate registered with (never phone or email). */
/**
 * The delegate behind a scanned QR. Showing the QR is how a delegate shares their
 * contact card, so phone and email come with it (LinkedIn when they gave one).
 */
export interface PassHolder extends PublicProfile {
	code: string;
	interests: string[];
	photoKey: string | null;
	email: string;
	phone: string;
	linkedin: string | null;
}

export async function passHolder(registrationId: string): Promise<PassHolder | null> {
	await ensureColumn('registrations', 'linkedin');
	const rows = await sql()`
		select id, code, full_name, email, phone, designation, company_name, industry, city, about, website, linkedin, interests, photo_key
		from registrations where id = ${registrationId} and status = 'paid'`;
	const r = rows[0];
	if (!r) return null;
	return {
		...profileFrom(r),
		code: r.code,
		interests: r.interests ?? [],
		photoKey: r.photo_key ?? null,
		email: r.email,
		phone: r.phone,
		linkedin: r.linkedin ?? null
	};
}

/** Rows store the pair once, smaller id first, so each side has a fixed column. */
const pair = (x: string, y: string) => (x.toLowerCase() < y.toLowerCase() ? { a: x, b: y, meIsA: true } : { a: y, b: x, meIsA: false });

function stateFor(mine: Side, theirs: Side): ConnectionState {
	if (mine === 'accepted' && theirs === 'accepted') return 'connected';
	if (mine === 'declined') return 'declined';
	if (mine === 'accepted') return 'requested';
	return theirs === 'declined' ? 'none' : 'incoming';
}

export async function connectionState(eventId: string, me: string, other: string): Promise<ConnectionState> {
	const { a, b, meIsA } = pair(me, other);
	const rows = await sql()`select a_status, b_status from participant_connections where event_id = ${eventId} and a_id = ${a} and b_id = ${b}`;
	if (!rows[0]) return 'none';
	return meIsA ? stateFor(rows[0].a_status, rows[0].b_status) : stateFor(rows[0].b_status, rows[0].a_status);
}

/**
 * I agree to connect: asks them, or accepts their request or an introduction.
 * Their side is never changed here, so a decline on their part stands.
 */
export async function consent(eventId: string, me: string, other: string): Promise<ConnectionState> {
	if (me === other) return 'none';
	const { a, b, meIsA } = pair(me, other);
	if (meIsA) {
		await sql()`
			insert into participant_connections (event_id, a_id, b_id, a_status, b_status)
			values (${eventId}, ${a}, ${b}, 'accepted', 'pending')
			on conflict (event_id, a_id, b_id) do update set a_status = 'accepted', updated_at = now()`;
	} else {
		await sql()`
			insert into participant_connections (event_id, a_id, b_id, a_status, b_status)
			values (${eventId}, ${a}, ${b}, 'pending', 'accepted')
			on conflict (event_id, a_id, b_id) do update set b_status = 'accepted', updated_at = now()`;
	}
	await audit({ eventId, actorType: 'participant', actor: me, action: 'connection.consent', targetType: 'registration', targetId: other });
	return connectionState(eventId, me, other);
}

/** Declines a request, or withdraws consent from a connection: contact details stop being shared. */
export async function withdraw(eventId: string, me: string, other: string) {
	const { a, b, meIsA } = pair(me, other);
	if (meIsA) {
		await sql()`update participant_connections set a_status = 'declined', updated_at = now() where event_id = ${eventId} and a_id = ${a} and b_id = ${b}`;
	} else {
		await sql()`update participant_connections set b_status = 'declined', updated_at = now() where event_id = ${eventId} and a_id = ${a} and b_id = ${b}`;
	}
	await audit({ eventId, actorType: 'participant', actor: me, action: 'connection.withdraw', targetType: 'registration', targetId: other });
}

/** A networking desk suggests two delegates meet. Both must accept on their own pass. */
export async function introduce(eventId: string, x: string, y: string, handlerId: string): Promise<'created' | 'exists'> {
	const { a, b } = pair(x, y);
	const rows = await sql()`
		insert into participant_connections (event_id, a_id, b_id, a_status, b_status, introduced_by_handler)
		values (${eventId}, ${a}, ${b}, 'pending', 'pending', ${handlerId})
		on conflict (event_id, a_id, b_id) do nothing
		returning id`;
	return rows[0] ? 'created' : 'exists';
}

/** Everyone I have a connection row with, newest first. */
export async function listConnections(eventId: string, me: string): Promise<Connection[]> {
	const rows = await sql()`
		select c.a_id, c.a_status, c.b_status, c.introduced_by_handler, c.updated_at,
			r.id, r.full_name, r.designation, r.company_name, r.industry, r.city, r.about, r.website, r.email, r.phone
		from participant_connections c
		join registrations r on r.id = case when c.a_id = ${me} then c.b_id else c.a_id end
		where c.event_id = ${eventId} and (c.a_id = ${me} or c.b_id = ${me})
		order by c.updated_at desc
		limit 300`;
	return rows
		.map((r) => {
			const meIsA = r.a_id === me;
			const state = meIsA ? stateFor(r.a_status, r.b_status) : stateFor(r.b_status, r.a_status);
			return {
				other: profileFrom(r),
				state,
				contact: state === 'connected' ? { email: r.email, phone: r.phone } : null,
				introduced: Boolean(r.introduced_by_handler),
				updatedAt: new Date(r.updated_at).toISOString()
			};
		})
		.filter((c) => c.state !== 'none');
}
