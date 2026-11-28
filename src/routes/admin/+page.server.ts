import { fail, redirect } from '@sveltejs/kit';
import { publicOrigin } from '#lib/server/site.ts';
import { SESSION_COOKIE, SESSION_COOKIE_PATH } from '#lib/server/auth.ts';
import { isDatabaseConfigured } from '#lib/server/db.ts';
import {
	EmailError,
	emailStatusFor,
	fetchEmailEvent,
	isEmailConfigured,
	sendPassEmail,
	sendRejectionEmail,
	sendTicketEmail
} from '#lib/server/email.ts';
import { deleteObject, getObject, isR2Configured } from '#lib/server/r2.ts';
import { cardBacksToMake, markPassEmailed, passEmailFor, passesToSend } from '#lib/server/ops/passes.ts';
import { adminFlagsFor, setAdminFlags } from '#lib/server/directory/people.ts';
import { directoryReady } from '#lib/server/directory/settings.ts';
import { audit, getDefaultEvent, opsReady } from '#lib/server/ops/event.ts';
import { TICKET_LABEL, formatRupees, normaliseUtr, priceFor } from '#lib/payment.ts';
import { readWalkIn } from '#lib/walk-in.ts';
import { isContactFilter, isSegment, isUpiFilter, type ContactFilter, type Segment, type UpiFilter } from '#lib/segments.ts';
import {
	EMAIL_FILTERS,
	STATUSES,
	createWalkIn,
	deleteRegistration,
	getEventSettings,
	getFrontsOutdated,
	getPaymentSettings,
	getRegistration,
	setFrontsOutdated,
	getStats,
	isStoreAvailable,
	listRegistrations,
	listRegistrationsPage,
	listEmailsToCheck,
	listFailedTickets,
	listUnsentTickets,
	markManyPaid,
	markPaid,
	markRejected,
	markTicketEmailed,
	recordEmailEvent,
	setUpiTxnId,
	type EmailFilter,
	type Registration,
	type Status,
	segmentCounts,
	listAmounts
} from '#lib/server/store.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Tickets sent per click. Resend allows about 2 requests a second and a Worker has a
 * subrequest budget, so a large queue goes out over a few clicks.
 */
const SEND_BATCH = 25;
const SEND_GAP_MS = 550;
/** Delivery checks per click; they share the same Resend rate limit. */
const CHECK_BATCH = 25;

/** ID card backs the organiser's browser should draw now, with what each needs. Never blocks the page. */
async function cardBackJobs(origin: string) {
	try {
		// Walk-ins get a printed label, not an emailed ID card.
		const paid = (await listRegistrations({ status: 'paid', q: '' })).filter((r) => !r.walkIn);
		const jobs = await cardBacksToMake(paid, origin);
		const byId = new Map(paid.map((r) => [r.id, r]));
		return jobs.map((j) => {
			const r = byId.get(j.id)!;
			return { ...j, name: r.fullName, title: r.designation, code: r.code, photoKey: r.photoKey, ticketType: r.ticketType };
		});
	} catch (e) {
		console.error('[admin] could not list ID card backs to make', e);
		return [];
	}
}

/** Paid delegates whose square (1:1) post the organiser's browser should cut from their front now. */
async function cardPostJobs() {
	try {
		const paid = await listRegistrations({ status: 'paid', q: '' });
		return paid
			.filter((r) => r.posterKey && !r.postKey)
			.slice(0, 12)
			.map((r) => ({ id: r.id, code: r.code, posterKey: r.posterKey }));
	} catch (e) {
		console.error('[admin] could not list square posts to make', e);
		return [];
	}
}

/** Registrations per page of the dashboard table. */
const PAGE_SIZE = 25;

/** One page of the table; a page past the end (e.g. after rows left the tab) shows the last page. */
type TableFilter = {
	status: Status | 'all';
	q: string;
	email: EmailFilter;
	segment: Segment;
	contact: ContactFilter;
	upi: UpiFilter;
	amount: number | null;
};

async function tablePage(filter: TableFilter, requested: number) {
	let page = requested;
	let { rows, total } = await listRegistrationsPage(filter, page, PAGE_SIZE);
	const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	if (page > pages) {
		page = pages;
		({ rows, total } = await listRegistrationsPage(filter, page, PAGE_SIZE));
	}
	return { rows, pagination: { page, pages, pageSize: PAGE_SIZE, total } };
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.admin) redirect(303, '/login');
	const configured = { database: isDatabaseConfigured, storage: isR2Configured, email: isEmailConfigured };
	if (!isStoreAvailable) {
		return { configured, available: false as const };
	}

	const stats = await getStats();
	const requested = url.searchParams.get('status');
	const status: Status | 'all' =
		requested === 'all' || STATUSES.includes(requested as Status)
			? (requested as Status | 'all')
			: stats.counts.payment_submitted > 0
				? 'payment_submitted'
				: 'all';
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	const requestedEmail = url.searchParams.get('email') as EmailFilter | null;
	const email: EmailFilter = requestedEmail && EMAIL_FILTERS.includes(requestedEmail) ? requestedEmail : 'all';
	const requestedPage = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
	const requestedSegment = url.searchParams.get('segment');
	const segment: Segment = isSegment(requestedSegment) ? requestedSegment : 'all';
	// Column filters from the table headings.
	const requestedContact = url.searchParams.get('contact');
	const contact: ContactFilter = isContactFilter(requestedContact) ? requestedContact : 'all';
	const requestedUpi = url.searchParams.get('upi');
	const upi: UpiFilter = isUpiFilter(requestedUpi) ? requestedUpi : 'all';
	const requestedAmount = url.searchParams.get('amount') ?? '';
	const amount = /^\d{1,7}(\.\d{1,2})?$/.test(requestedAmount) ? Number(requestedAmount) : null;

	const [table, segments, amounts, passes, cardBacks, cardPosts, event, frontsOutdated, payment] = await Promise.all([
		tablePage({ status, q, email, segment, contact, upi, amount }, requestedPage),
		segmentCounts({ status, q, email, contact, upi, amount }),
		listAmounts(),
		passesToSend(1),
		cardBackJobs(publicOrigin(url)),
		cardPostJobs(),
		getEventSettings(),
		getFrontsOutdated(),
		getPaymentSettings()
	]);
	const directoryFlags = (await directoryReady()) ? await adminFlagsFor(table.rows.map((r) => r.id)) : null;
	return {
		configured,
		available: true as const,
		directoryFlags,
		stats,
		passesToSend: passes.total,
		filter: { status, q, email, segment, contact, upi, amount },
		segments,
		amounts,
		registrations: table.rows,
		pagination: table.pagination,
		cardBacks,
		cardPosts,
		event,
		frontsOutdated,
		/** What a walk-in pays for each ticket. */
		prices: { delegate: priceFor(payment, 'delegate'), visitor: priceFor(payment, 'visitor') }
	};
};

/** The pass is attached when event operations are set up; the ticket goes out either way. */
async function passFor(reg: Registration, origin: string) {
	try {
		return await passEmailFor(reg, origin);
	} catch (e) {
		console.error('[admin] could not attach the event pass', e);
		return null;
	}
}

/** Front (the poster), back (QR and details) and square post of the ID card, as stored. */
async function cardImages(reg: Registration) {
	const [front, back, post] = await Promise.all([
		reg.posterKey ? getObject(reg.posterKey) : null,
		reg.ticketBackKey ? getObject(reg.ticketBackKey) : null,
		reg.postKey ? getObject(reg.postKey) : null
	]);
	return { front: front?.body ?? null, back: back?.body ?? null, post: post?.body ?? null };
}

async function emailTicket(reg: Registration, origin: string) {
	const [card, pass] = await Promise.all([cardImages(reg), passFor(reg, origin)]);
	// Three images: the story-size front, the square post and the story-size QR pass.
	const emailId = await sendTicketEmail(reg, card.front, pass, card.back, card.post);
	await markTicketEmailed(reg.id, emailId);
	if (pass) await markPassEmailed(reg.id);
}

const pause = () => new Promise((r) => setTimeout(r, SEND_GAP_MS));

/** Sends tickets one by one within Resend's rate limit; returns who failed. */
async function sendAll(queue: Registration[], origin: string) {
	let sent = 0;
	const failed: string[] = [];
	for (const [i, reg] of queue.entries()) {
		if (i > 0) await pause();
		try {
			await emailTicket(reg, origin);
			sent++;
		} catch (e) {
			failed.push(`${reg.fullName} (${emailFailure(e)})`);
		}
	}
	return { sent, failed };
}

function emailFailure(e: unknown) {
	console.error('[admin] email failed', e);
	return e instanceof EmailError ? e.message : 'The email service did not respond.';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const actions: Actions = {
	/** One click from the table. The ticket email waits in the send queue. */
	markPaid: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = String((await request.formData()).get('id') ?? '');
		const reg = await markPaid(id, locals.admin.email);
		if (!reg) return fail(409, { id, message: 'This registration was already marked as paid, or no longer exists.' });
		return { id, success: `Marked ${reg.fullName} as paid. Their ticket is waiting in the email queue.` };
	},

	markPaidMany: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const ids = (await request.formData()).getAll('ids').map(String).slice(0, 500);
		if (!ids.length) return fail(400, { message: 'Select at least one registration.' });
		const changed = await markManyPaid(ids, locals.admin.email);
		if (!changed.length) return fail(409, { message: 'The selected registrations were already paid.' });
		return {
			bulk: true,
			success: `Marked ${plural(changed.length, 'registration')} as paid. Their tickets are waiting in the email queue.`
		};
	},

	/** Emails every paid delegate who has not received their ticket yet. */
	sendTickets: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listUnsentTickets(SEND_BATCH);
		if (!queue.length) return { success: 'Every paid delegate already has their ticket.' };

		const { sent, failed } = await sendAll(queue, publicOrigin(url));
		const { ticketsToSend: left } = await getStats();
		const parts = [`Sent ${plural(sent, 'ticket')}.`];
		if (left > 0) parts.push(`${plural(left, 'ticket')} still waiting: click Send again to continue.`);
		if (failed.length) {
			return fail(502, { message: `${parts.join(' ')} Failed: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}` });
		}
		return { success: parts.join(' ') };
	},

	/** Asks Resend whether sent tickets arrived, bounced or are still on their way. */
	checkDelivery: async ({ locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listEmailsToCheck(CHECK_BATCH);
		if (!queue.length) return { quiet: true, success: 'Every sent ticket has a final delivery status.' };

		const tally = { delivered: 0, failed: 0, sent: 0 };
		for (const [i, reg] of queue.entries()) {
			if (i > 0) await pause();
			try {
				const event = await fetchEmailEvent(reg.ticketEmailId!);
				const status = emailStatusFor(event);
				await recordEmailEvent(reg.id, event, status);
				tally[status]++;
			} catch (e) {
				// A key without Full access fails every lookup: stop and say so once.
				return fail(502, { message: `Could not check delivery: ${emailFailure(e)}` });
			}
		}
		const parts = [`Checked ${plural(queue.length, 'ticket email')}: ${tally.delivered} delivered`];
		if (tally.failed) parts.push(`${tally.failed} failed`);
		if (tally.sent) parts.push(`${tally.sent} still on the way`);
		return { quiet: true, success: `${parts.join(', ')}.` };
	},

	/** Sends the ticket again to everyone whose last ticket email bounced or failed. */
	resendFailed: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const queue = await listFailedTickets(SEND_BATCH);
		if (!queue.length) return { success: 'No ticket emails have failed.' };
		const { sent, failed } = await sendAll(queue, publicOrigin(url));
		const { email } = await getStats();
		const parts = [`Resent ${plural(sent, 'ticket')}. Check delivery again in a minute.`];
		if (email.failed > 0) parts.push(`${plural(email.failed, 'failed email')} left: click again to continue.`);
		if (failed.length) {
			return fail(502, { message: `${parts.join(' ')} Failed: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}` });
		}
		return { success: parts.join(' ') };
	},

	/**
	 * A walk-in's pass, made at the help desk: name, designation, company, ticket, the
	 * amount received and an optional UPI reference. Added as paid; the dashboard then
	 * prints their label.
	 */
	createWalkIn: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { walkIn: true, message: 'Sign in again.' });
		const form = await request.formData();
		const payment = await getPaymentSettings();
		const prices = { delegate: priceFor(payment, 'delegate'), visitor: priceFor(payment, 'visitor') };
		const read = readWalkIn(
			{
				fullName: form.get('fullName'),
				designation: form.get('designation'),
				companyName: form.get('companyName'),
				ticketType: form.get('ticketType'),
				amountRupees: form.get('amountRupees'),
				upiTxnId: form.get('upiTxnId')
			},
			prices
		);
		if (!read.ok) return fail(400, { walkIn: true, errors: read.errors, message: 'Check the highlighted fields.' });

		const result = await createWalkIn(read.input, prices[read.input.ticketType], locals.admin.email);
		if (!result.ok) {
			const message = 'That UPI reference ID is already on another registration or stall booking.';
			return fail(409, { walkIn: true, errors: { upiTxnId: message }, message });
		}
		const reg = result.registration;
		if (isDatabaseConfigured && (await opsReady())) {
			const event = await getDefaultEvent();
			await audit({
				eventId: event.id,
				actorType: 'admin',
				actor: locals.admin.email,
				action: 'registration.walk-in',
				targetType: 'registration',
				targetId: reg.id,
				details: { code: reg.code, ticketType: reg.ticketType, amountRupees: reg.amountRupees, upiTxnId: reg.upiTxnId }
			});
		}
		console.info(`[admin] ${locals.admin.email} added walk-in ${reg.code} (${reg.fullName})`);
		const paid = reg.amountRupees > 0 ? `${formatRupees(reg.amountRupees)} received` : 'complimentary';
		return {
			id: reg.id,
			walkIn: true,
			print: form.get('print') === 'on',
			success: `Added ${reg.fullName} as a walk-in ${TICKET_LABEL[reg.ticketType]} (${reg.code}), ${paid}.`
		};
	},

	/** Enter or correct the UPI transaction ID on a registration. */
	setUtr: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const utr = normaliseUtr(String(form.get('utr') ?? ''));
		if (!utr) return fail(400, { id, utrError: true, message: 'Enter the 12-digit UPI transaction ID.' });
		const prev = await getRegistration(id);
		const result = await setUpiTxnId(id, utr);
		if (!result.ok) {
			return result.reason === 'utr_used'
				? fail(409, { id, utrError: true, message: 'That UPI transaction ID is already on another registration or stall booking.' })
				: fail(404, { id, message: 'This registration no longer exists.' });
		}
		const reg = result.registration;
		if (isDatabaseConfigured && (await opsReady())) {
			const event = await getDefaultEvent();
			await audit({
				eventId: event.id,
				actorType: 'admin',
				actor: locals.admin.email,
				action: 'registration.utr',
				targetType: 'registration',
				targetId: reg.id,
				details: { code: reg.code, from: prev?.upiTxnId ?? null, to: utr }
			});
		}
		return { id, success: `Saved UPI transaction ID ${utr} for ${reg.fullName}.` };
	},

	reject: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const reason = String(form.get('reason') ?? '').trim().slice(0, 300);
		const reg = await markRejected(id, locals.admin.email, reason);
		if (!reg) return fail(409, { id, message: 'Paid registrations cannot be rejected.' });
		try {
			await sendRejectionEmail(reg, reason);
		} catch (e) {
			return fail(502, { id, message: `Rejected, but the email to the delegate failed: ${emailFailure(e)}` });
		}
		return { id, success: `Rejected the payment from ${reg.fullName} and let them know by email.` };
	},

	/** Every ID card front was redrawn with the current schedule: hide the reminder. */
	frontsRedrawn: async ({ locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		await setFrontsOutdated(null, locals.admin.email);
		return { success: 'Every ID card front now shows the current event date and time.' };
	},

	/** Deletes a registration and its photo, poster and ID card back. Cannot be undone. */
	delete: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const reg = await deleteRegistration(id);
		if (!reg) return fail(404, { message: 'This registration no longer exists.' });
		console.info(`[admin] ${locals.admin.email} deleted registration ${reg.code} (${reg.email})`);
		const keys = [reg.photoKey, reg.posterKey, reg.ticketBackKey, reg.postKey].filter((k): k is string => !!k);
		const left = await Promise.allSettled(keys.map((k) => deleteObject(k)));
		const kept = left.filter((r) => r.status === 'rejected').length;
		return {
			deleted: true,
			success: `Deleted ${reg.fullName} (${reg.code}).${kept ? ` ${plural(kept, 'stored image')} could not be removed from storage.` : ''}`
		};
	},

	/** Emails the QR pass to delegates whose ticket went out before passes existed. */
	sendPasses: async ({ locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const { ids } = await passesToSend(SEND_BATCH);
		if (!ids.length) return { success: 'Every delegate with a ticket has their event pass.' };
		let sent = 0;
		const failed: string[] = [];
		for (const [i, id] of ids.entries()) {
			if (i > 0) await pause();
			const reg = await getRegistration(id);
			if (!reg) continue;
			try {
				const pass = await passEmailFor(reg, publicOrigin(url));
				if (!pass) return fail(503, { message: 'Event passes need DATABASE_URL and PASS_SECRET.' });
				await sendPassEmail(reg, pass, (await cardImages(reg)).back);
				await markPassEmailed(reg.id);
				sent++;
			} catch (e) {
				failed.push(`${reg.fullName} (${emailFailure(e)})`);
			}
		}
		const { total: left } = await passesToSend(1);
		const parts = [`Sent ${plural(sent, 'event pass', 'event passes')}.`];
		if (left > 0) parts.push(`${plural(left, 'pass', 'passes')} still waiting: click again to continue.`);
		if (failed.length) return fail(502, { message: `${parts.join(' ')} Failed: ${failed.slice(0, 3).join('; ')}` });
		return { success: parts.join(' ') };
	},

	resend: async ({ request, locals, url }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		const id = String((await request.formData()).get('id') ?? '');
		const reg = await getRegistration(id);
		if (!reg || reg.status !== 'paid') return fail(409, { id, message: 'Only paid registrations have a ticket to send.' });
		if (!reg.email) return fail(409, { id, message: `${reg.fullName} is a walk-in with no email address: print their label instead.` });
		try {
			await emailTicket(reg, publicOrigin(url));
		} catch (e) {
			return fail(502, { id, message: `The ticket email failed: ${emailFailure(e)}` });
		}
		return { id, success: `Sent the ticket to ${reg.email}.` };
	},

	/** Visitors directory switches for one delegate. Organisers can't read messages. */
	directoryFlags: async ({ request, locals }) => {
		if (!locals.admin) return fail(401, { message: 'Sign in again.' });
		if (!(await directoryReady())) return fail(503, { message: 'Run db/schema.sql first: the visitors directory tables are missing.' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const reg = await getRegistration(id);
		if (!reg) return fail(404, { id, message: 'This registration no longer exists.' });
		const event = await getDefaultEvent();
		await setAdminFlags(event.id, reg.id, { adminHidden: form.get('hide') === 'on', adminMessagesOff: form.get('stop') === 'on' }, locals.admin.email);
		return { id, success: `Saved the visitors directory switches for ${reg.fullName}.` };
	},

	logout: async ({ cookies }) => {
		cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_PATH });
		cookies.delete(SESSION_COOKIE, { path: '/admin' });
		redirect(303, '/login');
	}
};
