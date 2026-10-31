import { findCertificate } from '#lib/server/ops/certificates.ts';
import { opsReady } from '#lib/server/ops/event.ts';
import { getEventSettings } from '#lib/server/store.ts';
import { eventLabels } from '#lib/event-settings.ts';
import type { PageServerLoad } from './$types';

export const prerender = false;

/** Anyone holding a certificate number can check it here; the page is also the printable certificate. */
export const load: PageServerLoad = async ({ params }) => {
	const certificate = (await opsReady()) ? await findCertificate(params.number) : null;
	return { number: params.number.toUpperCase().slice(0, 20), certificate, when: eventLabels(await getEventSettings()) };
};
