import { fail, redirect } from '@sveltejs/kit';
import { SPONSOR_STATUSES, type SponsorStatus } from '#lib/stall-booking.ts';
import { isBookingStoreAvailable, listSponsorRequests, updateSponsorRequest } from '#lib/server/bookings.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	if (!isBookingStoreAvailable) return { available: false as const };
	return { available: true as const, requests: await listSponsorRequests() };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '') as SponsorStatus;
		if (!SPONSOR_STATUSES.includes(status)) return fail(400, { message: 'Choose a status.' });
		const note = String(form.get('note') ?? '').trim().replace(/\s+/g, ' ').slice(0, 300) || null;
		const ok = await updateSponsorRequest(id, status, note, locals.admin.email);
		if (!ok) return fail(404, { message: 'That request no longer exists.' });
		return { success: 'Saved.' };
	}
};
