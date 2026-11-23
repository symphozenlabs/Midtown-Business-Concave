import { error, fail, redirect } from '@sveltejs/kit';
import { BLOCKER_TEXT, MESSAGE_MAX, cleanBody, isDuplicateSend, messageBlocker } from '#lib/directory/rules.ts';
import { loadThread, markRead, messagesIn, sendMessage } from '#lib/server/directory/messages.ts';
import { block, unblock } from '#lib/server/directory/people.ts';
import { directoryViewer } from '#lib/server/directory/viewer.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const prerender = false;

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

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

		const body = cleanBody(String((await event.request.formData()).get('body') ?? ''));
		if (!body) return fail(400, { message: `Write a message of up to ${MESSAGE_MAX} characters.` });

		const thread = await loadThread(viewer.eventId, viewer.me, other, false);
		const blocker = messageBlocker(thread.facts);
		if (blocker) return fail(409, { message: BLOCKER_TEXT[blocker] });
		// A double tap or a retried post on patchy Wi-Fi: the message is already there.
		if (isDuplicateSend(thread.myLast, body, new Date())) return { sent: true };

		const sent = await sendMessage(viewer.eventId, viewer.me.id, other, body);
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
