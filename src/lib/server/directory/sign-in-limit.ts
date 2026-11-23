import { allow } from '../rate-limit.ts';

// The whole venue shares one public Wi-Fi address, so the per-address limit is what
// protects inboxes; the per-IP limit only stops a script from looping.
const PER_IP = { limit: 500, windowMs: 10 * 60_000 };
const PER_EMAIL = { limit: 3, windowMs: 30 * 60_000 };

/** "Email me my pass link": true when this request may send one. */
export function allowSignInLink(ip: string, email: string): boolean {
	return allow(`dirlink:ip:${ip}`, PER_IP.limit, PER_IP.windowMs) && allow(`dirlink:email:${email.toLowerCase()}`, PER_EMAIL.limit, PER_EMAIL.windowMs);
}
