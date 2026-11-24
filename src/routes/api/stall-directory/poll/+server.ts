import { json } from '@sveltejs/kit';
import { directorySession } from '#lib/server/directory/viewer.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { markStallRead, stallDirectoryReady, stallMessagesIn, stallPollState, type Side } from '#lib/server/stall-directory/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const isUuid = (v: string | null): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

/**
 * "Anything new?" for the stall directory. ?as=delegate (the pass cookie) or
 * ?as=exhibitor (the stall login). With ?conversation=<id>&after=<message id> it also
 * returns that conversation's new messages and marks them read.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!(await stallDirectoryReady())) return json({ message: 'Not available.' }, { status: 503 });
	const side: Side = url.searchParams.get('as') === 'exhibitor' ? 'exhibitor' : 'delegate';
	let who: { registrationId?: string; bookingIds?: string[] };
	if (side === 'delegate') {
		const session = await directorySession(cookies);
		if (!session) return json({ message: 'Sign in again.' }, { status: 401 });
		who = { registrationId: session.registrationId };
	} else {
		const exhibitor = await readExhibitor(cookies);
		if (!exhibitor) return json({ message: 'Sign in again.' }, { status: 401 });
		who = { bookingIds: exhibitor.bookingIds };
	}

	const conversation = url.searchParams.get('conversation');
	if (!isUuid(conversation)) return json(await stallPollState(side, who));
	const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
	const messages = await stallMessagesIn(conversation, side, who, after);
	if (messages.length) await markStallRead(conversation, side);
	return json({ ...(await stallPollState(side, who)), messages });
};
