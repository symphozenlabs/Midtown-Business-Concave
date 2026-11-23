import { sql } from '../db.ts';

/** A delegate's own choices and the organiser's overrides. No row means all false. */
export interface MemberFlags {
	hidden: boolean;
	messagesOff: boolean;
	adminHidden: boolean;
	adminMessagesOff: boolean;
}

/** What the directory shows of a delegate: never phone, email, photo, industry or city. */
export interface DirectoryPerson {
	id: string;
	fullName: string;
	designation: string;
	companyName: string;
	/** False when they (or the organiser) turned their messages off. */
	takesMessages: boolean;
}

export const NO_FLAGS: MemberFlags = { hidden: false, messagesOff: false, adminHidden: false, adminMessagesOff: false };

export function flagsFrom(r: Record<string, any> | undefined): MemberFlags {
	if (!r) return { ...NO_FLAGS };
	return {
		hidden: Boolean(r.hidden),
		messagesOff: Boolean(r.messages_off),
		adminHidden: Boolean(r.admin_hidden),
		adminMessagesOff: Boolean(r.admin_messages_off)
	};
}

export async function memberFlags(registrationId: string): Promise<MemberFlags> {
	const rows = await sql()`
		select hidden, messages_off, admin_hidden, admin_messages_off
		from directory_members where registration_id = ${registrationId}`;
	return flagsFrom(rows[0]);
}

/**
 * Everyone listed for `me`, A–Z: paid delegates other than me, minus anyone hidden
 * (by themselves or the organiser) and anyone blocked in either direction.
 */
export async function listPeople(me: string): Promise<DirectoryPerson[]> {
	const rows = await sql()`
		select r.id, r.full_name, r.designation, r.company_name,
			not (coalesce(m.messages_off, false) or coalesce(m.admin_messages_off, false)) as takes_messages
		from registrations r
		left join directory_members m on m.registration_id = r.id
		where r.status = 'paid' and r.id <> ${me}
			and not coalesce(m.hidden, false) and not coalesce(m.admin_hidden, false)
			and not exists (
				select 1 from directory_blocks b
				where (b.blocker_id = ${me} and b.blocked_id = r.id) or (b.blocker_id = r.id and b.blocked_id = ${me})
			)
		order by lower(r.full_name), r.id`;
	return rows.map(personFrom);
}

export function personFrom(r: Record<string, any>): DirectoryPerson {
	return {
		id: r.id,
		fullName: r.full_name,
		designation: r.designation,
		companyName: r.company_name,
		takesMessages: Boolean(r.takes_messages)
	};
}
