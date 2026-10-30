import { json } from '@sveltejs/kit';
import { DEFAULT_PAYMENT } from '#lib/payment.ts';
import { getPaymentSettings, isStoreAvailable } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Current ticket price, so the form can show it before registering. */
export const GET: RequestHandler = async () => {
	const settings = isStoreAvailable ? await getPaymentSettings() : DEFAULT_PAYMENT;
	return json({ priceRupees: settings.priceRupees });
};
