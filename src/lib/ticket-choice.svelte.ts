import type { TicketType } from './payment.ts';

/**
 * The hero's "Register as" buttons pick the ticket before scrolling to the form.
 * `nonce` changes on every press, so pressing the same button again still applies.
 */
export const ticketChoice = $state({ ticket: null as TicketType | null, nonce: 0 });

export function chooseTicket(ticket: TicketType) {
	ticketChoice.ticket = ticket;
	ticketChoice.nonce++;
}

/** Shareable links: /#register-visitor or /#register-delegate open the form with that ticket. */
export function ticketFromHash(hash: string): TicketType | null {
	if (hash === '#register-visitor') return 'visitor';
	if (hash === '#register-delegate') return 'delegate';
	return null;
}
