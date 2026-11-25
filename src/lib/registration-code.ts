import type { TicketType } from './payment.ts';

/**
 * Registration numbers: MBC-XXXXXX for the Delegate pass, MBCV-XXXXXX for the
 * Visitor ticket, so the ticket shows at a glance on the gate, in the admin list
 * and in the UPI payment note. Six letters or digits, without 0/O or 1/I/L.
 */
export const REGISTRATION_CODE = /^MBCV?-[A-Z0-9]{6}$/;

/** For an HTML `pattern` attribute (case-insensitive by hand: patterns have no flags). */
export const REGISTRATION_CODE_PATTERN = '[Mm][Bb][Cc][Vv]?-[A-Za-z0-9]{6}';

export function isRegistrationCode(value: string) {
	return REGISTRATION_CODE.test(value);
}

export function codePrefix(ticket: TicketType) {
	return ticket === 'visitor' ? 'MBCV-' : 'MBC-';
}

/** The same six characters under the prefix of the given ticket. */
export function withTicketPrefix(code: string, ticket: TicketType) {
	return codePrefix(ticket) + code.slice(code.indexOf('-') + 1);
}

/**
 * Both spellings of a code. An unpaid visitor who registered before visitor codes
 * existed was moved from MBC- to MBCV-, but their browser may still hold the old one.
 */
export function codeVariants(code: string): string[] {
	const rest = code.slice(code.indexOf('-') + 1);
	return [`MBC-${rest}`, `MBCV-${rest}`];
}
