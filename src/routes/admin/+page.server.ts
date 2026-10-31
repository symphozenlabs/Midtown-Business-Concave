import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_COOKIE_PATH } from '#lib/server/auth.ts';
import { isDatabaseConfigured } from '#lib/server/db.ts';
import {
	EmailError,
	emailStatusFor,
	fetchEmailEvent,
	isEmailConfigured,
	sendPassEmail,
	sendRejectionEmail,
	sendTicketEmail
} from '#lib/server/email.ts';
import { getObject, isR2Configured } from '#lib/server/r2.ts';
import { cardBacksToMake, markPassEmailed, passEmailFor, passesToSend } from '#lib/server/ops/passes.ts';
import {
	EMAIL_FILTERS,
	STATUSES,
	getRegistration,
	getStats,
	isStoreAvailable,
	listRegistrations,
	listEmailsToCheck,
	listFailedTickets,
	listUnsentTickets,
	markManyPaid,
	markPaid,
	markRejected,
	markTicketEmailed,
	recordEmailEvent,
	type EmailFilter,
	type Registration,
	type Status
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Tickets sent per click. Resend allows about 2 requests a second and a Worker has a
 * subrequest budget, so a large queue goes out over a few clicks.
 */
const SEND_BATCH = 25;
const SEND_GAP_MS = 550;
/** Delivery checks per click; they share the same Resend rate limit. */
const CHECK_BATCH = 25;

/** ID card backs the organiser's browser should draw now, with what each needs. Never blocks the page. */
async function cardBackJobs(origin: string) {
	try {
		const paid = await listRegistrations({ status: 'paid', q: '' });
		const jobs = await cardBacksToMake(paid, origin);
		const byId = new Map(paid.map((r) => [r.id, r]));
		return jobs.map((j) => {
			const r = byId.get(j.id)!;
			return { ...j, name: r.fullName, title: r.designation, company: r.companyName, code: r.code, photoKey: r.photoKey };
		});
	} catch (e) {
		console.error('[admin] could not list ID card backs to make', e);
		return [];
	}
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.admin) redirect(303, '/login');
	const configured = { database: isDatabaseConfigured, storage: isR2Configured, email: isEmailConfigured };
	if (!isStoreAvailable) {
		return { configured, available: false as const };
	}

	const stats = await getStats();
	const requested = url.searchParams.get('status');
	const status: Status | 'all' =
		requested === 'all' || STATUSES.includes(requested as Status)
			? (requested as Status | 'all')
			: stats.counts.payment_submitted > 0
				? 'payment_submitted'
				: 'all';
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	const requestedEmail = url.searchParams.get('email') as EmailFilter | null;
	const email: EmailFilter = requestedEmail && EMAIL_FILTERS.includes(requestedEmail) ? requestedEmail : 'all';

	const [registrations, passes, cardBacks] = await Promise.all([
		listRegistrations({ status, q, email }),
		passesToSend(1),
		cardBackJobs(url.origin)
	]);
	return {
		configured,
		available: true as const,
		stats,
		passesToSend: passes.total,
		filter: { status, q, email },
		registrations,
		cardBacks
	};
};

/** The pass is attached when event operations are set up; the ticket goes out either way. */
async function passFor(reg: Registration, origin: string) {
	try {
		return await passEmailFor(reg, origin);
	} catch (e) {
		console.error('[admin] could not attach the event pass', e);
		return null;
	}
}

/** Front (the poster) and back (QR and details) of the ID card, as stored. */
async function cardImages(reg: Registration) {
	const [front, back] = await Promise.all([
		reg.posterKey ? getObject(reg.posterKey) : null,
		reg.ticketBackKey ? getObject(reg.ticketBackKey) : null
	]);
	return { front: front?.body ?? null, back: back?.body ?? null };
}

async function emailTicket(reg: Registration, origin: string) {
	const [card, pass] = await Promise.all([cardImages(reg), passFor(reg, origin)]);
	const emailId = await sendTicketEmail(reg, card.front, pass, card.back);
	await markTicketEmailed(reg.id, emailId);
	if (pass) await markPassEmailed(reg.id);
}

const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

/** Sends tickets one by one within Resend's rate limit; returns who failed. */
async function sendAll(queue: Registration[], origin: string) {
	let sent = 0;
	const failed: string[] = [];
	for (const [i, reg] of queue.entries()) {
		if (i > 0) await pause();
		try {
			await emailTicket(reg, origin);
			sent++;
		} catch (e) {
			failed.push(`${reg.fullName} (${emailFailure(e)})`);
		}
	}
	return { sent, failed };
}

function emailFailure(e: unknown) {
	console.error('[admin] email failed', e);
	return e instanceof EmailError ? e.message : 'The email service did not respond.';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const actions: Actions = {
	/** One click from the table. The ticket email waits in the send queue. */
	markPaid: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = String((await request.formData()).get('id') ?? '');
		const reg = await markPaid(id, locals.admin.email);
		if (!reg) return fail(409, { id, message: 'This registration was already marked as paid, or no longer exists.' });
		return { id, success: `Marked ${reg.fullName} as paid. Their ticket is waiting in the email queue.` };
	},

	markPaidMany: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const ids = (await request.formData()).getAll('ids').map(String).slice(0, 500);
		if (!ids.length) return fail(400, { message: 'Select at least one registration.' });
		const changed = await markManyPaid(ids, locals.admin.email);
		if (!changed.length) return fail(409, { message: 'The selected registrations were already paid.' });
		return {
			bulk: true,
			success: `Marked ${plural(changed.length, 'registration')} as paid. Their tickets are waiting in the email queue.`
		};
	},

	/** Emails every paid delegate who has not received their ticket yet. */
	sendTickets: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listUnsentTickets(SEND_BATCH);
		if (!queue.length) return { success: 'Every paid delegate already has their ticket.' };

		const { sent, failed } = await sendAll(queue, url.origin);
		const { ticketsToSend: left } = await getStats();
		const parts = [`Sent ${plural(sent, 'ticket')}.`];
		if (left > 0) parts.push(`${plural(left, 'ticket')} still waiting: click Send again to continue.`);
		if (failed.length) {
			return fail(502, { message: `${parts.join(' ')} Failed: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}` });
		}
		return { success: parts.join(' ') };
	},

	/** Asks Resend whether sent tickets arrived, bounced or are still on their way. */
	checkDelivery: async ({ locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listEmailsToCheck(CHECK_BATCH);
		if (!queue.length) return { quiet: true, success: 'Every sent ticket has a final delivery status.' };

		const tally = { delivered: 0, failed: 0, sent: 0 };
		for (const [i, reg] of queue.entries()) {
			if (i > 0) await pause();
			try {
				const event = await fetchEmailEvent(reg.ticketEmailId!);
				const status = emailStatusFor(event);
				await recordEmailEvent(reg.id, event, status);
				tally[status]++;
			} catch (e) {
				// A key without Full access fails every lookup: stop and say so once.
				return fail(502, { message: `Could not check delivery: ${emailFailure(e)}` });
			}
		}
		const parts = [`Checked ${plural(queue.length, 'ticket email')}: ${tally.delivered} delivered`];
		if (tally.failed) parts.push(`${tally.failed} failed`);
		if (tally.sent) parts.push(`${tally.sent} still on the way`);
		return { quiet: true, success: `${parts.join(', ')}.` };
	},

	/** Sends the ticket again to everyone whose last ticket email bounced or failed. */
	resendFailed: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listFailedTickets(SEND_BATCH);
		if (!queue.length) return { success: 'No ticket emails have failed.' };
		const { sent, failed } = await sendAll(queue, url.origin);
		const { email } = await getStats();
		const parts = [`Resent ${plural(sent, 'ticket')}. Check delivery again in a minute.`];
		if (email.failed > 0) parts.push(`${plural(email.failed, 'failed email')} left: click again to continue.`);
		if (failed.length) {
			return fail(502, { message: `${parts.join(' ')} Failed: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}` });
		}
		return { success: parts.join(' ') };
	},

	reject: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const reason = String(form.get('reason') ?? '').trim().slice(0, 300);
		const reg = await markRejected(id, locals.admin.email, reason);
		if (!reg) return fail(409, { id, message: 'Paid registrations cannot be rejected.' });
		try {
			await sendRejectionEmail(reg, reason);
		} catch (e) {
			return fail(502, { id, message: `Rejected, but the email to the delegate failed: ${emailFailure(e)}` });
		}
		return { id, success: `Rejected the payment from ${reg.fullName} and let them know by email.` };
	},

	/** Emails the QR pass to delegates whose ticket went out before passes existed. */
	sendPasses: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const { ids } = await passesToSend(SEND_BATCH);
		if (!ids.length) return { success: 'Every delegate with a ticket has their event pass.' };
		let sent = 0;
		const failed: string[] = [];
		for (const [i, id] of ids.entries()) {
			if (i > 0) await pause();
			const reg = await getRegistration(id);
			if (!reg) continue;
			try {
				const pass = await passEmailFor(reg, url.origin);
				if (!pass) return fail(503, { message: 'Event passes need DATABASE_URL and PASS_SECRET.' });
				await sendPassEmail(reg, pass, (await cardImages(reg)).back);
				await markPassEmailed(reg.id);
				sent++;
			} catch (e) {
				failed.push(`${reg.fullName} (${emailFailure(e)})`);
			}
		}
		const { total: left } = await passesToSend(1);
		const parts = [`Sent ${plural(sent, 'event pass', 'event passes')}.`];
		if (left > 0) parts.push(`${plural(left, 'pass', 'passes')} still waiting: click again to continue.`);
		if (failed.length) return fail(502, { message: `${parts.join(' ')} Failed: ${failed.slice(0, 3).join('; ')}` });
		return { success: parts.join(' ') };
	},

	resend: async ({ request, locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = String((await request.formData()).get('id') ?? '');
		const reg = await getRegistration(id);
		if (!reg || reg.status !== 'paid') return fail(409, { id, message: 'Only paid registrations have a ticket to send.' });
		try {
			await emailTicket(reg, url.origin);
		} catch (e) {
			return fail(502, { id, message: `The ticket email failed: ${emailFailure(e)}` });
		}
		return { id, success: `Sent the ticket to ${reg.email}.` };
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_PATH });
		cookies.delete(SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/login');
	}
};
