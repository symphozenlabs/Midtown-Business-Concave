import { fail, redirect } from '@sveltejs/kit';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { listLeads, removeLead, saveLeadNote, stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async (event) => {
	event.depends('stall-directory:leads');
	const exhibitor = await readExhibitor(event.cookies);
	if (!exhibitor) redirect(303, '/login?next=/stallDirectory/exhibitor/leads');
	if (!(await stallDirectoryReady())) return { leads: [], stalls: exhibitor.stalls };
	return { leads: await listLeads(exhibitor.bookingIds), stalls: exhibitor.stalls };
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export const actions: Actions = {
	note: async ({ request, cookies }) => {
		const exhibitor = await readExhibitor(cookies);
		if (!exhibitor) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const note = text(form, 'note').replace(/\s+/g, ' ').slice(0, 300);
		const ok = await saveLeadNote(exhibitor.bookingIds, text(form, 'bookingId'), text(form, 'registrationId'), note);
		return ok ? { success: 'Note saved.' } : fail(404, { message: 'That lead no longer exists.' });
	},

	remove: async ({ request, cookies }) => {
		const exhibitor = await readExhibitor(cookies);
		if (!exhibitor) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const ok = await removeLead(exhibitor.bookingIds, text(form, 'bookingId'), text(form, 'registrationId'));
		return ok ? { success: 'Lead removed.' } : fail(404, { message: 'That lead no longer exists.' });
	}
};
