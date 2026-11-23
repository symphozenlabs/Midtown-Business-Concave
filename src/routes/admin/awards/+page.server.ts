import { fail, redirect } from '@sveltejs/kit';
import { AWARD_STATUSES, type AwardStatus } from '#lib/awards.ts';
import { areAwardsOpen, isAwardsStoreAvailable, listAwardApplications, setAwardsOpen, updateAwardApplication } from '#lib/server/awards.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	if (!isAwardsStoreAvailable) return { available: false as const };
	const [applications, open] = await Promise.all([listAwardApplications(), areAwardsOpen()]);
	return { available: true as const, applications, open };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '') as AwardStatus;
		if (!AWARD_STATUSES.includes(status)) return fail(400, { message: 'Choose a status.' });
		const note = String(form.get('note') ?? '').trim().replace(/\s+/g, ' ').slice(0, 300) || null;
		const ok = await updateAwardApplication(id, status, note, locals.admin.email);
		if (!ok) return fail(404, { message: 'That application no longer exists.' });
		return { success: 'Saved.' };
	},
	setOpen: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const open = String(form.get('open')) === 'true';
		await setAwardsOpen(open, locals.admin.email);
		return { success: open ? 'Applications are open.' : 'Applications are closed.' };
	}
};
