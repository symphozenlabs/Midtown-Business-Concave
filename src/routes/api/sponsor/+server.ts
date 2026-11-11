import { json } from '@sveltejs/kit';
import { validateSponsorRequest, type SponsorRequestInput, type SponsorTier } from '#lib/stall-booking.ts';
import { sendSponsorAckEmail } from '#lib/server/booking-emails.ts';
import { createSponsorRequest, isBookingStoreAvailable } from '#lib/server/bookings.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

/** A company asks to sponsor the event; the organisers follow up from the dashboard. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	const input: SponsorRequestInput = {
		contactName: str(body?.contactName),
		companyName: str(body?.companyName),
		email: str(body?.email),
		phone: str(body?.phone, 20),
		tier: str(body?.tier, 20) as SponsorTier['id'],
		message: str(body?.message, 1000)
	};
	const errors = validateSponsorRequest(input);
	if (Object.keys(errors).length) return json({ message: 'Check the highlighted fields.', errors }, { status: 400 });
	if (!isBookingStoreAvailable) return json({ message: 'Requests cannot be sent right now. Please try again later.' }, { status: 503 });
	if (!allow(`sponsor:${getClientAddress()}`, 5, 10 * 60_000)) {
		return json({ message: 'Too many requests from this device. Wait a few minutes and try again.' }, { status: 429 });
	}
	const saved = await createSponsorRequest(input);
	// The request is saved either way; a failed thank-you email is not the visitor's problem.
	await sendSponsorAckEmail(saved).catch((e) => console.error('[sponsor] acknowledgement email failed', e));
	return json({ ok: true });
};
