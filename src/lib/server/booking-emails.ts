import { EVENT } from '#lib/event.ts';
import { formatRupees } from '#lib/payment.ts';
import { SPONSOR_TIERS } from '#lib/stall-booking.ts';
import type { SponsorRequest, StallBooking } from './bookings.ts';
import { escape, layout, schedule, send } from './email.ts';

const gold = (s: string) => `<strong style="color:#f7d07d;">${escape(s)}</strong>`;
const first = (name: string) => name.split(/\s+/)[0];

/** Sent when an organiser confirms a stall booking's payment. */
export async function sendStallConfirmedEmail(b: StallBooking) {
	const when = await schedule();
	const stall = b.allottedStall
		? `Your allotted stall is ${gold(`No. ${b.allottedStall}`)}.`
		: 'The organisers will let you know your final stall number before the event.';
	const stallText = b.allottedStall
		? `Your allotted stall is No. ${b.allottedStall}.`
		: 'The organisers will let you know your final stall number before the event.';
	const html = layout(
		`Your stall is confirmed, ${escape(first(b.fullName))}.`,
		`<p style="margin:0 0 12px;">We have received your payment of ${gold(formatRupees(b.amountRupees))} for booking ${gold(b.code)} (${escape(b.businessName)}).</p>
<p style="margin:0 0 12px;">${stall}</p>
<p style="margin:0;">Stall: ${escape(b.stallType)}. Reply to this email if anything needs changing.</p>`,
		when
	);
	const text = `Your stall is confirmed, ${first(b.fullName)}.

We have received your payment of ${formatRupees(b.amountRupees)} for booking ${b.code} (${b.businessName}).
${stallText}
Stall: ${b.stallType}. Reply to this email if anything needs changing.`;
	return send(b.email, `Stall confirmed · ${EVENT.name} 2026 · ${b.code}`, html, text);
}

export async function sendStallRejectedEmail(b: StallBooking, reason: string) {
	const when = await schedule();
	// Not everyone got as far as entering a transaction ID.
	const checked = b.upiTxnId
		? `We checked the UPI transaction ID you entered (${gold(b.upiTxnId)}) for stall booking ${gold(b.code)} but could not match it to a payment of ${escape(formatRupees(b.amountRupees))}.`
		: `We have not received a payment of ${escape(formatRupees(b.amountRupees))} for stall booking ${gold(b.code)}, so it has been cancelled.`;
	const checkedText = b.upiTxnId
		? `We checked the UPI transaction ID you entered (${b.upiTxnId}) for stall booking ${b.code} but could not match it to a payment of ${formatRupees(b.amountRupees)}.`
		: `We have not received a payment of ${formatRupees(b.amountRupees)} for stall booking ${b.code}, so it has been cancelled.`;
	const html = layout(
		`We could not confirm your stall booking, ${escape(first(b.fullName))}.`,
		`<p style="margin:0 0 12px;">${checked}</p>
${reason ? `<p style="margin:0 0 12px;"><strong style="color:#ffffff;">Note from the organisers:</strong> ${escape(reason)}</p>` : ''}
<p style="margin:0;">Please book again on the website, or reply to this email and we will help.</p>`,
		when
	);
	const text = `We could not confirm your stall booking, ${first(b.fullName)}.

${checkedText}
${reason ? `\nNote from the organisers: ${reason}\n` : ''}
Please book again on the website, or reply to this email and we will help.`;
	return send(b.email, `Stall booking not confirmed · ${EVENT.name} 2026 · ${b.code}`, html, text);
}

/** Sent when an organiser changes the stall of a confirmed booking. */
export async function sendStallChangedEmail(b: StallBooking) {
	const when = await schedule();
	const line = b.allottedStall
		? `Your stall for booking ${gold(b.code)} (${escape(b.businessName)}) is now ${gold(`No. ${b.allottedStall}`)}.`
		: `The stall number for booking ${gold(b.code)} (${escape(b.businessName)}) is being rearranged. The organisers will send your final stall number before the event.`;
	const lineText = b.allottedStall
		? `Your stall for booking ${b.code} (${b.businessName}) is now No. ${b.allottedStall}.`
		: `The stall number for booking ${b.code} (${b.businessName}) is being rearranged. The organisers will send your final stall number before the event.`;
	const html = layout(
		`Your stall has been updated, ${escape(first(b.fullName))}.`,
		`<p style="margin:0 0 12px;">${line}</p>
<p style="margin:0;">Your booking stays confirmed. Reply to this email if you have any questions.</p>`,
		when
	);
	const text = `Your stall has been updated, ${first(b.fullName)}.

${lineText}
Your booking stays confirmed. Reply to this email if you have any questions.`;
	return send(b.email, `Stall updated · ${EVENT.name} 2026 · ${b.code}`, html, text);
}

/** Thanks the company for its sponsorship request. */
export async function sendSponsorAckEmail(r: SponsorRequest) {
	const when = await schedule();
	const tier = SPONSOR_TIERS.find((t) => t.id === r.tier);
	const tierLabel = tier ? `${tier.name} (${formatRupees(tier.priceRupees)})` : r.tier;
	const html = layout(
		`Thank you for your interest, ${escape(first(r.contactName))}.`,
		`<p style="margin:0 0 12px;">We have received ${escape(r.companyName)}'s request for the ${gold(tierLabel)} sponsorship at the ${escape(EVENT.name)}.</p>
<p style="margin:0;">The organising team will call or email you shortly to take it forward.</p>`,
		when
	);
	const text = `Thank you for your interest, ${first(r.contactName)}.

We have received ${r.companyName}'s request for the ${tierLabel} sponsorship at the ${EVENT.name}.
The organising team will call or email you shortly to take it forward.`;
	return send(r.email, `Sponsorship request received · ${EVENT.name} 2026`, html, text);
}
