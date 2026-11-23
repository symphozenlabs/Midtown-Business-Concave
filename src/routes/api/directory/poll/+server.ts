import { json } from '@sveltejs/kit';
import { markRead, messagesIn, pollState } from '#lib/server/directory/messages.ts';
import { directorySession } from '#lib/server/directory/viewer.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const isUuid = (v: string | null): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

/**
 * "Anything new?" for the directory pages. With ?conversation=<id>&after=<message id>
 * it also returns that conversation's new messages and marks them read.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
	const session = await directorySession(cookies);
	if (!session) return json({ message: 'Sign in again.' }, { status: 401 });
	const conversation = url.searchParams.get('conversation');
	if (!isUuid(conversation)) return json(await pollState(session.eventId, session.registrationId));

	const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
	const messages = await messagesIn(conversation, session.registrationId, after);
	if (messages.length) await markRead(conversation, session.registrationId);
	return json({ ...(await pollState(session.eventId, session.registrationId)), messages });
};
