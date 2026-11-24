import { error, fail, redirect } from '@sveltejs/kit';
import { MESSAGE_MAX, cleanBody, isClosed } from '#lib/directory/rules.ts';
import { STALL_BLOCKER_TEXT, exhibitorBlocker } from '#lib/stall-directory/rules.ts';
import { background } from '#lib/server/background.ts';
import { uniqueViolation } from '#lib/server/db.ts';
import { getDirectorySettings } from '#lib/server/directory/settings.ts';
import { allow } from '#lib/server/rate-limit.ts';
import { directoryOrigin } from '#lib/server/site.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { notifyDelegate } from '#lib/server/stall-directory/notify.ts';
import {
	exhibitorThread,
	markStallRead,
	sendStallMessage,
	setExhibitorBlocked,
	stallDirectoryReady,
	stallMessageByKey,
	stallMessagesIn
} from '#lib/server/stall-directory/store.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const prerender = false;

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const load: PageServerLoad = async ({ cookies, params }) => {
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) redirect(303, `/login?next=${encodeURIComponent(`/stallDirectory/exhibitor/messages/${params.conversation}`)}`);
	if (!isUuid(params.conversation) || !(await stallDirectoryReady())) error(404, 'Not found');
	const settings = await getDirectorySettings();
	const thread = await exhibitorThread(exhibitor.bookingIds, params.conversation, isClosed(new Date(), settings.closesAt));
	if (!thread) error(404, 'Not found');
	const messages = await stallMessagesIn(thread.conversationId, 'exhibitor', { bookingIds: exhibitor.bookingIds });
	await markStallRead(thread.conversationId, 'exhibitor');
	return {
		conversationId: thread.conversationId,
		delegate: thread.delegate,
		stall: thread.stall,
		messages,
		blocker: exhibitorBlocker(thread.facts),
		iBlocked: thread.facts.iBlocked
	};
};

async function context(event: RequestEvent) {
	const exhibitor = await readExhibitor(event.cookies);
	if (!exhibitor) return { failure: fail(401, { message: 'Sign in again to reply.' }) };
	if (!isUuid(event.params.conversation) || !(await stallDirectoryReady())) return { failure: fail(404, { message: 'That conversation no longer exists.' }) };
	const settings = await getDirectorySettings();
	const thread = await exhibitorThread(exhibitor.bookingIds, event.params.conversation, isClosed(new Date(), settings.closesAt));
	if (!thread) return { failure: fail(404, { message: 'That conversation no longer exists.' }) };
	return { exhibitor, settings, thread };
}

export const actions: Actions = {
	send: async (event) => {
		const c = await context(event);
		if ('failure' in c) return c.failure;
		const { exhibitor, settings, thread } = c;
		if (!allow(`stallreply:${exhibitor.bookingId}`, 40, 60_000)) return fail(429, { message: 'You’re sending quickly. Wait a moment and try again.' });

		const form = await event.request.formData();
		const body = cleanBody(String(form.get('body') ?? ''));
		if (!body) return fail(400, { message: `Write a message of up to ${MESSAGE_MAX} characters.` });
		const rawKey = String(form.get('key') ?? '');
		const key = isUuid(rawKey) ? rawKey.toLowerCase() : null;
		if (key) {
			const already = await stallMessageByKey(key, 'exhibitor', { bookingIds: exhibitor.bookingIds });
			if (already) return { sent: true, message: already };
		}
		const blocker = exhibitorBlocker(thread.facts);
		if (blocker) return fail(409, { message: STALL_BLOCKER_TEXT[blocker] });

		let sent: Awaited<ReturnType<typeof sendStallMessage>>;
		try {
			sent = await sendStallMessage({ bookingId: thread.bookingId, registrationId: thread.delegate.id, sender: 'exhibitor', body, clientKey: key });
		} catch (e) {
			const already = key && uniqueViolation(e) ? await stallMessageByKey(key, 'exhibitor', { bookingIds: exhibitor.bookingIds }) : null;
			if (already) return { sent: true, message: already };
			throw e;
		}
		const origin = directoryOrigin(event.url);
		background(event, () =>
			notifyDelegate({
				origin,
				stall: thread.stall,
				bookingId: thread.bookingId,
				registrationId: thread.delegate.id,
				conversationId: sent.conversationId,
				emailDue: sent.emailDue,
				settings
			})
		);
		return { sent: true, message: sent.message };
	},

	block: async (event) => {
		const c = await context(event);
		if ('failure' in c) return c.failure;
		await setExhibitorBlocked(c.thread.conversationId, c.exhibitor.bookingIds, true, c.exhibitor.email);
		redirect(303, '/stallDirectory/exhibitor');
	},

	unblock: async (event) => {
		const c = await context(event);
		if ('failure' in c) return c.failure;
		await setExhibitorBlocked(c.thread.conversationId, c.exhibitor.bookingIds, false, c.exhibitor.email);
		redirect(303, `/stallDirectory/exhibitor/messages/${c.thread.conversationId}`);
	}
};
