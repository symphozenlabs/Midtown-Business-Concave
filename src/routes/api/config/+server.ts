import { json } from '@sveltejs/kit';
import { DEFAULT_EVENT } from '#lib/event-settings.ts';
import { DEFAULT_PAYMENT } from '#lib/payment.ts';
import { getEventSettings, getPaymentSettings, isStoreAvailable } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Current ticket price and event schedule, so the prerendered page can show them. */
export const GET: RequestHandler = async () => {
	const [payment, event] = isStoreAvailable
		? await Promise.all([getPaymentSettings(), getEventSettings()])
		: [DEFAULT_PAYMENT, DEFAULT_EVENT];
	return json({ priceRupees: payment.priceRupees, event });
};
