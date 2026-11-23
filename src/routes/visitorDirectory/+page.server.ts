import { fail } from '@sveltejs/kit';
import { DIRECTORY_PATH } from '#lib/directory/rules.ts';
import { background } from '#lib/server/background.ts';
import { listConversations } from '#lib/server/directory/messages.ts';
import { listPeople } from '#lib/server/directory/people.ts';
import { allowSignInLink } from '#lib/server/directory/sign-in-limit.ts';
import { directoryViewer } from '#lib/server/directory/viewer.ts';
import { sendSignInEmail } from '#lib/server/email.ts';
import { signInLink } from '#lib/server/ops/passes.ts';
import { publicOrigin } from '#lib/server/site.ts';
import { findByEmail } from '#lib/server/store.ts';
import { isPushConfigured, vapidPublicKey } from '#lib/server/push.ts';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async (event) => {
	event.depends('directory:list');
	const viewer = await directoryViewer(event.cookies);
	if (viewer.state !== 'open') return { state: viewer.state };

	const [people, conversations] = await Promise.all([listPeople(viewer.me.id), listConversations(viewer.eventId, viewer.me.id)]);
	return {
		state: viewer.state,
		me: { id: viewer.me.id, fullName: viewer.me.fullName, flags: viewer.me.flags },
		people,
		conversations,
		unread: conversations.filter((c) => c.unread).length,
		latest: conversations[0]?.lastAt ?? null,
		push: viewer.settings.pushEnabled && isPushConfigured && vapidPublicKey ? { publicKey: vapidPublicKey } : null
	};
};

export const actions: Actions = {
	/** "Email me my pass link": never says whether the address is registered. */
	sendLink: async (event) => {
		const email = String((await event.request.formData()).get('email') ?? '').trim().slice(0, 120);
		if (!/^[^\s@]+@[^\s@]+$/.test(email)) return fail(400, { email, message: 'Enter the email you registered with.' });
		if (!allowSignInLink(event.getClientAddress(), email)) {
			return fail(429, { email, message: 'Too many requests. Try again in a few minutes.' });
		}
		const origin = publicOrigin(event.url);
		// After the response, so the reply takes the same time whether or not the address is registered.
		background(event, async () => {
			const reg = await findByEmail(email);
			if (!reg || reg.status !== 'paid') return;
			const link = await signInLink(reg, origin, DIRECTORY_PATH);
			if (link) await sendSignInEmail(reg, link);
		});
		return { sent: true };
	}
};
