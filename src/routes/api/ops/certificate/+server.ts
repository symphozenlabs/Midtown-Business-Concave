import { json } from '@sveltejs/kit';
import { assignmentFor } from '#lib/server/ops/handlers.ts';
import { findCertificate } from '#lib/server/ops/certificates.ts';
import { allow } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Certificate desk: verify a certificate by its number. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const handler = locals.handler;
	if (!handler) return json({ message: 'Sign in again.' }, { status: 401 });
	if (!assignmentFor(handler, 'certificate')) return json({ message: 'You are not assigned to the certificate desk.' }, { status: 403 });
	if (!allow(`cert:${handler.id}`, 30, 60_000)) return json({ message: 'Too many searches. Wait a moment.' }, { status: 429 });
	const cert = await findCertificate(url.searchParams.get('no') ?? '');
	if (!cert) return json({ found: false });
	return json({
		found: true,
		number: cert.number,
		name: cert.fullName,
		company: cert.companyName,
		issuedAt: cert.issuedAt,
		revoked: Boolean(cert.revokedAt)
	});
};
