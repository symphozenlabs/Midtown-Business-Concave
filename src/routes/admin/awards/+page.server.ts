import { fail, redirect } from '@sveltejs/kit';
import { AWARD_STATUSES, type AwardStatus } from '#lib/awards.ts';
import { getAwardsWindow, isAwardsStoreAvailable, listAwardApplications, setAwardsClosingTime, setAwardsOpen, updateAwardApplication } from '#lib/server/awards.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/login');
	if (!isAwardsStoreAvailable) return { available: false as const };
	const [applications, awards] = await Promise.all([listAwardApplications(), getAwardsWindow()]);
	return { available: true as const, applications, ...awards };
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
	},
	setClosingTime: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const local = String(form.get('closesAt') ?? '');
		// The organisers type India time; store it as an exact moment.
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return fail(400, { message: 'Choose a closing date and time.' });
		const closesAt = new Date(`${local}:00+05:30`);
		if (Number.isNaN(closesAt.getTime())) return fail(400, { message: 'Choose a closing date and time.' });
		if (closesAt.getTime() <= Date.now()) return fail(400, { message: 'Choose a closing time in the future.' });
		await setAwardsClosingTime(closesAt.toISOString(), locals.admin.email);
		return { success: 'Closing time saved.' };
	},
	clearClosingTime: async ({ locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		await setAwardsClosingTime(null, locals.admin.email);
		return { success: 'Closing time removed. Applications stay open until you close them.' };
	}
};
