import { redirect } from '@sveltejs/kit';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import type { LayoutServerLoad } from './$types';

export const prerender = false;

/** Every exhibitor page needs the stall login. */
export const load: LayoutServerLoad = async ({ cookies, url }) => {
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return {
		ready: await stallDirectoryReady(),
		exhibitor: {
			contactName: exhibitor.contactName,
			businessName: exhibitor.businessName,
			stalls: exhibitor.stalls
		}
	};
};
