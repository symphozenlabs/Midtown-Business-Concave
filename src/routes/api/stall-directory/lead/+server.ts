import { json } from '@sveltejs/kit';
import { parseScanned, resolveToken } from '#lib/server/ops/passes.ts';
import { allow } from '#lib/server/rate-limit.ts';
import { readExhibitor } from '#lib/server/stall-directory/exhibitor.ts';
import { addLead, registrationByCode, stallDirectoryReady } from '#lib/server/stall-directory/store.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * The exhibitor scanned a delegate's pass QR at the stall (or typed their MBC-
 * registration number): save them as a lead and return their contact card. Showing
 * the QR is how a delegate shares their card, the same rule as the handler desks.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!(await stallDirectoryReady())) return json({ message: 'Leads open closer to the event.' }, { status: 503 });
	const exhibitor = await readExhibitor(cookies);
	if (!exhibitor) return json({ message: 'Sign in again.' }, { status: 401 });
	if (!allow(`stalllead:${exhibitor.bookingId}`, 60, 60_000)) return json({ message: 'Scanning too fast. Wait a moment.' }, { status: 429 });

	const body = (await request.json().catch(() => null)) as { text?: unknown; bookingId?: unknown } | null;
	const text = typeof body?.text === 'string' ? body.text.slice(0, 300) : '';
	const bookingId = typeof body?.bookingId === 'string' && exhibitor.bookingIds.includes(body.bookingId) ? body.bookingId : exhibitor.bookingId;

	const scanned = parseScanned(text);
	if (!scanned) return json({ message: 'That isn’t a conclave pass. Scan the QR on the delegate’s ID card or pass.' }, { status: 400 });
	let registrationId: string | null = null;
	if ('token' in scanned) {
		const resolved = await resolveToken(scanned.token);
		if (resolved.status === 'revoked') return json({ message: 'That pass was replaced. Ask the delegate for their current pass.' }, { status: 409 });
		if (resolved.status === 'active') registrationId = resolved.registrationId;
	} else {
		registrationId = await registrationByCode(scanned.code);
	}
	if (!registrationId) return json({ message: 'No confirmed delegate has that pass.' }, { status: 404 });

	const saved = await addLead(bookingId, registrationId);
	if (!saved) return json({ message: 'No confirmed delegate has that pass.' }, { status: 404 });
	return json(saved);
};
