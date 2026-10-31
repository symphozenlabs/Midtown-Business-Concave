import { fail, redirect } from '@sveltejs/kit';
import { MAX_PRICE, MIN_PRICE, isValidVpa, upiLink, type PaymentSettings } from '#lib/payment.ts';
import {
	listMemberships,
	listStalls,
	readMembership,
	readStall,
	removeItem,
	saveMembership,
	saveStall,
	setActive
} from '#lib/server/catalog.ts';
import { getPaymentSettings, isStoreAvailable, savePaymentSettings } from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** Stand-in for the registration number; each delegate's link carries their own. */
const SAMPLE_CODE = 'MBC-XXXXXX';

/** The payment link exactly as the registration form will build it. */
const linkFor = (p: PaymentSettings) => upiLink(p, p.priceRupees, SAMPLE_CODE);

const TABS = ['pass', 'stalls', 'memberships'] as const;
type PaymentsTab = (typeof TABS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.admin) redirect(303, '/login');
	const requested = url.searchParams.get('tab');
	const tab: PaymentsTab = TABS.find((t) => t === requested) ?? 'pass';
	if (!isStoreAvailable) return { available: false as const, tab };
	const [payment, stalls, memberships] = await Promise.all([getPaymentSettings(), listStalls(), listMemberships()]);
	return { available: true as const, tab, payment, link: linkFor(payment), stalls, memberships };
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const kindOf = (form: FormData) => (text(form, 'kind') === 'membership' ? 'membership' : 'stall');
const scopeOf = (kind: 'stall' | 'membership') => (kind === 'stall' ? 'stalls' : 'memberships');

export const actions: Actions = {
	/** Saves the delegate fee and UPI payee together and returns the new payment link. */
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

	/** Adds a stall type, or updates it when the form carries its id. */
	saveStall: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'stalls', message: 'Sign in again.' });
		const form = await request.formData();
		const { stall, errors } = readStall(form, await listStalls());
		if (Object.keys(errors).length) return fail(400, { scope: 'stalls', dialog: true, errors, message: 'Check the highlighted fields.' });
		const isNew = !text(form, 'id');
		await saveStall(stall, locals.admin.email);
		return { scope: 'stalls', success: isNew ? `Added the ${stall.name} stall.` : `Saved ${stall.name}.` };
	},

	saveMembership: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { scope: 'memberships', message: 'Sign in again.' });
		const form = await request.formData();
		const { plan, errors } = readMembership(form, await listMemberships());
		if (Object.keys(errors).length) {
			return fail(400, { scope: 'memberships', dialog: true, errors, message: 'Check the highlighted fields.' });
		}
		const isNew = !text(form, 'id');
		await saveMembership(plan, locals.admin.email);
		return { scope: 'memberships', success: isNew ? `Added the ${plan.name} membership.` : `Saved ${plan.name}.` };
	},

	/** Open or close sales of a stall type or membership. */
	toggle: async ({ request, locals }) => {
		const form = await request.formData();
		const kind = kindOf(form);
		if (!locals.admin) return fail(401, { scope: scopeOf(kind), message: 'Sign in again.' });
		const active = text(form, 'active') === 'true';
		await setActive(kind, text(form, 'id'), active, locals.admin.email);
		return { scope: scopeOf(kind), success: active ? 'Open for sale again.' : 'Closed: it no longer appears for sale.' };
	},

	remove: async ({ request, locals }) => {
		const form = await request.formData();
		const kind = kindOf(form);
		if (!locals.admin) return fail(401, { scope: scopeOf(kind), message: 'Sign in again.' });
		await removeItem(kind, text(form, 'id'), locals.admin.email);
		return { scope: scopeOf(kind), success: kind === 'stall' ? 'Stall type removed.' : 'Membership removed.' };
	}
};
