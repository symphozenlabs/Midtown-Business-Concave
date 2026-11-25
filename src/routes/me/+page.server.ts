import { TICKET_LABEL } from '#lib/payment.ts';
import { fail, redirect } from '@sveltejs/kit';
import { getRegistration } from '#lib/server/store.ts';
import { publicOrigin } from '#lib/server/site.ts';
import { certificateFor } from '#lib/server/ops/certificates.ts';
import { unreadCount } from '#lib/server/directory/messages.ts';
import { listBlocked, memberFlags, setOwnFlags, unblock } from '#lib/server/directory/people.ts';
import { directoryReady } from '#lib/server/directory/settings.ts';
import { opsReady } from '#lib/server/ops/event.ts';
import { connectionState, consent, listConnections, withdraw } from '#lib/server/ops/networking.ts';
import { PARTICIPANT_COOKIE, ensurePass, passUrl, readParticipant } from '#lib/server/ops/passes.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export const load: PageServerLoad = async ({ cookies, url }) => {
	const me = (await opsReady()) ? await readParticipant(cookies.get(PARTICIPANT_COOKIE)) : null;
	if (!me) return { signedIn: false as const, invalidLink: url.searchParams.get('link') === 'invalid' };

	const reg = await getRegistration(me.registrationId);
	if (!reg) {
		cookies.delete(PARTICIPANT_COOKIE, { path: '/' });
		return { signedIn: false as const, invalidLink: true };
	}
	const [pass, connections, certificate, directory] = await Promise.all([
		ensurePass(me.eventId, reg.id),
		listConnections(me.eventId, reg.id),
		certificateFor(me.eventId, reg.id),
		directoryFor(me.eventId, reg.id, reg.status === 'paid')
	]);
	return {
		signedIn: true as const,
		me: { name: reg.fullName, code: reg.code, ticket: TICKET_LABEL[reg.ticketType], designation: reg.designation, company: reg.companyName, paid: reg.status === 'paid' },
		passUrl: passUrl(publicOrigin(url), pass.token),
		connections,
		certificate: certificate && !certificate.revokedAt ? certificate.number : null,
		directory
	};
};

/** The visitors directory card: unread count, the delegate's switches and whom they blocked. */
async function directoryFor(eventId: string, registrationId: string, paid: boolean) {
	if (!paid || !(await directoryReady())) return null;
	const [unread, flags, blocked] = await Promise.all([
		unreadCount(eventId, registrationId),
		memberFlags(registrationId),
		listBlocked(registrationId)
	]);
	return { unread, flags, blocked };
}

async function participant(cookies: Parameters<PageServerLoad>[0]['cookies']) {
	const me = await readParticipant(cookies.get(PARTICIPANT_COOKIE));
	if (!me) redirect(303, '/me');
	return me;
}

export const actions: Actions = {
	/** Accept a request or introduction. */
	accept: async ({ request, cookies }) => {
		const me = await participant(cookies);
		const other = String((await request.formData()).get('other') ?? '');
		if (!isUuid(other)) return fail(400, { message: 'Choose a connection.' });
		if (!allow(`connect:${me.registrationId}`, 60, 60_000)) return fail(429, { message: 'Too many changes. Wait a moment.' });
		const state = await connectionState(me.eventId, me.registrationId, other);
		if (state !== 'incoming' && state !== 'declined') return fail(409, { message: 'There is no request to accept.' });
		await consent(me.eventId, me.registrationId, other);
		return { success: 'Connected. You can now see each other’s contact details.' };
	},

	/** Decline a request, or withdraw consent from a connection. */
	withdraw: async ({ request, cookies }) => {
		const me = await participant(cookies);
		const other = String((await request.formData()).get('other') ?? '');
		if (!isUuid(other)) return fail(400, { message: 'Choose a connection.' });
		await withdraw(me.eventId, me.registrationId, other);
		return { success: 'Done. Your contact details are no longer shared with them.' };
	},

	/** "Show me in the directory" and "Let delegates message me". An organiser override keeps the delegate's own value. */
	directorySettings: async ({ request, cookies }) => {
		const me = await participant(cookies);
		if (!(await directoryReady())) return fail(503, { message: 'The visitors directory isn’t open yet.' });
		const form = await request.formData();
		const flags = await memberFlags(me.registrationId);
		await setOwnFlags(me.eventId, me.registrationId, {
			hidden: flags.adminHidden ? flags.hidden : form.get('listed') !== 'on',
			messagesOff: flags.adminMessagesOff ? flags.messagesOff : form.get('messages') !== 'on'
		});
		return { success: 'Saved your visitors directory settings.' };
	},

	unblockPerson: async ({ request, cookies }) => {
		const me = await participant(cookies);
		const other = String((await request.formData()).get('other') ?? '');
		if (!isUuid(other)) return fail(400, { message: 'Choose someone to unblock.' });
		await unblock(me.eventId, me.registrationId, other);
		return { success: 'Unblocked. You can see and message each other again.' };
	},

	signout: async ({ cookies }) => {
		cookies.delete(PARTICIPANT_COOKIE, { path: '/' });
		redirect(303, '/me');
	}
};
