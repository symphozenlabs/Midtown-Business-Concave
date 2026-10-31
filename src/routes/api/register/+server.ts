import { error, json } from '@sveltejs/kit';
import {
	HEARD_FROM,
	INTERESTS,
	STEPS,
	emptyDraft,
	normalisePhone,
	normaliseWebsite,
	resolvedCity,
	resolvedIndustry,
	validateStep,
	type Interest,
	type RegistrationDraft
} from '#lib/registration.ts';
import { discountFor } from '#lib/voucher.ts';
import { deleteObject, isStorageAvailable, putObject } from '#lib/server/r2.ts';
import { findVoucher } from '#lib/server/vouchers.ts';
import {
	DuplicateEmailError,
	createRegistration,
	findByEmail,
	getPaymentSettings,
	isStoreAvailable,
	replaceRegistration,
	type RegistrationInput
} from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

// The page is prerendered; this endpoint always runs on the server.
export const prerender = false;

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const FORM_STEPS = STEPS.filter((s) => s.fields.length).length;

/** Identifies the image by its first bytes rather than trusting the declared type. */
function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: 'image/png', ext: 'png' };
	const riff = String.fromCharCode(...bytes.slice(0, 4));
	const webp = String.fromCharCode(...bytes.slice(8, 12));
	if (riff === 'RIFF' && webp === 'WEBP') return { type: 'image/webp', ext: 'webp' };
	return null;
}

function text(form: FormData, key: string) {
	const value = form.get(key);
	return typeof value === 'string' ? value : '';
}

function readDraft(form: FormData): RegistrationDraft {
	const interests = INTERESTS.map((i) => i.value as string);
	return {
		...emptyDraft(),
		fullName: text(form, 'fullName'),
		email: text(form, 'email'),
		phone: text(form, 'phone'),
		companyName: text(form, 'companyName'),
		designation: text(form, 'designation'),
		industry: text(form, 'industry'),
		industryOther: text(form, 'industryOther'),
		about: text(form, 'about'),
		website: text(form, 'website'),
		linkedin: text(form, 'linkedin'),
		city: text(form, 'city'),
		cityOther: text(form, 'cityOther'),
		interests: [...new Set(form.getAll('interests').map(String))].filter((i) => interests.includes(i)) as Interest[],
		heardFrom: (HEARD_FROM as readonly string[]).includes(text(form, 'heardFrom')) ? text(form, 'heardFrom') : '',
		consent: text(form, 'consent') === 'true',
		whatsappUpdates: text(form, 'whatsappUpdates') === 'true'
	};
}

function readFraming(form: FormData) {
	const num = (key: string, min: number, max: number, fallback: number) => {
		const n = Number(text(form, key));
		return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
	};
	return { zoom: num('zoom', 0.5, 2.2, 1), dx: num('dx', -260, 260, 0), dy: num('dy', -360, 360, 0) };
}

async function readImage(form: FormData, key: string, maxBytes: number) {
	const file = form.get(key);
	if (!(file instanceof File) || file.size === 0) return null;
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes.byteLength > maxBytes) return { error: 'too_large' as const };
	const image = sniffImage(bytes);
	if (!image) return { error: 'not_image' as const };
	return { bytes, ...image };
}

export const POST: RequestHandler = async ({ request }) => {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Send the registration as form data.');
	}

	const draft = readDraft(form);
	const photo = await readImage(form, 'photo', MAX_PHOTO_BYTES);
	const poster = await readImage(form, 'poster', MAX_POSTER_BYTES);

	for (let i = 0; i < FORM_STEPS; i++) {
		const errors = validateStep(i, draft, !!photo);
		if (Object.keys(errors).length) return json({ message: 'Some details need attention.', errors }, { status: 400 });
	}
	if (!photo || 'error' in photo) {
		// Logged so refused uploads can be traced; the browser normally resizes well under the limit.
		console.warn('[register] photo refused', photo?.error ?? 'missing', draft.email);
		return json(
			{
				message:
					photo?.error === 'too_large'
						? 'Your photo is too large. Choose one under 5 MB.'
						: 'Your photo must be a JPG, PNG or WebP image.'
			},
			{ status: photo?.error === 'too_large' ? 413 : 415 }
		);
	}
	if (!poster || 'error' in poster || poster.type !== 'image/jpeg') {
		return json({ message: 'Your poster could not be prepared. Please try again.' }, { status: 400 });
	}

	if (!isStoreAvailable || !isStorageAvailable) {
		console.error('[register] DATABASE_URL and R2_* environment variables must be set.');
		return json({ message: 'Registration is not available right now. Please try again later.' }, { status: 503 });
	}

	const email = draft.email.trim().toLowerCase();
	const existing = await findByEmail(email);
	if (existing && (existing.status === 'paid' || existing.status === 'payment_submitted')) {
		return json(
			{
				message:
					existing.status === 'paid'
						? `${email} is already registered and paid. Check your inbox for your ticket.`
						: `${email} is already registered and your payment is being checked. We will email your ticket once it is confirmed.`
			},
			{ status: 409 }
		);
	}

	const settings = await getPaymentSettings();
	// Coming back to edit their details keeps a voucher they already applied.
	const held = existing?.voucherCode ? await findVoucher(existing.voucherCode) : null;
	const discount = held?.scope === 'pass' ? discountFor(held, settings.priceRupees) : 0;
	const id = crypto.randomUUID();
	const photoKey = `registrations/2026/${id}.${photo.ext}`;
	const posterKey = `registrations/2026/${id}-poster.jpg`;
	await Promise.all([putObject(photoKey, photo.bytes, photo.type), putObject(posterKey, poster.bytes, poster.type)]);

	const input: RegistrationInput = {
		fullName: draft.fullName.trim(),
		email,
		phone: normalisePhone(draft.phone)!,
		photoKey,
		posterKey,
		companyName: draft.companyName.trim(),
		designation: draft.designation.trim(),
		industry: resolvedIndustry(draft),
		about: draft.about.trim() || null,
		website: normaliseWebsite(draft.website) || null,
		linkedin: normaliseWebsite(draft.linkedin) || null,
		city: resolvedCity(draft),
		interests: draft.interests,
		heardFrom: draft.heardFrom || null,
		whatsappUpdates: draft.whatsappUpdates,
		posterFraming: readFraming(form),
		amountRupees: settings.priceRupees - discount
	};

	try {
		// Not paid yet (or payment rejected): replace their details and keep the same code.
		const registration = existing ? await replaceRegistration(existing.id, input) : await createRegistration(input);
		if (existing) await Promise.all([deleteObject(existing.photoKey), deleteObject(existing.posterKey)]);
		return json(
			{
				code: registration.code,
				fullName: registration.fullName,
				email: registration.email,
				amountRupees: registration.amountRupees,
				vpa: settings.vpa,
				payeeName: settings.payeeName,
				priceRupees: settings.priceRupees,
				voucherCode: registration.voucherCode,
				discountRupees: registration.discountRupees
			},
			{ status: existing ? 200 : 201 }
		);
	} catch (e) {
		await Promise.all([deleteObject(photoKey), deleteObject(posterKey)]);
		if (e instanceof DuplicateEmailError) {
			return json({ message: `${email} is already registered.` }, { status: 409 });
		}
		console.error('[register] could not save the registration', e);
		error(500, 'Something went wrong while registering.');
	}
};
