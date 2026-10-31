import { fail, redirect } from '@sveltejs/kit';
import { fromEventFormFields } from '#lib/event-settings.ts';
import { MAX_PRICE, MIN_PRICE, isValidVpa, upiLink, type PaymentSettings } from '#lib/payment.ts';
import {
	getEventSettings,
	getPaymentSettings,
	isStoreAvailable,
	saveEventSettings,
	savePaymentSettings
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** Stand-in for the registration number; each delegate's link carries their own. */
const SAMPLE_CODE = 'MBC-XXXXXX';

/** The payment link exactly as the registration form will build it. */
const linkFor = (p: PaymentSettings) => upiLink(p, p.priceRupees, SAMPLE_CODE);

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/admin/login');
	if (!isStoreAvailable) return { available: false as const };
	const [payment, event] = await Promise.all([getPaymentSettings(), getEventSettings()]);
	return { available: true as const, payment, event, link: linkFor(payment) };
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export const actions: Actions = {
	/** Saves the fee and UPI payee together and returns the new payment link. */
	generateQr: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'qr', message: 'Sign in again.' });
		const form = await request.formData();
		const price = Number(text(form, 'priceRupees'));
		const vpa = text(form, 'vpa');
		const payeeName = text(form, 'payeeName').replace(/\s+/g, ' ');

		const errors: Record<string, string> = {};
		if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE || Math.round(price * 100) !== price * 100) {
			errors.priceRupees = `Enter an amount between ₹${MIN_PRICE} and ₹${MAX_PRICE.toLocaleString('en-IN')}.`;
		}
		if (!isValidVpa(vpa)) errors.vpa = 'Enter a UPI ID like name@okbank.';
		if (payeeName.length < 2 || payeeName.length > 60) errors.payeeName = 'Enter the name shown on the UPI account.';
		if (Object.keys(errors).length) return fail(400, { scope: 'qr', errors, message: 'Check the payment details.' });

		const payment: PaymentSettings = { priceRupees: price, vpa, payeeName };
		const repriced = await savePaymentSettings(payment, locals.admin.email);
		const moved =
			repriced === 0 ? '' : ` ${repriced} unpaid registration${repriced === 1 ? '' : 's'} moved to the new amount.`;
		return {
			scope: 'qr',
			link: linkFor(payment),
			success: `New QR generated. The registration form and every open payment page now use this amount and UPI ID.${moved}`
		};
	},

	/** When the event happens, in Indian time. */
	saveEvent: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'event', message: 'Sign in again.' });
		const form = await request.formData();
		const result = fromEventFormFields({ date: text(form, 'date'), start: text(form, 'start'), end: text(form, 'end') });
		if (!result.ok) return fail(400, { scope: 'event', errors: result.errors, message: 'Check the date and time.' });
		await saveEventSettings(result.settings, locals.admin.email);
		return { scope: 'event', success: 'Event date and time saved. The site, countdown and emails use them now.' };
	}
};
