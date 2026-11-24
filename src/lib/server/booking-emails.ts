import { AWARDS_EVENT } from '#lib/awards.ts';
import { EVENT } from '#lib/event.ts';
import { formatRupees } from '#lib/payment.ts';
import { SPONSOR_TIERS } from '#lib/stall-booking.ts';
import type { AwardApplication } from './awards.ts';
import type { SponsorRequest, StallBooking } from './bookings.ts';
import { button, escape, layout, schedule, send, sendMessageEmail } from './email.ts';

const gold = (s: string) => `<strong style="color:#f7d07d;">${escape(s)}</strong>`;
const first = (name: string) => name.split(/\s+/)[0];

/* ---------- stall directory login and stall QR ---------- */

/** What a confirmed exhibitor gets: the stall login, and the stall QR that shares their contact card. */
export interface ExhibitorKit {
	loginUrl: string;
	/** The page the stall QR opens: contact card with "Save contact". */
	cardUrl: string;
	/** The stall QR as a PNG, attached to the email. */
	qr: Uint8Array;
}

/** The mobile number as the exhibitor types it: 10 digits. */
const localPhone = (phone: string) => phone.replace(/^\+91/, '');

const qrAttachment = (b: StallBooking, kit: ExhibitorKit) => ({ filename: `MBC2026-Stall-${b.code}.png`, content: kit.qr });

function kitBlocks(b: StallBooking, kit: ExhibitorKit) {
	const html = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background:#0b1430;border-radius:10px;">
<tr><td style="padding:16px 18px;color:#e9dfc9;font-size:14px;line-height:1.7;">
<strong style="color:#ffffff;">Your stall QR</strong><br>
The attached QR is your stall’s contact card. Print it or keep it on your phone at the stall: anyone who scans it sees your business, name, phone number and email, and can save you to their contacts or message you. Show it to the visitors you want to stay in touch with.
<div style="margin-top:14px;">${button(kit.cardUrl, 'See my contact card')}</div>
</td></tr></table>
<p style="margin:16px 0 8px;"><strong style="color:#ffffff;">Your stall directory login</strong></p>
<p style="margin:0 0 8px;">Read messages from delegates, and scan the QR on their passes to collect leads.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;font-size:14px;">
<tr><td style="padding:2px 12px 2px 0;color:#a69c8a;">Login</td><td>${gold(b.email)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#a69c8a;">Password</td><td>${gold(localPhone(b.phone))} <span style="color:#a69c8a;">(your mobile number)</span></td></tr>
</table>
<p style="margin:0 0 12px;">${button(kit.loginUrl, 'Open my stall')}</p>`;
	const text = `Your stall QR (attached) is your stall's contact card. Anyone who scans it sees your business, name, phone number and email, and can save you to their contacts or message you.
See my contact card: ${kit.cardUrl}

Your stall directory login
Read messages from delegates, and scan the QR on their passes to collect leads.
Login: ${b.email}
Password: ${localPhone(b.phone)} (your mobile number)
Open my stall: ${kit.loginUrl}`;
	return { html, text };
}

/** The stall QR and login on their own, for exhibitors confirmed before these existed. */
export async function sendExhibitorLoginEmail(b: StallBooking, kit: ExhibitorKit) {
	const when = await schedule();
	const blocks = kitBlocks(b, kit);
	const stall = b.allottedStall ? ` (stall No. ${b.allottedStall})` : '';
	const html = layout(
		`Your stall QR and login, ${escape(first(b.fullName))}.`,
		`<p style="margin:0 0 12px;">${escape(b.businessName)}${escape(stall)} is listed in the stall directory with the floor map, so delegates can find you and message you.</p>
${blocks.html}
<p style="margin:0;font-size:12px;color:#a69c8a;">Keep the login to yourself: anyone with it can read your stall’s messages and leads.</p>`,
		when
	);
	const text = `Your stall QR and login, ${first(b.fullName)}.

${b.businessName}${stall} is listed in the stall directory with the floor map, so delegates can find you and message you.

${blocks.text}

Keep the login to yourself: anyone with it can read your stall's messages and leads.`;
	return send(b.email, `Your stall QR and login · ${EVENT.name} 2026`, html, text, [qrAttachment(b, kit)]);
}

/** Backup alert to the exhibitor: a delegate wrote to their stall. Never the message text. */
export async function sendExhibitorMessageEmail(
	b: { email: string; businessName: string },
	from: { fullName: string; designation: string; companyName: string },
	link: string
) {
	return sendMessageEmail(b.email, from, link, `the stall directory (${b.businessName})`);
}

/** Sent when an organiser confirms a stall booking's payment. With the kit, it carries the stall QR and login. */
export async function sendStallConfirmedEmail(b: StallBooking, kit?: ExhibitorKit) {
	const when = await schedule();
	const blocks = kit ? kitBlocks(b, kit) : null;
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
<p style="margin:0;">Stall: ${escape(b.stallType)}. Reply to this email if anything needs changing.</p>${blocks ? blocks.html : ''}`,
		when
	);
	const text = `Your stall is confirmed, ${first(b.fullName)}.

We have received your payment of ${formatRupees(b.amountRupees)} for booking ${b.code} (${b.businessName}).
${stallText}
Stall: ${b.stallType}. Reply to this email if anything needs changing.${blocks ? `\n\n${blocks.text}` : ''}`;
	return send(b.email, `Stall confirmed · ${EVENT.name} 2026 · ${b.code}`, html, text, kit ? [qrAttachment(b, kit)] : []);
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

/** Sent when a business applies at awards.midtownevents.in. */
export async function sendAwardAckEmail(a: AwardApplication) {
	const when = await schedule();
	const html = layout(
		`Thank you for applying, ${escape(first(a.fullName))}.`,
		`<p style="margin:0 0 12px;">We have received ${escape(a.businessName)}'s application for the ${gold(AWARDS_EVENT.name)} in the ${escape(a.categoryLabel)} category.</p>
<p style="margin:0 0 12px;">Your application number is ${gold(a.code)}.</p>
<p style="margin:0;">The organising team will review it and contact you if you are shortlisted.</p>`,
		when,
		{
			heading: AWARDS_EVENT.name,
			footer: `${AWARDS_EVENT.date} · ${AWARDS_EVENT.time} · ${AWARDS_EVENT.venue} · Presented by ${AWARDS_EVENT.presenter} · Enquiries ${AWARDS_EVENT.phone}`
		}
	);
	const text = `Thank you for applying, ${first(a.fullName)}.

We have received ${a.businessName}'s application for the ${AWARDS_EVENT.name} in the ${a.categoryLabel} category.
Your application number is ${a.code}.
The organising team will review it and contact you if you are shortlisted.`;
	return send(a.email, `Award application received · ${a.code}`, html, text);
}
