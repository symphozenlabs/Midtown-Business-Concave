import { indiaDay } from '#lib/directory/rules.ts';
import { byStall, type DelegateFacts, type Exhibitor, type ExhibitorFacts } from '#lib/stall-directory/rules.ts';
import { isDatabaseConfigured, sql } from '../db.ts';
import { getStallBooking, isBookingStoreAvailable, listStallBookings, prepareBookings } from '../bookings.ts';
import { audit } from '../ops/event.ts';
import { flagsFrom } from '../directory/people.ts';
import { directoryReady } from '../directory/settings.ts';
import type { Member } from '../directory/viewer.ts';
import type { ChatMessage } from '../directory/messages.ts';

/*
 * Stall directory storage. Conversations are between one delegate (a paid
 * registration) and one confirmed stall booking; the delegate always starts them.
 * Leads are delegates whose pass QR an exhibitor scanned at the stall. The tables
 * are in db/schema.sql and are also created here on first use, like stall_bookings.
 */

const TABLES = [
	`create table if not exists stall_conversations (
  id                   uuid primary key default gen_random_uuid(),
  stall_booking_id     uuid not null references stall_bookings (id) on delete cascade,
  registration_id      uuid not null references registrations (id) on delete cascade,
  last_sender          text not null check (last_sender in ('delegate', 'exhibitor')),
  last_message_at      timestamptz not null default now(),
  delegate_read_at     timestamptz,
  exhibitor_read_at    timestamptz,
  delegate_emailed_at  timestamptz,
  exhibitor_emailed_at timestamptz,
  exhibitor_blocked    boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (stall_booking_id, registration_id)
)`,
	`create index if not exists stall_conversations_registration_idx on stall_conversations (registration_id, created_at)`,
	`create table if not exists stall_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references stall_conversations (id) on delete cascade,
  sender          text not null check (sender in ('delegate', 'exhibitor')),
  body            text not null check (char_length(body) between 1 and 1000),
  client_key      uuid,
  created_at      timestamptz not null default now()
)`,
	`create index if not exists stall_messages_conversation_idx on stall_messages (conversation_id, id)`,
	`create unique index if not exists stall_messages_client_key on stall_messages (client_key) where client_key is not null`,
	`create table if not exists stall_leads (
  stall_booking_id uuid not null references stall_bookings (id) on delete cascade,
  registration_id  uuid not null references registrations (id) on delete cascade,
  note             text check (char_length(note) <= 300),
  scanned_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (stall_booking_id, registration_id)
)`,
	`alter table stall_bookings add column if not exists login_emailed_at timestamptz`
];

let ready: Promise<void> | null = null;

function ensureTables(): Promise<void> {
	ready ??= (async () => {
		await prepareBookings();
		for (const statement of TABLES) await sql().query(statement);
	})().catch((e) => {
		ready = null;
		throw e;
	});
	return ready;
}

/**
 * Messaging and leads need the live database and the visitors directory tables
 * (for the delegate's own and the organiser's messaging switches).
 */
export async function stallDirectoryReady(): Promise<boolean> {
	if (!isDatabaseConfigured || !(await directoryReady())) return false;
	try {
		await ensureTables();
		return true;
	} catch (e) {
		console.error('[stall-directory] could not create the tables', e);
		return false;
	}
}

/* ---------- the public list ---------- */

/** Every confirmed stall, by stall number. Works with the in-memory store too. */
export async function listExhibitors(): Promise<Exhibitor[]> {
	if (!isBookingStoreAvailable) return [];
	await prepareBookings();
	return (await listStallBookings())
		.filter((b) => b.status === 'paid')
		.map((b) => ({ id: b.id, businessName: b.businessName, contactName: b.fullName, stall: b.allottedStall, stallType: b.stallType }))
		.sort(byStall);
}

export async function getExhibitor(id: string): Promise<Exhibitor | null> {
	if (!isBookingStoreAvailable) return null;
	await prepareBookings();
	const b = await getStallBooking(id);
	if (!b || b.status !== 'paid') return null;
	return { id: b.id, businessName: b.businessName, contactName: b.fullName, stall: b.allottedStall, stallType: b.stallType };
}

/* ---------- messages ---------- */

export type Side = 'delegate' | 'exhibitor';

const iso = (v: unknown) => new Date(v as string).toISOString();
const preview = (body: unknown) => {
	const line = String(body ?? '').split('\n')[0];
	return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

/** What the delegate needs to decide whether they may write to this stall, in one round trip. */
export async function delegateThread(me: Member, bookingId: string, closed: boolean) {
	const dayStart = `${indiaDay(new Date())}T00:00:00+05:30`;
	const [rows, started] = await Promise.all([
		sql()`
			select c.id, c.exhibitor_blocked,
				(select count(*)::int from stall_messages x where x.conversation_id = c.id and x.sender = 'delegate') as my_sent,
				(select count(*)::int from stall_messages x where x.conversation_id = c.id and x.sender = 'exhibitor') as their_sent
			from stall_conversations c
			where c.stall_booking_id = ${bookingId} and c.registration_id = ${me.id}`,
		sql()`select count(*)::int as n from stall_conversations where registration_id = ${me.id} and created_at >= ${dayStart}::timestamptz`
	]);
	const c = rows[0];
	const facts: DelegateFacts = {
		closed,
		me: { messagesOff: me.flags.messagesOff, adminMessagesOff: me.flags.adminMessagesOff, startedToday: started[0]?.n ?? 0 },
		stall: { blockedMe: Boolean(c?.exhibitor_blocked) },
		conversation: c ? { mySent: c.my_sent, theirSent: c.their_sent } : null
	};
	return { conversationId: (c?.id as string | undefined) ?? null, facts };
}

/** A conversation of one of the exhibitor's stalls, with the delegate who started it. */
export async function exhibitorThread(bookingIds: string[], conversationId: string, closed: boolean) {
	const rows = await sql()`
		select c.id, c.stall_booking_id, c.exhibitor_blocked, b.business_name, b.allotted_stall,
			r.id as registration_id, r.full_name, r.designation, r.company_name, r.status,
			m.messages_off, m.admin_messages_off, m.hidden, m.admin_hidden
		from stall_conversations c
		join stall_bookings b on b.id = c.stall_booking_id
		join registrations r on r.id = c.registration_id
		left join directory_members m on m.registration_id = r.id
		where c.id = ${conversationId} and c.stall_booking_id = any(${bookingIds}::uuid[])`;
	const r = rows[0];
	if (!r) return null;
	const flags = flagsFrom(r);
	const facts: ExhibitorFacts = {
		closed,
		iBlocked: Boolean(r.exhibitor_blocked),
		delegate: r.status === 'paid' ? { messagesOff: flags.messagesOff, adminMessagesOff: flags.adminMessagesOff } : null
	};
	return {
		conversationId: r.id as string,
		bookingId: r.stall_booking_id as string,
		stall: { businessName: r.business_name as string, number: (r.allotted_stall as number | null) ?? null },
		delegate: { id: r.registration_id as string, fullName: r.full_name as string, designation: r.designation as string, companyName: r.company_name as string },
		facts
	};
}

/**
 * Stores a message, creating the conversation on the delegate's first one, and marks
 * it read for the sender. emailDue: this message claimed the other side's backup email,
 * by the same rule as the visitors directory (rules.ts shouldEmail): due when never
 * emailed or read since the last email, and not while they have it open.
 */
export async function sendStallMessage(m: {
	bookingId: string;
	registrationId: string;
	sender: Side;
	body: string;
	clientKey: string | null;
}): Promise<{ message: ChatMessage; conversationId: string; emailDue: boolean }> {
	const fromDelegate = m.sender === 'delegate';
	const rows = await sql()`
		with c as (
			insert into stall_conversations
				(stall_booking_id, registration_id, last_sender, last_message_at, delegate_read_at, exhibitor_emailed_at)
			values (${m.bookingId}, ${m.registrationId}, ${m.sender}, now(), now(), now())
			on conflict (stall_booking_id, registration_id) do update set
				last_sender = excluded.last_sender,
				last_message_at = now(),
				delegate_read_at = case when ${fromDelegate}::boolean then now() else stall_conversations.delegate_read_at end,
				exhibitor_read_at = case when ${fromDelegate}::boolean then stall_conversations.exhibitor_read_at else now() end,
				exhibitor_emailed_at = case
					when ${fromDelegate}::boolean
						and (stall_conversations.exhibitor_emailed_at is null
							or stall_conversations.exhibitor_read_at >= stall_conversations.exhibitor_emailed_at)
						and (stall_conversations.exhibitor_read_at is null or stall_conversations.exhibitor_read_at < now() - interval '2 minutes') then now()
					else stall_conversations.exhibitor_emailed_at end,
				delegate_emailed_at = case
					when not ${fromDelegate}::boolean
						and (stall_conversations.delegate_emailed_at is null
							or stall_conversations.delegate_read_at >= stall_conversations.delegate_emailed_at)
						and (stall_conversations.delegate_read_at is null or stall_conversations.delegate_read_at < now() - interval '2 minutes') then now()
					else stall_conversations.delegate_emailed_at end
			returning id, (case when ${fromDelegate}::boolean then exhibitor_emailed_at else delegate_emailed_at end) = now() as email_due
		), x as (
			insert into stall_messages (conversation_id, sender, body, client_key)
			select id, ${m.sender}, ${m.body}, ${m.clientKey}::uuid from c
			returning id, created_at, conversation_id
		)
		select x.id, x.created_at, x.conversation_id, c.email_due
		from x join c on c.id = x.conversation_id`;
	const r = rows[0];
	return {
		message: { id: Number(r.id), mine: true, body: m.body, at: iso(r.created_at) },
		conversationId: r.conversation_id,
		emailDue: Boolean(r.email_due)
	};
}

/** The message already stored for this draft key (a resent post), if it is mine. */
export async function stallMessageByKey(clientKey: string, side: Side, who: { registrationId?: string; bookingIds?: string[] }) {
	const rows = await sql()`
		select x.id, x.body, x.created_at from stall_messages x
		join stall_conversations c on c.id = x.conversation_id
		where x.client_key = ${clientKey}::uuid and x.sender = ${side}
			and (c.registration_id = ${who.registrationId ?? null}::uuid or c.stall_booking_id = any(${who.bookingIds ?? []}::uuid[]))`;
	const r = rows[0];
	return r ? ({ id: Number(r.id), mine: true, body: r.body, at: iso(r.created_at) } satisfies ChatMessage) : null;
}

/** The last 200 messages of a conversation, or those after `afterId`, oldest first. */
export async function stallMessagesIn(
	conversationId: string,
	side: Side,
	who: { registrationId?: string; bookingIds?: string[] },
	afterId = 0
): Promise<ChatMessage[]> {
	const rows = await sql()`
		select x.id, x.sender, x.body, x.created_at
		from stall_messages x join stall_conversations c on c.id = x.conversation_id
		where x.conversation_id = ${conversationId} and x.id > ${afterId}
			and (case when ${side} = 'delegate' then c.registration_id = ${who.registrationId ?? null}::uuid
				else c.stall_booking_id = any(${who.bookingIds ?? []}::uuid[]) end)
		order by x.id desc
		limit 200`;
	return rows.reverse().map((r) => ({ id: Number(r.id), mine: r.sender === side, body: r.body, at: iso(r.created_at) }));
}

export async function markStallRead(conversationId: string, side: Side): Promise<void> {
	if (side === 'delegate') await sql()`update stall_conversations set delegate_read_at = now() where id = ${conversationId}`;
	else await sql()`update stall_conversations set exhibitor_read_at = now() where id = ${conversationId}`;
}

/** The backup email claimed by sendStallMessage didn't go. */
export async function releaseStallEmail(conversationId: string, recipient: Side): Promise<void> {
	if (recipient === 'delegate') await sql()`update stall_conversations set delegate_emailed_at = null where id = ${conversationId}`;
	else await sql()`update stall_conversations set exhibitor_emailed_at = null where id = ${conversationId}`;
}

export interface StallConversationSummary {
	conversationId: string;
	/** The stall, for a delegate; the stall written to, for an exhibitor. */
	bookingId: string;
	businessName: string;
	stall: number | null;
	/** The delegate, for an exhibitor's inbox. */
	delegate: { fullName: string; designation: string; companyName: string } | null;
	lastAt: string;
	preview: string;
	unread: boolean;
	blocked: boolean;
}

/** The delegate's conversations with stalls, newest first. */
export async function delegateConversations(registrationId: string): Promise<StallConversationSummary[]> {
	const rows = await sql()`
		select c.id, c.stall_booking_id, b.business_name, b.allotted_stall, c.last_message_at,
			(c.last_sender = 'exhibitor' and c.last_message_at > coalesce(c.delegate_read_at, '-infinity'::timestamptz)) as unread,
			(select x.body from stall_messages x where x.conversation_id = c.id order by x.id desc limit 1) as last_body
		from stall_conversations c join stall_bookings b on b.id = c.stall_booking_id
		where c.registration_id = ${registrationId} and b.status = 'paid'
		order by c.last_message_at desc
		limit 300`;
	return rows.map((r) => ({
		conversationId: r.id,
		bookingId: r.stall_booking_id,
		businessName: r.business_name,
		stall: r.allotted_stall ?? null,
		delegate: null,
		lastAt: iso(r.last_message_at),
		preview: preview(r.last_body),
		unread: Boolean(r.unread),
		blocked: false
	}));
}

/** The exhibitor's inbox across their stalls, newest first. */
export async function exhibitorConversations(bookingIds: string[]): Promise<StallConversationSummary[]> {
	const rows = await sql()`
		select c.id, c.stall_booking_id, b.business_name, b.allotted_stall, c.last_message_at, c.exhibitor_blocked,
			r.full_name, r.designation, r.company_name,
			(c.last_sender = 'delegate' and c.last_message_at > coalesce(c.exhibitor_read_at, '-infinity'::timestamptz)
				and not c.exhibitor_blocked) as unread,
			(select x.body from stall_messages x where x.conversation_id = c.id order by x.id desc limit 1) as last_body
		from stall_conversations c
		join stall_bookings b on b.id = c.stall_booking_id
		join registrations r on r.id = c.registration_id
		where c.stall_booking_id = any(${bookingIds}::uuid[])
		order by c.last_message_at desc
		limit 500`;
	return rows.map((r) => ({
		conversationId: r.id,
		bookingId: r.stall_booking_id,
		businessName: r.business_name,
		stall: r.allotted_stall ?? null,
		delegate: { fullName: r.full_name, designation: r.designation, companyName: r.company_name },
		lastAt: iso(r.last_message_at),
		preview: preview(r.last_body),
		unread: Boolean(r.unread),
		blocked: Boolean(r.exhibitor_blocked)
	}));
}

/** The cheap "anything new?" answer for polling. */
export async function stallPollState(side: Side, who: { registrationId?: string; bookingIds?: string[] }) {
	const rows =
		side === 'delegate'
			? await sql()`
				select count(*) filter (where c.last_sender = 'exhibitor'
						and c.last_message_at > coalesce(c.delegate_read_at, '-infinity'::timestamptz))::int as unread,
					max(c.last_message_at) as latest
				from stall_conversations c where c.registration_id = ${who.registrationId ?? null}::uuid`
			: await sql()`
				select count(*) filter (where c.last_sender = 'delegate' and not c.exhibitor_blocked
						and c.last_message_at > coalesce(c.exhibitor_read_at, '-infinity'::timestamptz))::int as unread,
					max(c.last_message_at) as latest
				from stall_conversations c where c.stall_booking_id = any(${who.bookingIds ?? []}::uuid[])`;
	const r = rows[0];
	return { unread: (r?.unread as number) ?? 0, latest: r?.latest ? iso(r.latest) : null };
}

/** The exhibitor blocks (or unblocks) the delegate in one conversation. The delegate isn't told. */
export async function setExhibitorBlocked(conversationId: string, bookingIds: string[], blocked: boolean, by: string): Promise<boolean> {
	const rows = await sql()`
		update stall_conversations set exhibitor_blocked = ${blocked}
		where id = ${conversationId} and stall_booking_id = any(${bookingIds}::uuid[])
		returning registration_id`;
	if (!rows[0]) return false;
	await audit({
		actorType: 'system',
		actor: `exhibitor:${by}`,
		action: blocked ? 'stall_directory.block' : 'stall_directory.unblock',
		targetType: 'registration',
		targetId: rows[0].registration_id
	});
	return true;
}

/* ---------- leads ---------- */

/** A delegate who let the exhibitor scan their pass. Showing the QR shares the contact card. */
export interface Lead {
	registrationId: string;
	bookingId: string;
	stall: number | null;
	fullName: string;
	designation: string;
	companyName: string;
	industry: string;
	city: string;
	email: string;
	phone: string;
	note: string;
	scannedAt: string;
}

function leadFrom(r: Record<string, any>): Lead {
	return {
		registrationId: r.registration_id,
		bookingId: r.stall_booking_id,
		stall: r.allotted_stall ?? null,
		fullName: r.full_name,
		designation: r.designation,
		companyName: r.company_name,
		industry: r.industry ?? '',
		city: r.city ?? '',
		email: r.email,
		phone: r.phone,
		note: r.note ?? '',
		scannedAt: iso(r.scanned_at)
	};
}

/** Saves a scanned delegate to the stall's leads; scanning someone again keeps the first time and note. */
export async function addLead(bookingId: string, registrationId: string): Promise<{ lead: Lead; isNew: boolean } | null> {
	const inserted = await sql()`
		insert into stall_leads (stall_booking_id, registration_id)
		select ${bookingId}, id from registrations where id = ${registrationId} and status = 'paid'
		on conflict (stall_booking_id, registration_id) do nothing
		returning registration_id`;
	const r = await leadRow(bookingId, registrationId);
	return r ? { lead: leadFrom(r), isNew: inserted.length > 0 } : null;
}

async function leadRow(bookingId: string, registrationId: string) {
	const rows = await sql()`
		select l.stall_booking_id, l.registration_id, l.note, l.scanned_at, b.allotted_stall,
			r.full_name, r.designation, r.company_name, r.industry, r.city, r.email, r.phone
		from stall_leads l
		join stall_bookings b on b.id = l.stall_booking_id
		join registrations r on r.id = l.registration_id
		where l.stall_booking_id = ${bookingId} and l.registration_id = ${registrationId} and r.status = 'paid'`;
	return rows[0];
}

export async function listLeads(bookingIds: string[]): Promise<Lead[]> {
	const rows = await sql()`
		select l.stall_booking_id, l.registration_id, l.note, l.scanned_at, b.allotted_stall,
			r.full_name, r.designation, r.company_name, r.industry, r.city, r.email, r.phone
		from stall_leads l
		join stall_bookings b on b.id = l.stall_booking_id
		join registrations r on r.id = l.registration_id
		where l.stall_booking_id = any(${bookingIds}::uuid[]) and r.status = 'paid'
		order by l.scanned_at desc
		limit 2000`;
	return rows.map(leadFrom);
}

export async function countLeads(bookingIds: string[]): Promise<number> {
	const rows = await sql()`select count(*)::int as n from stall_leads where stall_booking_id = any(${bookingIds}::uuid[])`;
	return (rows[0]?.n as number) ?? 0;
}

export async function saveLeadNote(bookingIds: string[], bookingId: string, registrationId: string, note: string): Promise<boolean> {
	if (!bookingIds.includes(bookingId)) return false;
	const rows = await sql()`
		update stall_leads set note = ${note || null}, updated_at = now()
		where stall_booking_id = ${bookingId} and registration_id = ${registrationId}
		returning registration_id`;
	return rows.length > 0;
}

export async function removeLead(bookingIds: string[], bookingId: string, registrationId: string): Promise<boolean> {
	if (!bookingIds.includes(bookingId)) return false;
	const rows = await sql()`
		delete from stall_leads where stall_booking_id = ${bookingId} and registration_id = ${registrationId}
		returning registration_id`;
	return rows.length > 0;
}

/** The registration behind a typed registration number (MBC-XXXXXX), for the manual lookup. */
export async function registrationByCode(code: string): Promise<string | null> {
	const rows = await sql()`select id from registrations where code = ${code} and status = 'paid'`;
	return (rows[0]?.id as string | undefined) ?? null;
}

/* ---------- login emails ---------- */

/** Confirmed stalls whose exhibitor hasn't been sent the directory login yet. */
export async function loginEmailsWaiting(): Promise<string[]> {
	if (!isDatabaseConfigured) return [];
	await ensureTables();
	const rows = await sql()`select id from stall_bookings where status = 'paid' and login_emailed_at is null order by created_at`;
	return rows.map((r) => r.id);
}

export async function markLoginEmailed(id: string): Promise<void> {
	await ensureTables();
	await sql()`update stall_bookings set login_emailed_at = now() where id = ${id}`;
}
