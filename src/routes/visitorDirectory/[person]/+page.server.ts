import { error, fail, redirect } from '@sveltejs/kit';
import { BLOCKER_TEXT, MESSAGE_MAX, cleanBody, isDuplicateSend, messageBlocker } from '#lib/directory/rules.ts';
import { background } from '#lib/server/background.ts';
import { loadThread, markRead, messageByKey, messagesIn, sendMessage } from '#lib/server/directory/messages.ts';
import { notifyRecipient } from '#lib/server/directory/notify.ts';
import { block, unblock } from '#lib/server/directory/people.ts';
import { directoryViewer } from '#lib/server/directory/viewer.ts';
import { uniqueViolation } from '#lib/server/db.ts';
import { allow } from '#lib/server/rate-limit.ts';
import { directoryOrigin } from '#lib/server/site.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const prerender = false;

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const load: PageServerLoad = async ({ cookies, params }) => {
	const viewer = await directoryViewer(cookies);
	if (viewer.state !== 'open') return { state: viewer.state };
	if (!isUuid(params.person) || params.person === viewer.me.id) error(404, 'Not found');

	const thread = await loadThread(viewer.eventId, viewer.me, params.person, false);
	if (!thread.person) error(404, 'Not found');
	const messages = thread.conversationId ? await messagesIn(thread.conversationId, viewer.me.id) : [];
	if (thread.conversationId) await markRead(thread.conversationId, viewer.me.id);
	return {
		state: viewer.state,
		person: thread.person,
		messages,
		blocker: messageBlocker(thread.facts),
		iBlocked: thread.facts.iBlocked,
		conversationId: thread.conversationId
	};
};

/** The signed-in delegate and the person in the URL, or a failure to return. */
async function parties(event: RequestEvent) {
	const viewer = await directoryViewer(event.cookies);
	if (viewer.state !== 'open') {
		return { failure: fail(409, { message: viewer.state === 'closed' ? BLOCKER_TEXT.closed : 'Sign in again to send messages.' }) };
	}
	const other = event.params.person;
	if (!isUuid(other) || other === viewer.me.id) return { failure: fail(404, { message: 'That person isn’t in the directory.' }) };
	return { viewer, other };
}

export const actions: Actions = {
	send: async (event) => {
		const p = await parties(event);
		if ('failure' in p) return p.failure;
		const { viewer, other } = p;
		if (!allow(`dirsend:${viewer.me.id}`, 20, 60_000)) return fail(429, { message: 'You’re sending quickly. Wait a moment and try again.' });

		const form = await event.request.formData();
		const body = cleanBody(String(form.get('body') ?? ''));
		if (!body) return fail(400, { message: `Write a message of up to ${MESSAGE_MAX} characters.` });
		const rawKey = String(form.get('key') ?? '');
		const key = isUuid(rawKey) ? rawKey.toLowerCase() : null;

		// A resent post (patchy Wi-Fi, a second tap) carries the same draft key: it was
		// already sent, so report success before any limit could refuse it.
		if (key) {
			const already = await messageByKey(viewer.me.id, key);
			if (already) return { sent: true, message: already };
		}

		const thread = await loadThread(viewer.eventId, viewer.me, other, false);
		const blocker = messageBlocker(thread.facts);
		if (blocker) return fail(409, { message: BLOCKER_TEXT[blocker] });
		// Without a key (no JavaScript): the same text again within 10 seconds is a repeat.
		if (!key && isDuplicateSend(thread.myLast, body, new Date())) return { sent: true };

		let sent: Awaited<ReturnType<typeof sendMessage>>;
		try {
			sent = await sendMessage(viewer.eventId, viewer.me.id, other, body, key);
		} catch (e) {
			// Two overlapping posts of one draft: the other one stored it.
			const already = key && uniqueViolation(e) ? await messageByKey(viewer.me.id, key) : null;
			if (already) return { sent: true, message: already };
			throw e;
		}
		const origin = directoryOrigin(event.url);
		background(event, () =>
			notifyRecipient({
				origin,
				sender: viewer.me,
				recipientId: other,
				conversationId: sent.conversationId,
				emailDue: sent.emailDue,
				settings: viewer.settings
			})
		);
		return { sent: true, message: sent.message };
	},

	block: async (event) => {
		const p = await parties(event);
		if ('failure' in p) return p.failure;
		await block(p.viewer.eventId, p.viewer.me.id, p.other);
		redirect(303, '/visitorDirectory?tab=messages');
	},

	unblock: async (event) => {
		const p = await parties(event);
		if ('failure' in p) return p.failure;
		await unblock(p.viewer.eventId, p.viewer.me.id, p.other);
		redirect(303, `/visitorDirectory/${p.other}`);
	}
};
