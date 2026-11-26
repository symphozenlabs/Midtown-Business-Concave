import { error, fail } from '@sveltejs/kit';
import { MESSAGE_MAX, cleanBody, isClosed } from '#lib/directory/rules.ts';
import { STALL_BLOCKER_TEXT, delegateBlocker } from '#lib/stall-directory/rules.ts';
import { background } from '#lib/server/background.ts';
import { uniqueViolation } from '#lib/server/db.ts';
import { directoryViewer } from '#lib/server/directory/viewer.ts';
import { allow } from '#lib/server/rate-limit.ts';
import { directoryOrigin } from '#lib/server/site.ts';
import { notifyExhibitor } from '#lib/server/stall-directory/notify.ts';
import {
	delegateThread,
	getExhibitor,
	listExhibitors,
	markStallRead,
	sendStallMessage,
	stallDirectoryReady,
	stallMessageByKey,
	stallMessagesIn
} from '#lib/server/stall-directory/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** A stall in the visitors directory: who they are, where they are, and the delegate's conversation with them. */
export const load: PageServerLoad = async ({ cookies, params }) => {
	if (!isUuid(params.stall)) error(404, 'Not found');
	// Only signed-in delegates see the stalls, like the people in the directory.
	const viewer = await directoryViewer(cookies);
	if (viewer.state !== 'open') return { state: viewer.state };

	const [exhibitor, exhibitors, messaging] = await Promise.all([getExhibitor(params.stall), listExhibitors(), stallDirectoryReady()]);
	if (!exhibitor) error(404, 'Not found');
	const base = { state: viewer.state, exhibitor, exhibitors };
	if (!messaging) return { ...base, chat: null };

	const thread = await delegateThread(viewer.me, exhibitor.id, false);
	const messages = thread.conversationId ? await stallMessagesIn(thread.conversationId, 'delegate', { registrationId: viewer.me.id }) : [];
	if (thread.conversationId) await markStallRead(thread.conversationId, 'delegate');
	return { ...base, chat: { conversationId: thread.conversationId, messages, blocker: delegateBlocker(thread.facts) } };
};

export const actions: Actions = {
	send: async (event) => {
		const bookingId = event.params.stall;
		if (!isUuid(bookingId) || !(await stallDirectoryReady())) return fail(404, { message: 'That stall isn’t in the directory.' });
		const viewer = await directoryViewer(event.cookies);
		if (viewer.state !== 'open') {
			return fail(409, { message: viewer.state === 'closed' ? STALL_BLOCKER_TEXT.closed : 'Sign in again to send messages.' });
		}
		if (isClosed(new Date(), viewer.settings.closesAt)) return fail(409, { message: STALL_BLOCKER_TEXT.closed });
		if (!allow(`stallsend:${viewer.me.id}`, 20, 60_000)) return fail(429, { message: 'You’re sending quickly. Wait a moment and try again.' });

		const form = await event.request.formData();
		const body = cleanBody(String(form.get('body') ?? ''));
		if (!body) return fail(400, { message: `Write a message of up to ${MESSAGE_MAX} characters.` });
		const rawKey = String(form.get('key') ?? '');
		const key = isUuid(rawKey) ? rawKey.toLowerCase() : null;
		if (key) {
			const already = await stallMessageByKey(key, 'delegate', { registrationId: viewer.me.id });
			if (already) return { sent: true, message: already };
		}

		const exhibitor = await getExhibitor(bookingId);
		if (!exhibitor) return fail(404, { message: 'That stall isn’t in the directory.' });
		const thread = await delegateThread(viewer.me, bookingId, false);
		const blocker = delegateBlocker(thread.facts);
		if (blocker) return fail(409, { message: STALL_BLOCKER_TEXT[blocker] });

		let sent: Awaited<ReturnType<typeof sendStallMessage>>;
		try {
			sent = await sendStallMessage({ bookingId, registrationId: viewer.me.id, sender: 'delegate', body, clientKey: key });
		} catch (e) {
			const already = key && uniqueViolation(e) ? await stallMessageByKey(key, 'delegate', { registrationId: viewer.me.id }) : null;
			if (already) return { sent: true, message: already };
			throw e;
		}
		const origin = directoryOrigin(event.url);
		background(event, () =>
			notifyExhibitor({
				origin,
				from: { fullName: viewer.me.fullName, designation: viewer.me.designation, companyName: viewer.me.companyName },
				bookingId,
				conversationId: sent.conversationId,
				emailDue: sent.emailDue,
				settings: viewer.settings
			})
		);
		return { sent: true, message: sent.message };
	}
};
