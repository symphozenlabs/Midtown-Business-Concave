import { fail, redirect } from '@sveltejs/kit';
import { MAX_PRICE, MIN_PRICE, isValidVpa } from '#lib/payment.ts';
import { SESSION_COOKIE } from '#lib/server/auth.ts';
import { isDatabaseConfigured } from '#lib/server/db.ts';
import { EmailError, isEmailConfigured, sendRejectionEmail, sendTicketEmail } from '#lib/server/email.ts';
import { getObject, isR2Configured } from '#lib/server/r2.ts';
import {
	STATUSES,
	getPaymentSettings,
	getRegistration,
	getStats,
	isStoreAvailable,
	listRegistrations,
	markPaid,
	markRejected,
	markTicketEmailed,
	savePaymentSettings,
	type Registration,
	type Status
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

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

	const [registrations, settings] = await Promise.all([listRegistrations({ status, q }), getPaymentSettings()]);
	return { configured, available: true as const, stats, filter: { status, q }, registrations, settings };
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

export const actions: Actions = {
	markPaid: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = String((await request.formData()).get('id') ?? '');
		const reg = await markPaid(id, locals.admin.email);
		if (!reg) return fail(409, { id, message: 'This registration was already marked as paid, or no longer exists.' });
		try {
			await emailTicket(reg);
		} catch (e) {
			return fail(502, { id, message: `Marked as paid, but the ticket email failed: ${emailFailure(e)} Use “Resend ticket” to try again.` });
		}
		return { id, success: `Marked ${reg.fullName} as paid and emailed the ticket to ${reg.email}.` };
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
		return { id, success: `Sent the ticket to ${reg.email} again.` };
	},

	savePayment: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const price = Number(form.get('priceRupees'));
		const vpa = String(form.get('vpa') ?? '').trim();
		const payeeName = String(form.get('payeeName') ?? '').trim().replace(/\s+/g, ' ');

		const errors: Record<string, string> = {};
		if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE || Math.round(price * 100) !== price * 100) {
			errors.priceRupees = `Enter an amount between ₹${MIN_PRICE} and ₹${MAX_PRICE.toLocaleString('en-IN')}.`;
		}
		if (!isValidVpa(vpa)) errors.vpa = 'Enter a UPI ID like name@okbank.';
		if (payeeName.length < 2 || payeeName.length > 60) errors.payeeName = 'Enter the name shown on the UPI account.';
		if (Object.keys(errors).length) return fail(400, { settingsErrors: errors, message: 'Check the payment settings.' });

		await savePaymentSettings({ priceRupees: price, vpa, payeeName }, locals.admin.email);
		return { settingsSaved: true, success: 'Payment settings saved. New registrations use them straight away.' };
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/admin/login');
	}
};
