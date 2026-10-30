import { dev } from '$app/env';
import { EMAIL_FROM, RESEND_API_KEY } from '$app/env/private';
import { EVENT } from '#lib/event.ts';
import { formatRupees } from '#lib/payment.ts';
import type { Registration } from './store.ts';

export const isEmailConfigured = Boolean(RESEND_API_KEY && EMAIL_FROM);

export class EmailError extends Error {}

interface Attachment {
	filename: string;
	content: Uint8Array;
}

function toBase64(bytes: Uint8Array) {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	return btoa(binary);
}

const escape = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function send(to: string, subject: string, html: string, text: string, attachments: Attachment[] = []) {
	if (!isEmailConfigured) {
		if (dev) {
			console.info(
				`[email] (not sent: Resend is not configured)\n  to: ${to}\n  subject: ${subject}\n  attachments: ${
					attachments.map((a) => `${a.filename} (${(a.content.length / 1048576).toFixed(2)} MB)`).join(', ') || 'none'
				}\n${text.replace(/^/gm, '  | ')}`
			);
			return;
		}
		throw new EmailError('Email is not configured. Set RESEND_API_KEY and EMAIL_FROM.');
	}
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			from: EMAIL_FROM,
			to: [to],
			subject,
			html,
			text,
			attachments: attachments.map((a) => ({ filename: a.filename, content: toBase64(a.content) }))
		})
	});
	if (!res.ok) throw new EmailError(`Resend refused the email (${res.status}): ${await res.text()}`);
}

/** Email layout: navy and gold like the poster, with inline styles for mail clients. */
function layout(title: string, body: string) {
	return `<!doctype html><html><body style="margin:0;background:#0b1430;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#101a3a;border:1px solid #6b5426;border-radius:14px;">
<tr><td style="padding:28px 28px 8px;text-align:center;">
<div style="font-size:11px;letter-spacing:4px;color:#e9b556;text-transform:uppercase;">${escape(EVENT.name)} 2026</div>
<h1 style="margin:14px 0 0;font-family:Georgia,serif;font-weight:normal;font-size:26px;line-height:1.3;color:#ffffff;">${title}</h1>
</td></tr>
<tr><td style="padding:8px 28px 28px;color:#e9dfc9;font-size:15px;line-height:1.6;">${body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #2a3558;color:#a69c8a;font-size:12px;line-height:1.6;text-align:center;">
${escape(EVENT.dateLabel)} · ${escape(EVENT.timeLabel)} · ${escape(EVENT.venue)}<br>Organised by ${escape(EVENT.presenter)} and Midtown Events
</td></tr></table></td></tr></table></body></html>`;
}

function slug(s: string) {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'delegate';
}

export async function sendTicketEmail(reg: Registration, poster: Uint8Array | null) {
	const first = reg.fullName.split(/\s+/)[0];
	const details = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;background:#0b1430;border-radius:10px;">
<tr><td style="padding:16px 18px;color:#e9dfc9;font-size:14px;line-height:1.8;">
<strong style="color:#ffffff;">Registration number:</strong> <span style="color:#f7d07d;letter-spacing:1px;">${escape(reg.code)}</span><br>
<strong style="color:#ffffff;">Delegate:</strong> ${escape(reg.fullName)}, ${escape(reg.designation)}, ${escape(reg.companyName)}<br>
<strong style="color:#ffffff;">Paid:</strong> ${escape(formatRupees(reg.amountRupees))}${reg.upiTxnId ? ` (UPI ref ${escape(reg.upiTxnId)})` : ''}
</td></tr></table>`;
	const html = layout(
		`Your seat is confirmed, ${escape(first)}.`,
		`<p style="margin:0 0 12px;">We have received your payment. Your “I am attending” ticket is attached: share it on WhatsApp, Instagram or LinkedIn, and keep this email for the registration desk.</p>${details}<p style="margin:0;">See you in Salem on ${escape(EVENT.dateLabel)}.</p>`
	);
	const text = `Your seat is confirmed, ${first}.

We have received your payment. Your "I am attending" ticket is attached.

Registration number: ${reg.code}
Delegate: ${reg.fullName}, ${reg.designation}, ${reg.companyName}
Paid: ${formatRupees(reg.amountRupees)}${reg.upiTxnId ? ` (UPI ref ${reg.upiTxnId})` : ''}

${EVENT.dateLabel} · ${EVENT.timeLabel} · ${EVENT.venue}`;
	await send(
		reg.email,
		`Your ticket · ${EVENT.name} 2026 · ${reg.code}`,
		html,
		text,
		poster ? [{ filename: `MBC2026-IAmAttending-${slug(reg.fullName)}-4K.jpg`, content: poster }] : []
	);
}

export async function sendRejectionEmail(reg: Registration, reason: string) {
	const first = reg.fullName.split(/\s+/)[0];
	const html = layout(
		`We could not confirm your payment, ${escape(first)}.`,
		`<p style="margin:0 0 12px;">We checked the UPI transaction ID you entered${reg.upiTxnId ? ` (<strong style="color:#ffffff;">${escape(reg.upiTxnId)}</strong>)` : ''} for registration <strong style="color:#f7d07d;">${escape(reg.code)}</strong> but could not match it to a payment of ${escape(formatRupees(reg.amountRupees))}.</p>
${reason ? `<p style="margin:0 0 12px;"><strong style="color:#ffffff;">Note from the organisers:</strong> ${escape(reason)}</p>` : ''}
<p style="margin:0;">Please fill in the registration form again with the same email address, then pay or enter the correct transaction ID. Your registration number stays the same.</p>`
	);
	const text = `We could not confirm your payment, ${first}.

We checked the UPI transaction ID you entered${reg.upiTxnId ? ` (${reg.upiTxnId})` : ''} for registration ${reg.code} but could not match it to a payment of ${formatRupees(reg.amountRupees)}.
${reason ? `\nNote from the organisers: ${reason}\n` : ''}
Please fill in the registration form again with the same email address, then pay or enter the correct transaction ID. Your registration number stays the same.`;
	await send(reg.email, `Payment not confirmed · ${EVENT.name} 2026 · ${reg.code}`, html, text);
}
