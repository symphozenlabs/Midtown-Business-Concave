import { fail } from '@sveltejs/kit';
import { isClosed, safeNext } from '#lib/directory/rules.ts';
import { STALL_DIRECTORY_PATH } from '#lib/stall-directory/rules.ts';
import { background } from '#lib/server/background.ts';
import { allowSignInLink } from '#lib/server/directory/sign-in-limit.ts';
import { getDirectorySettings } from '#lib/server/directory/settings.ts';
import { directoryViewer } from '#lib/server/directory/viewer.ts';
import { sendSignInEmail } from '#lib/server/email.ts';
import { signInLink } from '#lib/server/ops/passes.ts';
import { directoryOrigin } from '#lib/server/site.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { delegateConversations, listExhibitors, stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import { findByEmail } from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

/** Public: anyone sees the stalls and the floor map. A signed-in delegate also gets their messages. */
export const load: PageServerLoad = async (event) => {
	event.depends('stall-directory:list');
	const [exhibitors, messaging] = await Promise.all([listExhibitors(), stallDirectoryReady()]);

	let delegate: { fullName: string } | null = null;
	let conversations: Awaited<ReturnType<typeof delegateConversations>> = [];
	let exhibitor: { businessName: string } | null = null;
	/** The signed-in exhibitor's own stalls: left out of their list, like yourself in the visitors directory. */
	let mine: string[] = [];
	let closed = false;
	if (messaging) {
		const [viewer, signedInExhibitor, settings] = await Promise.all([
			directoryViewer(event.cookies),
			readExhibitor(event.cookies),
			getDirectorySettings()
		]);
		closed = isClosed(new Date(), settings.closesAt);
		if (viewer.state === 'open') {
			delegate = { fullName: viewer.me.fullName };
			conversations = await delegateConversations(viewer.me.id);
		}
		if (signedInExhibitor) {
			exhibitor = { businessName: signedInExhibitor.businessName };
			mine = signedInExhibitor.bookingIds;
		}
	}

	return {
		exhibitors,
		mine,
		messaging,
		closed,
		delegate,
		exhibitor,
		conversations,
		unread: conversations.filter((c) => c.unread).length,
		latest: conversations[0]?.lastAt ?? null
	};
};

export const actions: Actions = {
	/** "Email me my pass link" for delegates: never says whether the address is registered. */
	sendLink: async (event) => {
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '').trim().slice(0, 120);
		const next = safeNext(String(form.get('next') ?? ''));
		if (!/^[^\s@]+@[^\s@]+$/.test(email)) return fail(400, { email, message: 'Enter the email you registered with.' });
		if (!allowSignInLink(event.getClientAddress(), email)) {
			return fail(429, { email, message: 'Too many requests. Try again in a few minutes.' });
		}
		const origin = directoryOrigin(event.url);
		const path = next?.startsWith(STALL_DIRECTORY_PATH) ? next : STALL_DIRECTORY_PATH;
		background(event, async () => {
			const reg = await findByEmail(email);
			if (!reg || reg.status !== 'paid') return;
			const link = await signInLink(reg, origin, path);
			if (link) await sendSignInEmail(reg, link);
		});
		return { sent: true };
	}
};
