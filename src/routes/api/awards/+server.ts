import { json } from '@sveltejs/kit';
import { MAX_LOGO_BYTES, validateAwardApplication, type AwardApplicationInput } from '#lib/awards.ts';
import { sendAwardAckEmail } from '#lib/server/booking-emails.ts';
import { areAwardsOpen, createAwardApplication, DuplicateAwardError, isAwardsStoreAvailable } from '#lib/server/awards.ts';
import { deleteObject, isStorageAvailable, putObject } from '#lib/server/r2.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Whether the form is taking applications; the awards page itself is static. */
export const GET: RequestHandler = async () => {
	const open = isAwardsStoreAvailable ? await areAwardsOpen() : false;
	return json({ open }, { headers: { 'cache-control': 'no-store' } });
};

/** Trusts the file's first bytes, not its name or the type the browser reported. */
function sniffLogo(b: Uint8Array): { type: string; ext: string } | null {
	if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
	if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
	if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
		return { type: 'image/webp', ext: 'webp' };
	}
	return null;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!isAwardsStoreAvailable) return json({ message: 'Applications cannot be sent right now. Please try again later.' }, { status: 503 });
	if (!allow(`awards:${getClientAddress()}`, 8, 10 * 60_000)) {
		return json({ message: 'Too many applications from this device. Wait a few minutes and try again.' }, { status: 429 });
	}
	if (!(await areAwardsOpen())) return json({ message: 'Applications for the awards are now closed.', closed: true }, { status: 403 });

	const form = await request.formData().catch(() => null);
	if (!form) return json({ message: 'We could not read the form. Please try again.' }, { status: 400 });
	const str = (key: string, max = 1200) => {
		const v = form.get(key);
		return typeof v === 'string' ? v.slice(0, max) : '';
	};
	const input: AwardApplicationInput = {
		fullName: str('fullName'),
		designation: str('designation'),
		email: str('email'),
		phone: str('phone', 20),
		city: str('city'),
		businessName: str('businessName'),
		categoryId: str('categoryId', 30),
		otherCategory: str('otherCategory'),
		yearStarted: str('yearStarted', 8),
		teamSize: str('teamSize', 12),
		website: str('website', 400),
		about: str('about'),
		achievements: str('achievements'),
		declared: str('declared', 8) === 'true'
	};
	const errors = validateAwardApplication(input);
	if (Object.keys(errors).length) return json({ message: 'Check the highlighted fields.', errors }, { status: 400 });

	let logo: { bytes: Uint8Array; type: string; ext: string } | null = null;
	const file = form.get('logo');
	if (file instanceof File && file.size > 0) {
		if (file.size > MAX_LOGO_BYTES) return json({ message: 'Your logo is too large. Choose one under 3 MB.', errors: { logo: 'Choose a logo under 3 MB.' } }, { status: 413 });
		const bytes = new Uint8Array(await file.arrayBuffer());
		const kind = sniffLogo(bytes);
		if (!kind) return json({ message: 'Your logo must be a JPG, PNG or WebP image.', errors: { logo: 'Use a JPG, PNG or WebP image.' } }, { status: 415 });
		if (!isStorageAvailable) return json({ message: 'Logos cannot be uploaded right now. Remove it and send the form.' }, { status: 503 });
		logo = { bytes, ...kind };
	}

	const logoKey = logo ? `awards/2026/${crypto.randomUUID()}.${logo.ext}` : null;
	if (logo && logoKey) await putObject(logoKey, logo.bytes, logo.type);
	try {
		const saved = await createAwardApplication(input, logoKey);
		// The application is saved either way; a failed thank-you email is not the applicant's problem.
		await sendAwardAckEmail(saved).catch((e) => console.error('[awards] acknowledgement email failed', e));
		return json({ ok: true, code: saved.code, email: saved.email });
	} catch (e) {
		await deleteObject(logoKey);
		if (e instanceof DuplicateAwardError) {
			return json({ message: 'This business has already applied in this category with this mobile number.' }, { status: 409 });
		}
		throw e;
	}
};
