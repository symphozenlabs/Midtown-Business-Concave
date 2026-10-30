import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '#lib/server/auth.ts';
import { isDatabaseConfigured } from '#lib/server/db.ts';
import { EmailError, isEmailConfigured, sendRejectionEmail, sendTicketEmail } from '#lib/server/email.ts';
import { getObject, isR2Configured } from '#lib/server/r2.ts';
import {
	STATUSES,
	getRegistration,
	getStats,
	isStoreAvailable,
	listRegistrations,
	listUnsentTickets,
	markManyPaid,
	markPaid,
	markRejected,
	markTicketEmailed,
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

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.admin) redirect(303, '/admin/login');
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

	const registrations = await listRegistrations({ status, q });
	return { configured, available: true as const, stats, filter: { status, q }, registrations };
};

async function emailTicket(reg: Registration) {
	const poster = reg.posterKey ? await getObject(reg.posterKey) : null;
	await sendTicketEmail(reg, poster?.body ?? null);
	await markTicketEmailed(reg.id);
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
	sendTickets: async ({ locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listUnsentTickets(SEND_BATCH);
		if (!queue.length) return { success: 'Every paid delegate already has their ticket.' };

		let sent = 0;
		const failed: string[] = [];
		for (const [i, reg] of queue.entries()) {
			if (i > 0) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
			try {
				await emailTicket(reg);
				sent++;
			} catch (e) {
				failed.push(`${reg.fullName} (${emailFailure(e)})`);
			}
		}

		const { ticketsToSend: left } = await getStats();
		const parts = [`Sent ${plural(sent, 'ticket')}.`];
		if (left > 0) parts.push(`${plural(left, 'ticket')} still waiting: click Send again to continue.`);
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

	resend: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = String((await request.formData()).get('id') ?? '');
		const reg = await getRegistration(id);
		if (!reg || reg.status !== 'paid') return fail(409, { id, message: 'Only paid registrations have a ticket to send.' });
		try {
			await emailTicket(reg);
		} catch (e) {
			return fail(502, { id, message: `The ticket email failed: ${emailFailure(e)}` });
		}
		return { id, success: `Sent the ticket to ${reg.email}.` };
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/admin/login');
	}
};
