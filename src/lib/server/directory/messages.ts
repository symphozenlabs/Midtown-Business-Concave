import { indiaDay, purgeDue, type DirectorySettings, type MessageFacts } from '#lib/directory/rules.ts';
import { sql } from '../db.ts';
import { audit } from '../ops/event.ts';
import { flagsFrom, type DirectoryPerson } from './people.ts';
import type { Member } from './viewer.ts';

export interface ChatMessage {
	id: number;
	mine: boolean;
	body: string;
	at: string;
}

export interface ConversationSummary {
	personId: string;
	fullName: string;
	designation: string;
	companyName: string;
	lastAt: string;
	/** First line of the last message; shown only on the signed-in Messages tab. */
	preview: string;
	unread: boolean;
}

export interface Thread {
	/** null when the other person isn't a paid registration. */
	person: DirectoryPerson | null;
	facts: MessageFacts;
	conversationId: string | null;
	myLast: { body: string; at: string } | null;
}

/** Rows store the pair once, smaller id first (same order as Postgres compares uuids). */
const pair = (x: string, y: string) => (x.toLowerCase() < y.toLowerCase() ? { a: x, b: y, meIsA: true } : { a: y, b: x, meIsA: false });

const iso = (v: unknown) => new Date(v as string).toISOString();

/** Everything needed to decide whether I may send to `otherId`, in one query. */
export async function loadThread(eventId: string, me: Member, otherId: string, closed: boolean): Promise<Thread> {
	const { a, b } = pair(me.id, otherId);
	const dayStart = `${indiaDay(new Date())}T00:00:00+05:30`;
	const [rows, started] = await Promise.all([
		sql()`
			select r.id, r.full_name, r.designation, r.company_name, r.status,
				m.hidden, m.messages_off, m.admin_hidden, m.admin_messages_off,
				exists (select 1 from directory_blocks x where x.blocker_id = ${me.id} and x.blocked_id = r.id) as i_blocked,
				exists (select 1 from directory_blocks x where x.blocker_id = r.id and x.blocked_id = ${me.id}) as they_blocked,
				c.id as conversation_id,
				(select count(*)::int from directory_messages x where x.conversation_id = c.id and x.sender_id = ${me.id}) as my_sent,
				(select count(*)::int from directory_messages x where x.conversation_id = c.id and x.sender_id = r.id) as their_sent,
				(select json_build_object('body', x.body, 'at', x.created_at) from directory_messages x
					where x.conversation_id = c.id and x.sender_id = ${me.id} order by x.id desc limit 1) as my_last
			from registrations r
			left join directory_members m on m.registration_id = r.id
			left join directory_conversations c on c.event_id = ${eventId} and c.a_id = ${a} and c.b_id = ${b}
			where r.id = ${otherId}`,
		sql()`select count(*)::int as n from directory_conversations where started_by = ${me.id} and created_at >= ${dayStart}::timestamptz`
	]);
	const r = rows[0];
	const flags = flagsFrom(r);
	const paid = r?.status === 'paid';
	const facts: MessageFacts = {
		closed,
		me: { messagesOff: me.flags.messagesOff, adminMessagesOff: me.flags.adminMessagesOff, startedToday: started[0]?.n ?? 0 },
		other: r ? { paid, ...flags } : null,
		iBlocked: Boolean(r?.i_blocked),
		theyBlocked: Boolean(r?.they_blocked),
		conversation: r?.conversation_id ? { mySent: r.my_sent, theirSent: r.their_sent } : null
	};
	return {
		person:
			r && paid
				? {
						id: r.id,
						fullName: r.full_name,
						designation: r.designation,
						companyName: r.company_name,
						takesMessages: !(flags.messagesOff || flags.adminMessagesOff)
					}
				: null,
		facts,
		conversationId: r?.conversation_id ?? null,
		myLast: r?.my_last ? { body: r.my_last.body, at: iso(r.my_last.at) } : null
	};
}

/**
 * Stores a message, creating the conversation on the first one, and marks it read for
 * the sender. emailDue: this message claimed the recipient's backup email. The claim
 * (recipient's emailed_at = now) is made in the same statement as the message, so two
 * quick messages can't both claim one; it follows shouldEmail() in rules.ts: due when
 * never emailed, or when they have read the conversation since the last email, and
 * not while they have it open (read in the last two minutes).
 * notify.ts releases the claim if the email doesn't go.
 */
export async function sendMessage(
	eventId: string,
	me: string,
	otherId: string,
	body: string,
	clientKey: string | null = null
): Promise<{ message: ChatMessage; conversationId: string; emailDue: boolean }> {
	const { a, b, meIsA } = pair(me, otherId);
	const rows = await sql()`
		with c as (
			insert into directory_conversations
				(event_id, a_id, b_id, started_by, last_sender_id, last_message_at, a_read_at, b_read_at, a_emailed_at, b_emailed_at)
			values (${eventId}, ${a}, ${b}, ${me}, ${me}, now(),
				case when ${meIsA}::boolean then now() end, case when ${meIsA}::boolean then null else now() end,
				case when ${meIsA}::boolean then null else now() end, case when ${meIsA}::boolean then now() end)
			on conflict (event_id, a_id, b_id) do update set
				last_sender_id = excluded.last_sender_id,
				last_message_at = now(),
				a_read_at = case when ${meIsA}::boolean then now() else directory_conversations.a_read_at end,
				b_read_at = case when ${meIsA}::boolean then directory_conversations.b_read_at else now() end,
				a_emailed_at = case
					when not ${meIsA}::boolean
						and (directory_conversations.a_emailed_at is null
							or directory_conversations.a_read_at >= directory_conversations.a_emailed_at)
						and (directory_conversations.a_read_at is null or directory_conversations.a_read_at < now() - interval '2 minutes') then now()
					else directory_conversations.a_emailed_at end,
				b_emailed_at = case
					when ${meIsA}::boolean
						and (directory_conversations.b_emailed_at is null
							or directory_conversations.b_read_at >= directory_conversations.b_emailed_at)
						and (directory_conversations.b_read_at is null or directory_conversations.b_read_at < now() - interval '2 minutes') then now()
					else directory_conversations.b_emailed_at end
			returning id, (case when ${meIsA}::boolean then b_emailed_at else a_emailed_at end) = now() as email_due
		), m as (
			insert into directory_messages (conversation_id, sender_id, body, client_key)
			select id, ${me}, ${body}, ${clientKey}::uuid from c
			returning id, created_at, conversation_id
		)
		select m.id, m.created_at, m.conversation_id, c.email_due
		from m join c on c.id = m.conversation_id`;
	const r = rows[0];
	return {
		message: { id: Number(r.id), mine: true, body, at: iso(r.created_at) },
		conversationId: r.conversation_id,
		emailDue: Boolean(r.email_due)
	};
}

/** The message I already sent with this draft key, if any (a resent post). */
export async function messageByKey(me: string, clientKey: string): Promise<ChatMessage | null> {
	const rows = await sql()`select id, body, created_at from directory_messages where sender_id = ${me} and client_key = ${clientKey}::uuid`;
	const r = rows[0];
	return r ? { id: Number(r.id), mine: true, body: r.body, at: iso(r.created_at) } : null;
}

/** Messages in one of my conversations, oldest first: the last 200, or those after `afterId`. */
export async function messagesIn(conversationId: string, me: string, afterId = 0): Promise<ChatMessage[]> {
	const rows = await sql()`
		select x.id, x.sender_id, x.body, x.created_at
		from directory_messages x
		join directory_conversations c on c.id = x.conversation_id
		where x.conversation_id = ${conversationId} and (c.a_id = ${me} or c.b_id = ${me}) and x.id > ${afterId}
		order by x.id desc
		limit 200`;
	return rows.reverse().map((r) => ({ id: Number(r.id), mine: r.sender_id === me, body: r.body, at: iso(r.created_at) }));
}

/** I've seen everything in this conversation up to now. */
export async function markRead(conversationId: string, me: string): Promise<void> {
	await sql()`
		update directory_conversations set
			a_read_at = case when a_id = ${me} then now() else a_read_at end,
			b_read_at = case when b_id = ${me} then now() else b_read_at end
		where id = ${conversationId} and (a_id = ${me} or b_id = ${me})`;
}

/** My conversations, newest first, leaving out people I've blocked. */
export async function listConversations(eventId: string, me: string): Promise<ConversationSummary[]> {
	const rows = await sql()`
		select r.id as person_id, r.full_name, r.designation, r.company_name, c.last_message_at,
			(c.last_sender_id is distinct from ${me}::uuid
				and c.last_message_at > coalesce(case when c.a_id = ${me} then c.a_read_at else c.b_read_at end, '-infinity'::timestamptz)) as unread,
			(select x.body from directory_messages x where x.conversation_id = c.id order by x.id desc limit 1) as last_body
		from directory_conversations c
		join registrations r on r.id = case when c.a_id = ${me} then c.b_id else c.a_id end
		where c.event_id = ${eventId} and (c.a_id = ${me} or c.b_id = ${me})
			and not exists (select 1 from directory_blocks x where x.blocker_id = ${me} and x.blocked_id = r.id)
		order by c.last_message_at desc
		limit 300`;
	return rows.map((r) => {
		const firstLine = String(r.last_body ?? '').split('\n')[0];
		return {
			personId: r.person_id,
			fullName: r.full_name,
			designation: r.designation,
			companyName: r.company_name,
			lastAt: iso(r.last_message_at),
			preview: firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine,
			unread: Boolean(r.unread)
		};
	});
}

/**
 * The cheap "anything new?" answer for polling: conversations with unread messages,
 * and when the newest one changed. Same rules as listConversations.
 */
export async function pollState(eventId: string, me: string): Promise<{ unread: number; latest: string | null }> {
	const rows = await sql()`
		select
			count(*) filter (where c.last_sender_id is distinct from ${me}::uuid
				and c.last_message_at > coalesce(case when c.a_id = ${me} then c.a_read_at else c.b_read_at end, '-infinity'::timestamptz))::int as unread,
			max(c.last_message_at) as latest
		from directory_conversations c
		where c.event_id = ${eventId} and (c.a_id = ${me} or c.b_id = ${me})
			and not exists (
				select 1 from directory_blocks x
				where x.blocker_id = ${me} and x.blocked_id = case when c.a_id = ${me} then c.b_id else c.a_id end
			)`;
	const r = rows[0];
	return { unread: r?.unread ?? 0, latest: r?.latest ? iso(r.latest) : null };
}

export async function unreadCount(eventId: string, me: string): Promise<number> {
	return (await pollState(eventId, me)).unread;
}

let purged = false;

/** 30 days after closing, delete every message (no scheduler: the first request after that does it). */
export async function purgeIfDue(settings: DirectorySettings): Promise<void> {
	if (purged || !purgeDue(new Date(), settings.closesAt)) return;
	purged = true;
	await sql().transaction([
		sql()`delete from directory_messages`,
		sql()`delete from directory_conversations`,
		sql()`delete from push_subscriptions`,
		sql()`delete from directory_email_days`
	]);
	await audit({ actorType: 'system', actor: 'directory', action: 'directory.purge', details: { closesAt: settings.closesAt } });
}

/** The backup email claimed by sendMessage didn't go (cap reached or sending failed). */
export async function releaseEmail(conversationId: string, recipientId: string): Promise<void> {
	await sql()`
		update directory_conversations set
			a_emailed_at = case when a_id = ${recipientId} then null else a_emailed_at end,
			b_emailed_at = case when b_id = ${recipientId} then null else b_emailed_at end
		where id = ${conversationId}`;
}
