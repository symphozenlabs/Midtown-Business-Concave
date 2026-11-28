<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		BadgeCheck,
		CalendarClock,
		CheckCheck,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ChevronsDownUp,
		ChevronsUpDown,
		CircleAlert,
		Clock,
		Copy,
		Download,
		FileSpreadsheet,
		IndianRupee,
		ListChecks,
		LoaderCircle,
		Mail,
		MailCheck,
		MailWarning,
		Mails,
		MailX,
		Pencil,
		Printer,
		QrCode,
		RefreshCw,
		Search,
		Send,
		Trash2,
		UserPlus,
		X
	} from '@lucide/svelte';
	import OpsDialog from '#lib/components/ops/OpsDialog.svelte';
	import { eventLabels, type EventSettings } from '#lib/event-settings.ts';
	import { INTERESTS } from '#lib/registration.ts';
	import { formatRupees, TICKET_LABEL, TICKET_TYPES } from '#lib/payment.ts';
	import { COMPLIMENTARY, WALK_IN_LIMITS, type WalkInErrors } from '#lib/walk-in.ts';
	import { CONTACT_FILTERS, SEGMENTS, UPI_FILTERS, type ContactFilter, type Segment, type UpiFilter } from '#lib/segments.ts';

	let { data, form } = $props();

	type Status = 'pending_payment' | 'payment_submitted' | 'paid' | 'rejected';

	const TABS: { value: Status | 'all'; label: string }[] = [
		{ value: 'payment_submitted', label: 'Needs review' },
		{ value: 'pending_payment', label: 'Awaiting payment' },
		{ value: 'paid', label: 'Paid' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'all', label: 'All' }
	];

	const STATUS_LABEL: Record<Status, string> = {
		payment_submitted: 'Needs review',
		pending_payment: 'Awaiting payment',
		paid: 'Paid',
		rejected: 'Rejected'
	};

	type EmailState = 'not_sent' | 'sent' | 'delivered' | 'failed';

	const EMAIL_TABS: { value: EmailState | 'all'; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'failed', label: 'Failed' },
		{ value: 'not_sent', label: 'Not sent' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'delivered', label: 'Delivered' }
	];

	const EMAIL_LABEL: Record<EmailState, string> = {
		not_sent: 'Not sent',
		sent: 'Sent',
		delivered: 'Delivered',
		failed: 'Failed'
	};

	/** Resend events, in words for the line under the email pill. */
	const EVENT_LABEL: Record<string, string> = {
		bounced: 'Bounced',
		complained: 'Marked as spam',
		failed: 'Could not be sent',
		suppressed: 'Address suppressed',
		canceled: 'Cancelled',
		delivery_delayed: 'Delivery delayed'
	};

	const emailState = (r: { ticketEmailedAt: string | null; ticketEmailStatus: string | null }): EmailState =>
		!r.ticketEmailedAt ? 'not_sent' : ((r.ticketEmailStatus as EmailState | null) ?? 'sent');

	const open = new SvelteSet<string>();
	const selected = new SvelteSet<string>();
	let selecting = $state(false);
	let rejecting = $state<string | null>(null);
	// The row whose delete is waiting for confirmation.
	let deleting = $state<string | null>(null);
	// Which control is working: a row id, 'bulk', 'send', 'passes', 'check' or 'resendFailed'.
	let busy = $state<string | null>(null);
	let copied = $state<string | null>(null);

	const registrations = $derived(data.available ? data.registrations : []);
	const total = $derived(data.available ? Object.values(data.stats.counts).reduce((a, b) => a + b, 0) : 0);
	const toSend = $derived(data.available ? data.stats.ticketsToSend : 0);
	const failedEmails = $derived(data.available ? data.stats.email.failed : 0);
	const inFlight = $derived(data.available ? data.stats.email.sent : 0);
	const paidTotal = $derived(data.available ? data.stats.counts.paid : 0);
	const allOpen = $derived(registrations.length > 0 && registrations.every((r) => open.has(r.id)));

	// Only unpaid registrations can be selected for "Mark as paid".
	const selectable = $derived(registrations.filter((r) => r.status !== 'paid'));
	const allSelected = $derived(selectable.length > 0 && selectable.every((r) => selected.has(r.id)));
	const someSelected = $derived(selected.size > 0 && !allSelected);
	const columns = $derived(selecting ? 9 : 8);

	// Drop selections that left the list (filtered away or now paid).
	$effect(() => {
		const ids = new Set(selectable.map((r) => r.id));
		for (const id of selected) if (!ids.has(id)) selected.delete(id);
	});

	const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
	const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)) : '');
	const interestLabel = (v: string) => INTERESTS.find((i) => i.value === v)?.label ?? v;
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const media = (key: string | null) => (key ? `/admin/media/${key}` : '');

	/*
	 * Regenerate an ID card front: this browser redraws the poster from the stored
	 * photo and the framing the delegate chose, and replaces the stored one. For a card
	 * whose photo was dragged out of the arch before the drag was limited.
	 */
	let frontState = $state<Record<string, string>>({});
	// Bumped after a redraw so the thumbnail is fetched again instead of from the cache.
	let frontVersion = $state<Record<string, number>>({});

	type FrontJob = Pick<
		(typeof registrations)[number],
		'id' | 'code' | 'fullName' | 'designation' | 'companyName' | 'industry' | 'photoKey' | 'posterFraming'
	>;

	/** Draws one delegate's front with the saved schedule and replaces the stored one. */
	async function drawFront(r: FrontJob, event: EventSettings | null) {
		const { isRunawayFraming, renderPosterFile } = await import('#lib/poster/renderer.ts');
		const saved = r.posterFraming ?? { zoom: 1, dx: 0, dy: 0 };
		// A photo dragged out of the arch was saved at the limits: start from the centre instead.
		const framing = isRunawayFraming(saved) ? { zoom: saved.zoom, dx: 0, dy: 0 } : saved;
		const blob = await renderPosterFile({
			name: r.fullName,
			title: r.designation,
			company: r.companyName,
			category: r.industry,
			photoUrl: media(r.photoKey),
			zoom: framing.zoom,
			dx: framing.dx,
			dy: framing.dy,
			event
		});
		const res = await fetch(`/admin/card-front/${r.id}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
		if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Upload failed (${res.status})`);
		frontVersion[r.id] = Date.now();
	}

	async function regenerateFront(r: FrontJob) {
		if (!r.photoKey) {
			frontState[r.id] = 'No photo stored for this delegate.';
			return;
		}
		frontState[r.id] = 'busy';
		try {
			await drawFront(r, data.available ? data.event : null);
			frontState[r.id] = 'done';
		} catch (e) {
			console.error('[admin] could not regenerate the ID card front', r.code, e);
			frontState[r.id] = e instanceof Error && e.message ? e.message : 'Could not redraw the front.';
		}
	}

	/* After the event date or time changed: redraw every delegate's front, one at a time. */
	let redrawAll = $state<{ done: number; total: number; failed: string[]; running: boolean } | null>(null);

	async function redrawAllFronts() {
		if (redrawAll?.running) return;
		redrawAll = { done: 0, total: 0, failed: [], running: true };
		try {
			const res = await fetch('/admin/card-front');
			if (!res.ok) throw new Error(`Could not list the ID cards (${res.status})`);
			const { event, jobs } = (await res.json()) as { event: EventSettings; jobs: FrontJob[] };
			redrawAll.total = jobs.length;
			for (const job of jobs) {
				try {
					await drawFront(job, event);
				} catch (e) {
					console.error('[admin] could not redraw the ID card front', job.code, e);
					redrawAll.failed.push(job.code);
				}
				redrawAll.done++;
			}
			if (!redrawAll.failed.length) {
				await fetch(act('frontsRedrawn'), { method: 'POST', body: new FormData(), headers: { 'x-sveltekit-action': 'true' } });
			}
			await invalidateAll();
		} catch (e) {
			redrawAll.failed.push(e instanceof Error ? e.message : 'Could not redraw the ID cards.');
		} finally {
			redrawAll.running = false;
		}
	}

	/**
	 * Searches as you type (after a short pause), and resets the list the moment the box
	 * is emptied, by backspace or the × button, without waiting for Enter.
	 */
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let searchInput: HTMLInputElement | undefined = $state();
	let query = $state('');
	// Follow the URL (tabs, back button), but never overwrite what is being typed.
	$effect(() => {
		const q = data.available ? data.filter.q : '';
		if (document.activeElement !== searchInput && !refocusSearch) query = q;
	});
	/** Set when the search box submitted itself, so typing can carry on after the results load. */
	let refocusSearch = false;
	function onSearchInput() {
		clearTimeout(searchTimer);
		const form = searchInput?.form;
		if (query.trim() === (data.available ? data.filter.q : '')) return;
		searchTimer = setTimeout(() => {
			refocusSearch = true;
			form?.requestSubmit();
		}, query.trim() ? 400 : 0);
	}
	afterNavigate(() => {
		if (!refocusSearch || !searchInput) return;
		refocusSearch = false;
		searchInput.focus();
		const end = searchInput.value.length;
		searchInput.setSelectionRange(end, end);
	});

	type TableFilter = {
		status: Status | 'all';
		q: string;
		email: EmailState | 'all';
		segment: Segment;
		contact: ContactFilter;
		upi: UpiFilter;
		amount: number | null;
	};

	/** The current tab, filters and search with some of them changed, as a link. Changing a filter starts at page 1. */
	function hrefWith(change: Partial<TableFilter> = {}) {
		if (!data.available) return '?';
		const f = { ...(data.filter as TableFilter), ...change };
		const p = new URLSearchParams({ status: f.status });
		if (f.email !== 'all') p.set('email', f.email);
		if (f.segment !== 'all') p.set('segment', f.segment);
		if (f.contact !== 'all') p.set('contact', f.contact);
		if (f.upi !== 'all') p.set('upi', f.upi);
		if (f.amount != null) p.set('amount', String(f.amount));
		if (f.q) p.set('q', f.q);
		return `?${p}`;
	}

	// The current tab, filters and search, as query parameters.
	const filterQuery = $derived(data.available ? hrefWith().slice(1) : '');
	const filtering = $derived(
		data.available &&
			(data.filter.segment !== 'all' || data.filter.contact !== 'all' || data.filter.upi !== 'all' || data.filter.amount != null || data.filter.email !== 'all')
	);
	const clearFilters = () => hrefWith({ segment: 'all', contact: 'all', upi: 'all', amount: null, email: 'all' });
	const pickFilter = (change: Partial<TableFilter>) => goto(hrefWith(change), { reset: false });

	// Actions keep the current tab, search and page, so the list does not jump after a click.
	const keep = $derived(
		data.available ? `&${filterQuery}${data.pagination.page > 1 ? `&page=${data.pagination.page}` : ''}` : ''
	);

	/* Pagination: the table shows one page of the matching registrations at a time. */
	const pageHref = (n: number) => `?${filterQuery}${n > 1 ? `&page=${n}` : ''}`;
	/** Page numbers to offer: the first, the last, and two either side of the current one; null marks a gap. */
	const pageList = $derived.by(() => {
		if (!data.available) return [];
		const { page, pages } = data.pagination;
		const list: (number | null)[] = [];
		for (let n = 1; n <= pages; n++) {
			if (n === 1 || n === pages || Math.abs(n - page) <= 2) list.push(n);
			else if (list.at(-1) !== null) list.push(null);
		}
		return list;
	});
	const shown = $derived.by(() => {
		if (!data.available) return { from: 0, to: 0 };
		const { page, pageSize } = data.pagination;
		const from = (page - 1) * pageSize + 1;
		return { from, to: from + registrations.length - 1 };
	});
	const act = (name: string) => `?/${name}${keep}`;

	function toggle(id: string) {
		if (open.has(id)) open.delete(id);
		else open.add(id);
	}

	function toggleAll() {
		if (allOpen) open.clear();
		else for (const r of registrations) open.add(r.id);
	}

	function toggleSelecting() {
		selecting = !selecting;
		if (!selecting) selected.clear();
	}

	function selectAll() {
		if (allSelected) selected.clear();
		else for (const r of selectable) selected.add(r.id);
	}

	function pick(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function startReject(id: string) {
		rejecting = rejecting === id ? null : id;
		open.add(id);
	}

	// The row whose UPI transaction ID is being entered or corrected.
	let editingUtr = $state<string | null>(null);
	// The row whose last UPI save was refused, so its field shows the error.
	const utrErrorId = $derived.by(() => {
		const f = form as { utrError?: boolean; id?: string } | null;
		return f?.utrError ? (f.id ?? null) : null;
	});

	function startUtr(id: string) {
		editingUtr = editingUtr === id ? null : id;
		open.add(id);
	}

	/*
	 * Print label: one person's 75 x 50 mm name-and-QR label for the label printer. The
	 * label page loads in a hidden frame and its print dialog opens. Cmd- or Ctrl-click
	 * opens the label in a tab instead.
	 */
	let label = $state<{ id: string; error: string | null } | null>(null);
	let labelFrame: HTMLIFrameElement | null = null;
	$effect(() => () => labelFrame?.remove());

	function printLabel(e: MouseEvent, id: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		printLabelFor(id);
	}

	async function printLabelFor(id: string) {
		if (label && !label.error) return;
		label = { id, error: null };
		try {
			// An expired sign-in redirects to /login: say so rather than print the sign-in page.
			const res = await fetch(`/admin/qr-labels/${id}`, { headers: { accept: 'application/json' }, redirect: 'manual' });
			if (res.type === 'opaqueredirect') throw new Error('Your sign-in has expired. Reload the page and sign in again.');
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Could not load the label (${res.status}).`);
			const html = await res.text();
			// The previous label's frame stays until now: removing it while its print dialog is open can cancel the print.
			labelFrame?.remove();
			const frame = document.createElement('iframe');
			frame.title = 'Label to print';
			frame.tabIndex = -1;
			frame.setAttribute('aria-hidden', 'true');
			frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:320mm;height:220mm;border:0';
			const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
			frame.srcdoc = html;
			document.body.append(frame);
			labelFrame = frame;
			await loaded;
			const win = frame.contentWindow as (Window & { labelReady?: Promise<unknown> }) | null;
			if (!win?.labelReady) throw new Error('Could not open the label.');
			await win.labelReady;
			label = null;
			win.focus();
			win.print();
		} catch (err) {
			console.error('[admin] could not print the label', err);
			label = { id, error: err instanceof Error && err.message ? err.message : 'Could not print the label.' };
		}
	}

	/*
	 * Walk-in: a pass made at the help desk for someone registering on the day. Name,
	 * designation, company and ticket only; it is added as paid and its label printed.
	 */
	type WalkInFeedback = { walkIn?: boolean; errors?: WalkInErrors; message?: string } | null;
	let walkInOpen = $state(false);
	let walkInSaving = $state(false);
	let walkInName: HTMLInputElement | undefined = $state();
	// A failed attempt's errors belong to it; opening the form again starts clean.
	let walkInDismissed = $state<unknown>(null);
	const walkInFeedback = $derived(form !== walkInDismissed && (form as WalkInFeedback)?.walkIn ? (form as WalkInFeedback) : null);

	// The ticket chosen and the amount received; choosing a ticket fills in its full price.
	let walkInDraft = $state<{ ticketType: '' | (typeof TICKET_TYPES)[number] | typeof COMPLIMENTARY; amountRupees: string }>({
		ticketType: '',
		amountRupees: ''
	});

	function openWalkIn() {
		walkInDismissed = form;
		walkInDraft = { ticketType: '', amountRupees: '' };
		walkInOpen = true;
		requestAnimationFrame(() => walkInName?.focus());
	}

	function chooseWalkInTicket(t: (typeof TICKET_TYPES)[number]) {
		walkInDraft.ticketType = t;
		if (data.available) walkInDraft.amountRupees = String(data.prices[t]);
	}

	const addWalkIn: SubmitFunction = () => {
		walkInSaving = true;
		return async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			walkInSaving = false;
			if (result.type !== 'success') return;
			walkInOpen = false;
			const created = result.data as { id?: string; print?: boolean } | undefined;
			if (created?.id && created.print) printLabelFor(created.id);
		};
	};

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join('')
			.toUpperCase();

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = copied === key ? null : copied), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	const search = $derived(data.available && data.filter.q ? `&q=${encodeURIComponent(data.filter.q)}` : '');
	const segmentHref = (value: Segment) => hrefWith({ segment: value });
	// Only paid registrations get a ticket email, so picking one moves to the Paid tab.
	const emailHref = (value: EmailState | 'all') => (value === 'all' ? hrefWith({ email: 'all' }) : hrefWith({ status: 'paid', email: value }));

	/*
	 * ID card backs: once a payment is confirmed, this browser draws the back (QR and
	 * details, same artwork as the front) and uploads it, before tickets go out.
	 */
	let backs = $state<{ done: number; total: number; failed: number } | null>(null);
	const backsPending = $derived(data.available ? data.cardBacks.length : 0);
	$effect(() => {
		if (!data.available || !data.cardBacks.length || backs) return;
		const jobs = data.cardBacks;
		backs = { done: 0, total: jobs.length, failed: 0 };
		(async () => {
			const { renderBackFile } = await import('#lib/poster/renderer.ts');
			for (const job of jobs) {
				try {
					const blob = await renderBackFile({
						code: job.code,
						qrText: job.qrText,
						event: data.available ? data.event : null,
						ticketType: job.ticketType
					});
					const res = await fetch(`/admin/card-back/${job.id}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
					if (!res.ok) throw new Error(`${res.status}`);
					backs!.done++;
				} catch (e) {
					console.error('[admin] ID card back failed', job.code, e);
					backs!.failed++;
				}
			}
			const failed = backs!.failed;
			await invalidateAll();
			// Stop retrying in a loop when something keeps failing; a reload tries again.
			backs = failed ? { done: 0, total: 0, failed } : null;
		})();
	});

	/*
	 * Square posts: this browser cuts each paid delegate's 1:1 Instagram post from
	 * their stored ID card front and uploads it, so the ticket email carries it.
	 */
	let posts = $state<{ done: number; total: number; failed: number } | null>(null);
	$effect(() => {
		if (!data.available || !data.cardPosts.length || posts) return;
		const jobs = data.cardPosts;
		posts = { done: 0, total: jobs.length, failed: 0 };
		(async () => {
			const { renderPostFromFront } = await import('#lib/poster/renderer.ts');
			for (const job of jobs) {
				try {
					// A fresh URL, so a front redrawn in this session is not read from the image cache.
					const blob = await renderPostFromFront(`${media(job.posterKey)}?v=${Date.now()}`);
					const res = await fetch(`/admin/card-post/${job.id}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
					if (!res.ok) throw new Error(`${res.status}`);
					posts!.done++;
				} catch (e) {
					console.error('[admin] square post failed', job.code, e);
					posts!.failed++;
				}
			}
			const failed = posts!.failed;
			await invalidateAll();
			// Stop retrying in a loop when something keeps failing; a reload tries again.
			posts = failed ? { done: 0, total: 0, failed } : null;
		})();
	});

	/** ID card backs and square posts still being made; tickets wait for them. */
	const preparing = $derived.by(() => {
		const total = (backs?.total ?? 0) + (posts?.total ?? 0);
		const done = (backs ? backs.done + backs.failed : 0) + (posts ? posts.done + posts.failed : 0);
		return total > 0 ? { done, total } : null;
	});

	// Opening the dashboard quietly asks Resend about emails still on their way.
	onMount(() => {
		if (!inFlight) return;
		busy = 'check';
		fetch(act('checkDelivery'), {
			method: 'POST',
			body: new FormData(),
			headers: { 'x-sveltekit-action': 'true' }
		})
			.then(() => invalidateAll())
			.catch(() => {})
			.finally(() => {
				if (busy === 'check') busy = null;
			});
	});

	type Update = (o?: { reset?: boolean }) => Promise<void>;

	function working(key: string, after?: (ok: boolean) => void) {
		return () => {
			busy = key;
			return async ({ result, update }: { result: { type: string }; update: Update }) => {
				await update({ reset: false });
				busy = null;
				rejecting = null;
				deleting = null;
				after?.(result.type === 'success');
			};
		};
	}
</script>

<svelte:head>
	<title>Dashboard · Admin · Midtown Business Conclave</title>
</svelte:head>

{#if !data.configured.database || !data.configured.storage}
	<div class="banner warn" role="status">
		<CircleAlert size={16} aria-hidden="true" />
		<p>
			{#if data.available}
				Demo mode: Neon or R2 is not configured, so registrations are kept in memory and disappear when the dev
				server restarts.
			{:else}
				The database is not configured. Set <code>DATABASE_URL</code> and the <code>R2_*</code> variables.
			{/if}
		</p>
	</div>
{/if}
{#if !data.configured.email}
	<div class="banner warn" role="status">
		<Mail size={16} aria-hidden="true" />
		<p>
			Email is not configured: tickets are not sent until <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> are set.
			In development they are printed in the terminal instead.
		</p>
	</div>
{/if}

{#if form?.message && !form?.walkIn}
	<div class="banner error" role="alert">
		<CircleAlert size={16} aria-hidden="true" />
		<p>{form.message}</p>
	</div>
{:else if form?.success}
	<div class="banner ok" role="status">
		<BadgeCheck size={16} aria-hidden="true" />
		<p>{form.success}</p>
	</div>
{/if}

{#if data.available && (data.frontsOutdated || redrawAll)}
	{@const when = eventLabels(data.event)}
	<div class="banner reschedule" role="status">
		<CalendarClock size={18} aria-hidden="true" />
		<div class="reschedule-body">
			{#if redrawAll?.running}
				<p><strong>Redrawing ID cards… {redrawAll.done} of {redrawAll.total || '…'}</strong> Keep this page open until it finishes.</p>
				<span class="reschedule-bar" aria-hidden="true"><span style="width: {redrawAll.total ? (redrawAll.done / redrawAll.total) * 100 : 0}%"></span></span>
			{:else if redrawAll && !redrawAll.failed.length}
				<p><strong>Done: {redrawAll.total} ID card{redrawAll.total === 1 ? '' : 's'} redrawn</strong> with {when.compactDate}, {when.compactTime}.</p>
			{:else if redrawAll?.failed.length}
				<p>
					<strong>{redrawAll.failed.length} could not be redrawn:</strong>
					{redrawAll.failed.slice(0, 6).join(', ')}{redrawAll.failed.length > 6 ? '…' : ''}. Try again.
				</p>
			{:else}
				<p>
					<strong>The event date or time changed.</strong> ID cards already issued still show the old date and time. New
					ones show <strong>{when.compactDate}, {when.compactTime}</strong>.
				</p>
			{/if}
		</div>
		{#if !redrawAll?.running && (!redrawAll || redrawAll.failed.length)}
			<button type="button" class="btn btn-primary btn-sm" onclick={redrawAllFronts}>
				<RefreshCw size={15} aria-hidden="true" /> Redraw all ID cards
			</button>
		{/if}
	</div>
{/if}

{#if data.available}
	<section class="stats" aria-label="Summary">
		<a class="stat attention" href="?status=payment_submitted">
			<span class="label"><Clock size={14} aria-hidden="true" /> Needs review</span>
			<strong>{data.stats.counts.payment_submitted}</strong>
			<span class="hint">UPI IDs to check</span>
		</a>
		<a class="stat" href="?status=pending_payment">
			<span class="label"><QrCode size={14} aria-hidden="true" /> Awaiting payment</span>
			<strong>{data.stats.counts.pending_payment}</strong>
			<span class="hint">Registered, not yet paid</span>
		</a>
		<a class="stat" href="?status=paid">
			<span class="label"><BadgeCheck size={14} aria-hidden="true" /> Paid</span>
			<strong>{data.stats.counts.paid}</strong>
			<span class="hint">of {total} registrations</span>
		</a>
		<div class="stat">
			<span class="label"><IndianRupee size={14} aria-hidden="true" /> Collected</span>
			<strong>{formatRupees(data.stats.collectedRupees)}</strong>
			<span class="hint">Verified payments</span>
		</div>
	</section>

	<section class="panel" aria-labelledby="queue-title">
		<div class="panel-head">
			<h1 id="queue-title">Participants</h1>
			<div class="head-actions">
				<form
					method="get"
					class="search"
					role="search"
					data-sveltekit-keepfocus
					data-sveltekit-noscroll
					data-sveltekit-replacestate
					onsubmit={() => clearTimeout(searchTimer)}
				>
					<input type="hidden" name="status" value={data.filter.status} />
					{#if data.filter.email !== 'all'}<input type="hidden" name="email" value={data.filter.email} />{/if}
					{#if data.filter.segment !== 'all'}<input type="hidden" name="segment" value={data.filter.segment} />{/if}
					{#if data.filter.contact !== 'all'}<input type="hidden" name="contact" value={data.filter.contact} />{/if}
					{#if data.filter.upi !== 'all'}<input type="hidden" name="upi" value={data.filter.upi} />{/if}
					{#if data.filter.amount != null}<input type="hidden" name="amount" value={data.filter.amount} />{/if}
					<Search size={15} aria-hidden="true" />
					<input
						type="search"
						name="q"
						bind:this={searchInput}
						bind:value={query}
						oninput={onSearchInput}
						autocomplete="off"
						placeholder="Name, email, code or UPI ID"
						aria-label="Search registrations"
					/>
				</form>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					onclick={openWalkIn}
					title="Make a pass for someone registering at the desk, and print their label"
				>
					<UserPlus size={15} aria-hidden="true" /> Walk-in
				</button>
				<OpsDialog
					bind:open={walkInOpen}
					title="Walk-in pass"
					description="For someone registering at the desk. They are added as paid with what they paid, with a QR pass and no email."
				>
					<form method="post" action={act('createWalkIn')} class="ops-form" use:enhance={addWalkIn}>
						{#if walkInFeedback?.message}
							<div class="ops-banner error" role="alert"><CircleAlert size={16} aria-hidden="true" /><p>{walkInFeedback.message}</p></div>
						{/if}
						<label class="ops-label">
							Name <small>As it should print on the label</small>
							<input bind:this={walkInName} name="fullName" maxlength={WALK_IN_LIMITS.fullName} required autocomplete="off" />
							{#if walkInFeedback?.errors?.fullName}<small class="ops-field-error">{walkInFeedback.errors.fullName}</small>{/if}
						</label>
						<label class="ops-label">
							Designation
							<input name="designation" maxlength={WALK_IN_LIMITS.designation} required autocomplete="off" />
							{#if walkInFeedback?.errors?.designation}<small class="ops-field-error">{walkInFeedback.errors.designation}</small>{/if}
						</label>
						<label class="ops-label">
							Company
							<input name="companyName" maxlength={WALK_IN_LIMITS.companyName} required autocomplete="off" />
							{#if walkInFeedback?.errors?.companyName}<small class="ops-field-error">{walkInFeedback.errors.companyName}</small>{/if}
						</label>
						<fieldset class="ticket-choice">
							<legend>Ticket</legend>
							<div class="ticket-options">
								{#each TICKET_TYPES as t (t)}
									<label class="ticket-option">
										<input
											type="radio"
											name="ticketType"
											value={t}
											required
											checked={walkInDraft.ticketType === t}
											onchange={() => chooseWalkInTicket(t)}
										/>
										<span>
											<strong>{TICKET_LABEL[t]}</strong>
											<small>{formatRupees(data.prices[t])}</small>
										</span>
									</label>
								{/each}
								<label class="ticket-option">
									<input
										type="radio"
										name="ticketType"
										value={COMPLIMENTARY}
										required
										checked={walkInDraft.ticketType === COMPLIMENTARY}
										onchange={() => (walkInDraft.ticketType = COMPLIMENTARY)}
									/>
									<span>
										<strong>Complimentary</strong>
										<small>Free Delegate pass</small>
									</span>
								</label>
							</div>
							{#if walkInFeedback?.errors?.ticketType}<small class="ops-field-error">{walkInFeedback.errors.ticketType}</small>{/if}
						</fieldset>
						{#if walkInDraft.ticketType !== COMPLIMENTARY}
						<div class="pair">
							<label class="ops-label">
								Amount received
								<span class="prefixed">
									<span aria-hidden="true">₹</span>
									<input
										name="amountRupees"
										inputmode="decimal"
										autocomplete="off"
										required
										placeholder={walkInDraft.ticketType ? '' : 'Choose the ticket'}
										bind:value={walkInDraft.amountRupees}
									/>
								</span>
								{#if walkInFeedback?.errors?.amountRupees}
									<small class="ops-field-error">{walkInFeedback.errors.amountRupees}</small>
								{:else if walkInDraft.ticketType}
									<small>
										Full price {formatRupees(data.prices[walkInDraft.ticketType])}.
										<button type="button" class="link" onclick={() => (walkInDraft.amountRupees = '0')}>Make it complimentary</button>
									</small>
								{/if}
							</label>
							<label class="ops-label">
								UPI reference ID <small>Optional. Empty for cash</small>
								<input name="upiTxnId" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="12 digits" />
								{#if walkInFeedback?.errors?.upiTxnId}<small class="ops-field-error">{walkInFeedback.errors.upiTxnId}</small>{/if}
							</label>
						</div>
						{/if}
						<label class="ops-check">
							<input type="checkbox" name="print" checked />
							Print the label now
						</label>
						<div class="ops-dialog-actions">
							<button type="button" class="btn btn-ghost btn-sm" onclick={() => (walkInOpen = false)}>Cancel</button>
							<button type="submit" class="btn btn-primary btn-sm" disabled={walkInSaving}>
								{#if walkInSaving}<LoaderCircle size={15} class="spin" aria-hidden="true" /> Adding…{:else}<UserPlus
										size={15}
										aria-hidden="true"
									/> Add walk-in{/if}
							</button>
						</div>
					</form>
				</OpsDialog>
				<form method="post" action={act('checkDelivery')} use:enhance={working('check')}>
					<button
						type="submit"
						class="btn btn-ghost btn-sm"
						disabled={busy === 'check' || paidTotal === 0}
						title="Ask Resend which ticket emails were delivered and which bounced"
					>
						<RefreshCw size={15} class={busy === 'check' ? 'spin' : ''} aria-hidden="true" />
						{busy === 'check' ? 'Checking delivery…' : 'Check delivery'}
					</button>
				</form>
				{#if failedEmails > 0}
					<form method="post" action={act('resendFailed')} use:enhance={working('resendFailed')}>
						<button type="submit" class="btn btn-sm failed-btn" disabled={busy === 'resendFailed'}>
							{#if busy === 'resendFailed'}
								<LoaderCircle size={15} class="spin" aria-hidden="true" /> Resending…
							{:else}
								<MailWarning size={15} aria-hidden="true" /> Resend {plural(failedEmails, 'failed email')}
							{/if}
						</button>
					</form>
				{/if}
				<form method="post" action={act('sendTickets')} use:enhance={working('send')}>
					<button
						type="submit"
						class="btn btn-sm send-btn"
						class:has-queue={toSend > 0}
						disabled={toSend === 0 || busy === 'send' || preparing !== null}
						title={toSend
							? 'Email the ID card (story front, square post and QR pass) to every delegate marked as paid'
							: 'Every paid delegate has their ticket'}
					>
						{#if preparing}
							<LoaderCircle size={15} class="spin" aria-hidden="true" /> Preparing ID cards {Math.min(preparing.done + 1, preparing.total)} of {preparing.total}…
						{:else if busy === 'send'}
							<LoaderCircle size={15} class="spin" aria-hidden="true" /> Sending {plural(toSend, 'email')}…
						{:else if toSend > 0}
							<Mails size={15} aria-hidden="true" />
							<span class="badge">{toSend}</span>
							{toSend === 1 ? 'email' : 'emails'} waiting to be sent
						{:else}
							<MailCheck size={15} aria-hidden="true" /> All tickets sent
						{/if}
					</button>
				</form>
				{#if data.passesToSend > 0}
					<form method="post" action={act('sendPasses')} use:enhance={working('passes')}>
						<button
							type="submit"
							class="btn btn-sm send-btn has-queue"
							disabled={busy === 'passes'}
							title="Email the QR event pass to delegates whose ticket went out without one"
						>
							{#if busy === 'passes'}
								<LoaderCircle size={15} class="spin" aria-hidden="true" /> Sending passes…
							{:else}
								<QrCode size={15} aria-hidden="true" />
								<span class="badge">{data.passesToSend}</span>
								event {data.passesToSend === 1 ? 'pass' : 'passes'} to send
							{/if}
						</button>
					</form>
				{/if}
			</div>
		</div>

		<div class="toolbar">
			<nav class="tabs" aria-label="Filter by status">
				{#each TABS as tab (tab.value)}
					<a
						href={hrefWith({ status: tab.value, email: 'all' })}
						aria-current={data.filter.status === tab.value ? 'page' : undefined}
					>
						{tab.label}
						<span class="count">{tab.value === 'all' ? total : data.stats.counts[tab.value]}</span>
					</a>
				{/each}
			</nav>
			<div class="tool-buttons">
				{#if paidTotal > 0}
					<div
						class="downloads"
						role="group"
						aria-label="Download QR labels"
						title="Every paid Delegate and Visitor with the link their QR opens, for printing labels in OpenLabel"
					>
						<span class="downloads-label"><QrCode size={15} aria-hidden="true" /> QR labels</span>
						<a class="btn btn-ghost btn-sm" href="/admin/qr-labels?format=xlsx" download>
							<FileSpreadsheet size={15} aria-hidden="true" /> Excel
						</a>
						<a class="btn btn-ghost btn-sm" href="/admin/qr-labels?format=csv" download>
							<Download size={15} aria-hidden="true" /> CSV
						</a>
					</div>
				{/if}
				{#if selectable.length > 0}
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						class:active={selecting}
						aria-pressed={selecting}
						onclick={toggleSelecting}
					>
						<ListChecks size={15} aria-hidden="true" />
						{selecting ? 'Done selecting' : 'Select'}
					</button>
				{/if}
				{#if registrations.length > 1}
					<button type="button" class="btn btn-ghost btn-sm" onclick={toggleAll}>
						{#if allOpen}
							<ChevronsDownUp size={15} aria-hidden="true" /> Collapse all
						{:else}
							<ChevronsUpDown size={15} aria-hidden="true" /> Expand all
						{/if}
					</button>
				{/if}
			</div>
		</div>

		<nav class="email-tabs" aria-label="Filter by segment">
			<span class="email-tabs-label">Segment</span>
			{#each SEGMENTS as seg (seg.value)}
				<a
					href={segmentHref(seg.value)}
					class="email-tab"
					aria-current={data.filter.segment === seg.value ? 'page' : undefined}
					data-sveltekit-noscroll
				>
					{seg.label}
					<span class="count">{data.segments[seg.value]}</span>
				</a>
			{/each}
			{#if filtering}<a class="clear-filters" href={clearFilters()} data-sveltekit-noscroll>Clear filters</a>{/if}
		</nav>

		<!-- Only paid delegates get a ticket email, so the filter belongs to Paid and All. -->
		{#if paidTotal > 0 && (data.filter.status === 'paid' || data.filter.status === 'all')}
			<nav class="email-tabs" aria-label="Filter by ticket email">
				<span class="email-tabs-label">Ticket email</span>
				{#each EMAIL_TABS as tab (tab.value)}
					<a
						href={emailHref(tab.value)}
						class="email-tab {tab.value}"
						aria-current={data.filter.email === tab.value ? 'page' : undefined}
					>
						{tab.label}
						<span class="count">{tab.value === 'all' ? paidTotal : data.stats.email[tab.value]}</span>
					</a>
				{/each}
			</nav>
		{/if}

		{#if selecting}
			<div class="bulk-bar" transition:slide={{ duration: 180, easing: cubicOut }}>
				<span>
					{#if selected.size}
						<strong>{selected.size}</strong> selected
					{:else}
						Tick the registrations you have verified.
					{/if}
				</span>
				<form
					method="post"
					action={act('markPaidMany')}
					use:enhance={working('bulk', (ok) => {
						if (ok) {
							selected.clear();
							selecting = false;
						}
					})}
				>
					{#each [...selected] as id (id)}<input type="hidden" name="ids" value={id} />{/each}
					<button type="submit" class="btn btn-paid btn-sm" disabled={selected.size === 0 || busy === 'bulk'}>
						{#if busy === 'bulk'}
							<LoaderCircle size={15} class="spin" aria-hidden="true" /> Marking…
						{:else}
							<CheckCheck size={15} aria-hidden="true" /> Mark {selected.size || ''} as paid
						{/if}
					</button>
				</form>
				{#if selected.size}
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => selected.clear()}>Clear</button>
				{/if}
			</div>
		{/if}

		{#if registrations.length === 0}
			<div class="empty">
				<p>{data.filter.q ? `No registrations match “${data.filter.q}”.` : 'Nothing here yet.'}</p>
			</div>
		{:else}
			<div class="table-wrap">
				<table class="grid">
					<thead>
						<tr>
							{#if selecting}
								<th class="col-check">
									<input
										type="checkbox"
										checked={allSelected}
										indeterminate={someSelected}
										onchange={selectAll}
										aria-label="Select all unpaid registrations"
									/>
								</th>
							{/if}
							<th class="col-toggle"><span class="visually-hidden">Details</span></th>
							{#snippet colFilter(label: string, current: string, shown: string | null, options: { value: string; label: string }[], onpick: (v: string) => void)}
								<div class="th-filter" class:filtered={shown !== null}>
									<span class="th-label">{label} <ChevronDown size={13} aria-hidden="true" /></span>
									{#if shown !== null}<span class="th-chosen">{shown}</span>{/if}
									<select aria-label="Filter by {label}" value={current} onchange={(e) => onpick(e.currentTarget.value)}>
										{#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
									</select>
								</div>
							{/snippet}
							<th>
								{@render colFilter('Registration', data.filter.segment, data.filter.segment === 'all' ? null : SEGMENTS.find((x) => x.value === data.filter.segment)!.label, SEGMENTS, (v) => pickFilter({ segment: v as Segment }))}
							</th>
							<th>
								{@render colFilter('Email', data.filter.contact, data.filter.contact === 'all' ? null : CONTACT_FILTERS.find((x) => x.value === data.filter.contact)!.label, CONTACT_FILTERS, (v) => pickFilter({ contact: v as ContactFilter }))}
							</th>
							<th>
								{@render colFilter('UPI transaction ID', data.filter.upi, data.filter.upi === 'all' ? null : UPI_FILTERS.find((x) => x.value === data.filter.upi)!.label, UPI_FILTERS, (v) => pickFilter({ upi: v as UpiFilter }))}
							</th>
							<th class="col-amount num">
								{@render colFilter('Amount', data.filter.amount == null ? 'all' : String(data.filter.amount), data.filter.amount == null ? null : formatRupees(data.filter.amount), [{ value: 'all', label: 'All amounts' }, ...data.amounts.map((a) => ({ value: String(a), label: formatRupees(a) }))], (v) => pickFilter({ amount: v === 'all' ? null : Number(v) }))}
							</th>
							<th>
								{@render colFilter('Status', data.filter.status, data.filter.status === 'all' ? null : TABS.find((x) => x.value === data.filter.status)!.label, TABS.map((t) => ({ value: t.value, label: t.label })), (v) => pickFilter({ status: v as Status | 'all', email: 'all' }))}
							</th>
							<th>
								{@render colFilter('Ticket email', data.filter.email, data.filter.email === 'all' ? null : EMAIL_TABS.find((x) => x.value === data.filter.email)!.label, EMAIL_TABS, (v) => pickFilter(v === 'all' ? { email: 'all' } : { status: 'paid', email: v as EmailState }))}
							</th>
							<th class="col-actions"><span class="visually-hidden">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each registrations as r (r.id)}
							{@const isOpen = open.has(r.id)}
							{@const isPicked = selected.has(r.id)}
							<tr class="row" class:open={isOpen} class:picked={isPicked} class:highlight={form?.id === r.id}>
								{#if selecting}
									<td class="col-check">
										{#if r.status !== 'paid'}
											<input
												type="checkbox"
												checked={isPicked}
												onchange={() => pick(r.id)}
												aria-label="Select {r.fullName}"
											/>
										{/if}
									</td>
								{/if}
								<td class="col-toggle">
									<button
										type="button"
										class="toggle"
										aria-expanded={isOpen}
										aria-controls="details-{r.id}"
										onclick={() => toggle(r.id)}
									>
										<ChevronDown size={16} aria-hidden="true" />
										<span class="visually-hidden">{isOpen ? 'Hide' : 'Show'} details for {r.fullName}</span>
									</button>
								</td>
								<td class="delegate">
									<div class="person">
										{#if r.photoKey}
											<img class="photo" src={media(r.photoKey)} alt="" width="34" height="34" loading="lazy" />
										{:else}
											<span class="photo initials" aria-hidden="true">{initials(r.fullName)}</span>
										{/if}
										<div class="who">
											<strong>{r.fullName}</strong>
											<span class="mono code"
												>{r.code}{#if r.ticketType === 'visitor'} · <span class="ticket-tag">Visitor</span>{/if}{#if r.walkIn}
													· <span class="ticket-tag">Walk-in</span>{/if}</span
											>
										</div>
									</div>
								</td>
								<td class="email">
									{#if r.email}<a href="mailto:{r.email}">{r.email}</a>{:else}<span class="muted">—</span>{/if}
								</td>
								<td class="utr">
									{#if r.upiTxnId}
										<button type="button" class="copy mono" onclick={() => copy(r.upiTxnId!, r.id)} title="Copy">
											{r.upiTxnId}
											<Copy size={13} aria-hidden="true" />
											<span class="visually-hidden">Copy</span>
										</button>
										{#if copied === r.id}<span class="copied">Copied</span>{/if}
									{:else if r.voucherCode && r.amountRupees === 0}
										<span class="muted">Free (voucher)</span>
									{:else if r.walkIn}
										<span class="muted">{r.amountRupees === 0 ? 'Complimentary' : 'Paid at the desk'}</span>
									{:else}
										<span class="muted">Not entered</span>
									{/if}
									<button
										type="button"
										class="utr-edit"
										onclick={() => startUtr(r.id)}
										title={r.upiTxnId ? 'Edit the UPI transaction ID' : 'Enter the UPI transaction ID'}
									>
										<Pencil size={13} aria-hidden="true" />
										<span class="visually-hidden">{r.upiTxnId ? 'Edit' : 'Enter'} UPI transaction ID for {r.fullName}</span>
									</button>
								</td>
								<td class="col-amount num">
									{formatRupees(r.amountRupees)}
									{#if r.voucherCode}
										<small class="voucher-tag" title="{formatRupees(r.discountRupees)} off with voucher {r.voucherCode}">{r.voucherCode}</small>
									{/if}
								</td>
								<td>
									<span class="status {r.status}">{STATUS_LABEL[r.status as Status]}</span>
								</td>
								<td class="mail">
									{#if r.status === 'paid' && r.walkIn}
										<span class="muted">Walk-in · no email</span>
									{:else if r.status === 'paid'}
										{@const state = emailState(r)}
										<span class="mail-pill {state}">
											<span class="dot" aria-hidden="true"></span>
											{EMAIL_LABEL[state]}
										</span>
										<span class="mail-detail">
											{#if state === 'not_sent'}
												Waiting to send
											{:else if state === 'failed'}
												{EVENT_LABEL[r.ticketEmailEvent ?? ''] ?? 'Not delivered'} · {fmt(r.ticketEmailedAt)}
											{:else if r.ticketEmailEvent === 'delivery_delayed'}
												Delivery delayed · {fmt(r.ticketEmailedAt)}
											{:else}
												{fmt(r.ticketEmailedAt)}
											{/if}
										</span>
									{:else}
										<span class="muted">—</span>
									{/if}
								</td>
								<td class="col-actions">
									<div class="row-actions">
										{#if r.status === 'paid'}
											{@const state = emailState(r)}
											{@const loadingLabel = label?.id === r.id && !label.error}
											<a
												class="btn btn-ghost btn-sm"
												href="/admin/qr-labels/{r.id}"
												target="_blank"
												rel="noopener"
												onclick={(e) => printLabel(e, r.id)}
												aria-busy={loadingLabel}
												title="Print this person’s name and QR label (75 × 50 mm) on the label printer"
											>
												{#if loadingLabel}<LoaderCircle size={15} class="spin" aria-hidden="true" />{:else}<Printer
														size={15}
														aria-hidden="true"
													/>{/if}
												<span class="action-label">Print label</span>
											</a>
											{#if !r.walkIn}
											<form method="post" action={act('resend')} use:enhance={working(r.id)}>
												<input type="hidden" name="id" value={r.id} />
												<button
													class="btn btn-ghost btn-sm"
													class:danger-text={state === 'failed'}
													disabled={busy === r.id}
													title={state === 'not_sent'
														? 'Send this ticket now'
														: state === 'failed'
															? 'The last email did not arrive: send the ticket again'
															: 'Email the ticket again'}
												>
													{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" />{:else if state === 'failed'}<MailX
															size={15}
															aria-hidden="true"
														/>{:else}<Send size={15} aria-hidden="true" />{/if}
													<span class="action-label">{state === 'not_sent' ? 'Send now' : 'Resend'}</span>
												</button>
											</form>
											{/if}
										{:else}
											<form method="post" action={act('markPaid')} use:enhance={working(r.id)}>
												<input type="hidden" name="id" value={r.id} />
												<button class="btn btn-paid btn-sm" disabled={busy === r.id}>
													{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" />{:else}<BadgeCheck
															size={15}
															aria-hidden="true"
														/>{/if}
													<span class="action-label">Mark paid</span>
												</button>
											</form>
											{#if r.status !== 'rejected'}
												<button
													type="button"
													class="btn btn-ghost btn-sm danger-text"
													onclick={() => startReject(r.id)}
													title="Reject this payment"
												>
													<X size={15} aria-hidden="true" /> <span class="action-label">Reject</span>
												</button>
											{/if}
										{/if}
									</div>
									{#if label?.id === r.id && label.error}
										<small class="label-error" role="alert">{label.error}</small>
									{/if}
								</td>
							</tr>
							{#if isOpen}
								<tr class="details" id="details-{r.id}">
									<td colspan={columns}>
										<div class="details-slide" transition:slide={{ duration: 220, easing: cubicOut }}>
											<div class="details-body">
												{#if r.posterKey || r.ticketBackKey}
													<div class="card-sides">
														{#if r.posterKey}
															{@const front = `${media(r.posterKey)}${frontVersion[r.id] ? `?v=${frontVersion[r.id]}` : ''}`}
															<div class="front-side">
																<a href={front} target="_blank" rel="noopener" class="poster">
																	<img src={front} alt="ID card front for {r.fullName}" loading="lazy" width="2160" height="3840" />
																	<span>Front</span>
																</a>
																<button
																	type="button"
																	class="btn btn-ghost btn-sm regen"
																	onclick={() => regenerateFront(r)}
																	disabled={frontState[r.id] === 'busy'}
																	title="Draw the front again from the stored photo, e.g. if the photo is missing"
																>
																	{#if frontState[r.id] === 'busy'}
																		<LoaderCircle size={13} class="spin" aria-hidden="true" /> Drawing…
																	{:else}
																		<RefreshCw size={13} aria-hidden="true" /> Regenerate
																	{/if}
																</button>
																{#if frontState[r.id] === 'done'}
																	<small class="regen-note ok" role="status">Front redrawn</small>
																{:else if frontState[r.id] && frontState[r.id] !== 'busy'}
																	<small class="regen-note bad" role="alert">{frontState[r.id]}</small>
																{/if}
															</div>
														{/if}
														{#if r.status === 'paid'}
															{#if r.ticketBackKey}
																<a href={media(r.ticketBackKey)} target="_blank" rel="noopener" class="poster">
																	<img src={media(r.ticketBackKey)} alt="ID card back (QR) for {r.fullName}" loading="lazy" width="2160" height="3840" />
																	<span>Back</span>
																</a>
															{:else}
																<span class="poster pending-back">Back<br />being prepared</span>
															{/if}
															{#if r.postKey}
																<a href={media(r.postKey)} target="_blank" rel="noopener" class="poster">
																	<img src={media(r.postKey)} alt="Square (1:1) post for {r.fullName}" loading="lazy" width="2160" height="2160" />
																	<span>Post (1:1)</span>
																</a>
															{:else}
																<span class="poster pending-back square">Post (1:1)<br />being prepared</span>
															{/if}
														{/if}
													</div>
												{/if}

												<div class="details-main">
													{#if rejecting === r.id}
														<form method="post" action={act('reject')} use:enhance={working(r.id)} class="reject-form">
															<input type="hidden" name="id" value={r.id} />
															<label>
																<span>Reason (emailed to the delegate)</span>
																<input
																	name="reason"
																	maxlength="300"
																	placeholder="e.g. No payment found with this transaction ID"
																/>
															</label>
															<button class="btn btn-danger btn-sm" disabled={busy === r.id}>
																{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" /> Rejecting…{:else}Reject
																	payment{/if}
															</button>
															<button type="button" class="btn btn-ghost btn-sm" onclick={() => (rejecting = null)}>Cancel</button>
														</form>
													{/if}

													{#if editingUtr === r.id}
														<form
															method="post"
															action={act('setUtr')}
															use:enhance={working(r.id, (ok) => {
																if (ok) editingUtr = null;
															})}
															class="utr-form"
														>
															<input type="hidden" name="id" value={r.id} />
															<label>
																<span>UPI transaction ID (12 digits)</span>
																<!-- svelte-ignore a11y_autofocus -->
																<input
																	name="utr"
																	value={r.upiTxnId ?? ''}
																	inputmode="numeric"
																	autocomplete="off"
																	maxlength="20"
																	placeholder="e.g. 412345678901"
																	required
																	autofocus
																	aria-invalid={utrErrorId === r.id ? 'true' : undefined}
																/>
															</label>
															<button class="btn btn-secondary btn-sm" disabled={busy === r.id}>
																{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" /> Saving…{:else}Save{/if}
															</button>
															<button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingUtr = null)}>Cancel</button>
															{#if utrErrorId === r.id}
																<small class="utr-error" role="alert">{form?.message}</small>
															{/if}
														</form>
													{/if}

													{#if r.status === 'paid'}
														<p class="note">
															<BadgeCheck size={14} aria-hidden="true" />
															{r.walkIn ? 'Walk-in added' : 'Confirmed'} {fmt(r.reviewedAt)}{r.reviewedBy ? ` by ${r.reviewedBy}` : ''}
															{#if r.walkIn}· no email, so print their label{:else if r.ticketEmailedAt}· ticket emailed {fmt(r.ticketEmailedAt)}{#if r.ticketEmailEvent}
																({r.ticketEmailEvent.replace(/_/g, ' ')}{r.ticketEmailCheckedAt
																	? `, checked ${fmt(r.ticketEmailCheckedAt)}`
																	: ''}){/if}{:else}· ticket not emailed yet{/if}
														</p>
													{:else if r.status === 'rejected'}
														<p class="note rejected">
															<X size={14} aria-hidden="true" />
															Rejected {fmt(r.reviewedAt)}{r.reviewedBy ? ` by ${r.reviewedBy}` : ''}{r.rejectionReason
																? `: ${r.rejectionReason}`
																: ''}
														</p>
													{/if}

													<dl class="facts">
														<div><dt>Phone</dt><dd>{#if r.phone}<a href="tel:{r.phone}">{r.phone}</a>{:else}—{/if}</dd></div>
														<div><dt>Designation</dt><dd>{r.designation}</dd></div>
														<div><dt>Company</dt><dd>{r.companyName}</dd></div>
														<div><dt>Industry</dt><dd>{r.industry || '—'}</dd></div>
														<div><dt>About the business</dt><dd>{r.about ?? '—'}</dd></div>
														<div>
															<dt>Website</dt>
															<dd>
																{#if r.website}<a href={r.website} target="_blank" rel="noopener">{r.website}</a>{:else}—{/if}
															</dd>
														</div>
														{#if r.linkedin}
															<div><dt>LinkedIn</dt><dd><a href={r.linkedin} target="_blank" rel="noopener">{r.linkedin}</a></dd></div>
														{/if}
														<div><dt>Travelling from</dt><dd>{r.city || '—'}</dd></div>
														<div><dt>Interested in</dt><dd>{r.interests.map(interestLabel).join(', ') || '—'}</dd></div>
														<div><dt>Heard from</dt><dd>{r.heardFrom ?? '—'}</dd></div>
														<div><dt>WhatsApp updates</dt><dd>{r.whatsappUpdates ? 'Yes' : 'No'}</dd></div>
														<div><dt>Registered</dt><dd>{fmt(r.createdAt)}</dd></div>
														{#if r.paymentSubmittedAt}
															<div><dt>UPI ID submitted</dt><dd>{fmt(r.paymentSubmittedAt)}</dd></div>
														{/if}
														{#if r.voucherCode}
															<div><dt>Voucher</dt><dd>{r.voucherCode} · {formatRupees(r.discountRupees)} off</dd></div>
														{/if}
													</dl>

													{#if r.status === 'paid' && !r.walkIn && data.directoryFlags}
														{@const dir = data.directoryFlags[r.id]}
														<form method="post" action={act('directoryFlags')} use:enhance={working(r.id)} class="dir-flags">
															<input type="hidden" name="id" value={r.id} />
															<strong>Visitors directory</strong>
															<label><input type="checkbox" name="hide" checked={dir?.adminHidden ?? false} /> Hide from directory</label>
															<label><input type="checkbox" name="stop" checked={dir?.adminMessagesOff ?? false} /> Stop messaging</label>
															<button class="btn btn-secondary btn-sm" disabled={busy === r.id}>Save</button>
															<small>For complaints at the venue. Organisers can’t read messages.</small>
														</form>
													{/if}

													<div class="delete-zone">
														{#if deleting === r.id}
															<form method="post" action={act('delete')} use:enhance={working(r.id)} class="delete-confirm">
																<input type="hidden" name="id" value={r.id} />
																<p>
																	<strong>Delete {r.fullName}?</strong> Their details, photo, ID card and desk records
																	are removed for good{r.status === 'paid' ? ', and their QR pass stops working' : ''}. This cannot be undone.
																</p>
																<div class="delete-actions">
																	<button type="button" class="btn btn-ghost btn-sm" onclick={() => (deleting = null)} disabled={busy === r.id}>Cancel</button>
																	<button class="btn btn-danger btn-sm" disabled={busy === r.id}>
																		{#if busy === r.id}<LoaderCircle size={15} class="spin" aria-hidden="true" /> Deleting…{:else}<Trash2 size={15} aria-hidden="true" /> Delete permanently{/if}
																	</button>
																</div>
															</form>
														{:else}
															<button type="button" class="btn btn-ghost btn-sm delete-open" onclick={() => (deleting = r.id)}>
																<Trash2 size={15} aria-hidden="true" /> Delete registration
															</button>
														{/if}
													</div>
												</div>
											</div>
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
			{#if data.pagination.pages > 1}
				<nav class="pager" aria-label="Pages">
					<span class="pager-info">
						Showing <strong>{shown.from}–{shown.to}</strong> of <strong>{data.pagination.total}</strong>
					</span>
					<div class="pager-links">
						{#if data.pagination.page > 1}
							<a class="pager-step" href={pageHref(data.pagination.page - 1)} rel="prev">
								<ChevronLeft size={15} aria-hidden="true" /> Previous
							</a>
						{:else}
							<span class="pager-step" aria-disabled="true"><ChevronLeft size={15} aria-hidden="true" /> Previous</span>
						{/if}
						{#each pageList as n, i (n ?? `gap-${i}`)}
							{#if n === null}
								<span class="pager-gap" aria-hidden="true">…</span>
							{:else}
								<a
									href={pageHref(n)}
									aria-current={n === data.pagination.page ? 'page' : undefined}
									aria-label="Page {n}">{n}</a
								>
							{/if}
						{/each}
						{#if data.pagination.page < data.pagination.pages}
							<a class="pager-step" href={pageHref(data.pagination.page + 1)} rel="next">
								Next <ChevronRight size={15} aria-hidden="true" />
							</a>
						{:else}
							<span class="pager-step" aria-disabled="true">Next <ChevronRight size={15} aria-hidden="true" /></span>
						{/if}
					</div>
				</nav>
			{/if}
		{/if}
	</section>
{/if}

<style>
	.banner {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: 13px;
	}

	.banner :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.banner p {
		color: var(--charcoal);
	}

	.banner.warn {
		background: var(--warning-tint);
		color: var(--warning);
	}

	.banner.error {
		background: var(--danger-tint);
		color: var(--danger);
	}

	.banner.ok {
		background: var(--success-tint);
		color: var(--success);
	}

	/* After a schedule change: hard to miss, with the action right there. */
	.banner.reschedule {
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--gold-ink);
		background: var(--gold-tint);
		color: var(--gold-ink);
		font-size: 14px;
	}

	.reschedule-body {
		display: grid;
		flex: 1;
		gap: var(--space-2);
		min-width: 0;
	}

	.reschedule-bar {
		display: block;
		height: 6px;
		border-radius: 999px;
		background: rgb(138 95 16 / 0.18);
		overflow: hidden;
	}

	.reschedule-bar span {
		display: block;
		height: 100%;
		background: var(--gold-ink);
		transition: width 200ms ease-out;
	}

	@media (max-width: 640px) {
		.banner.reschedule {
			flex-wrap: wrap;
		}
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.stat {
		display: grid;
		gap: 2px;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
		color: inherit;
		text-decoration: none;
	}

	a.stat:hover {
		border-color: var(--control-border);
	}

	.stat .label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-supporting);
	}

	.stat strong {
		font: 600 22px/1.25 var(--font-sans);
		color: var(--charcoal);
		font-variant-numeric: tabular-nums;
	}

	.stat.attention strong {
		color: var(--warning);
	}

	.stat .hint {
		font-size: 12px;
		color: var(--text-supporting);
	}

	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-6) var(--space-6);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
		font-size: 14px;
	}

	.panel-head,
	.toolbar,
	.head-actions,
	.tool-buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.panel-head,
	.toolbar {
		justify-content: space-between;
	}

	.toolbar {
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--rule);
	}

	h1 {
		font: 600 18px/1.3 var(--font-sans);
	}

	.head-actions {
		flex-wrap: nowrap;
	}

	.downloads {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding-right: var(--space-2);
		border-right: 1px solid var(--rule);
	}

	.downloads-label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-right: var(--space-1);
		color: var(--text-supporting);
		font-size: 13px;
		white-space: nowrap;
	}

	.downloads a {
		text-decoration: none;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 280px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		color: var(--text-supporting);
	}

	.search:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.search input {
		flex: 1;
		min-height: 34px;
		border: 0;
		background: none;
		color: var(--charcoal);
		font-size: 14px;
	}

	.search input:focus {
		outline: none;
	}

	.send-btn {
		border-color: var(--control-border);
		background: var(--white);
		color: var(--text-supporting);
	}

	.send-btn.has-queue {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--on-ink);
	}

	.send-btn.has-queue :global(svg) {
		color: var(--gold);
	}

	.send-btn.has-queue:hover:not(:disabled) {
		background: #2b2e28;
	}

	.send-btn:disabled:not(.has-queue) {
		opacity: 1;
	}

	.badge {
		min-width: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--gold);
		color: var(--ink);
		font: 700 12px/18px var(--font-sans);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text-body);
		font: var(--text-ui);
		font-size: 13px;
		text-decoration: none;
	}

	.tabs a:hover {
		background: var(--mist);
	}

	.tabs a[aria-current='page'] {
		background: var(--gold-tint);
		color: var(--charcoal);
		box-shadow: inset 0 -2px 0 var(--gold-ink);
	}

	.count {
		min-width: 20px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--mist);
		font-size: 11px;
		line-height: 18px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.btn-sm {
		min-height: 32px;
		padding-inline: var(--space-3);
		font-size: 13px;
	}

	.active {
		background: var(--gold-tint);
		box-shadow: inset 0 0 0 1px var(--gold-ink);
	}

	.bulk-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--gold-tint);
		font-size: 13px;
		color: var(--charcoal);
	}

	.bulk-bar > span {
		margin-right: auto;
	}

	.empty {
		padding: var(--space-12) var(--space-4);
		text-align: center;
		color: var(--text-supporting);
	}

	/* Table ------------------------------------------------------------- */

	.table-wrap {
		/* Positioned, so visually hidden column labels stay inside the scroller on phones. */
		position: relative;
		min-width: 0;
		overflow-x: auto;
		margin-inline: calc(-1 * var(--space-6));
		padding-inline: var(--space-6);
	}

	.grid {
		width: 100%;
		min-width: 760px;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 13px;
	}

	th {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--rule);
		background: var(--paper);
		color: var(--text-supporting);
		font-size: 12px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}

	th:first-child {
		border-top-left-radius: var(--radius-sm);
	}

	/* Column filters: the heading opens a dropdown; a chosen value shows under it in gold. */
	.th-filter {
		position: relative;
		display: inline-grid;
		justify-items: start;
		gap: 3px;
		padding: 2px 4px;
		margin: -2px -4px;
		border-radius: 6px;
		cursor: pointer;
	}

	.th-label {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		white-space: nowrap;
	}

	.th-label :global(svg) {
		flex: none;
	}

	.th-filter:hover,
	.th-filter:focus-within {
		background: var(--mist);
		color: var(--charcoal);
	}

	.th-filter:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.th-filter select {
		position: absolute;
		inset: 0;
		width: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.th-filter.filtered {
		color: var(--charcoal);
	}

	.th-chosen {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--gold-tint);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gold-ink) 35%, transparent);
		color: var(--gold-ink);
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}

	.clear-filters {
		margin-left: var(--space-2);
		color: var(--gold-ink);
		font-size: 12px;
		font-weight: 600;
	}

	th:last-child {
		border-top-right-radius: var(--radius-sm);
	}

	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--rule);
		color: var(--charcoal);
		vertical-align: middle;
		transition: background-color var(--duration-feedback) var(--ease-out);
	}

	.row:hover td {
		background: color-mix(in srgb, var(--paper) 60%, transparent);
	}

	.row.open td {
		border-bottom-color: transparent;
		background: var(--paper);
	}

	.row.picked td {
		background: var(--gold-tint);
	}

	.row.highlight td:first-child {
		box-shadow: inset 3px 0 0 var(--gold-ink);
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.col-check {
		width: 36px;
		padding-inline: var(--space-3) 0;
	}

	.col-check input {
		display: block;
		width: 16px;
		height: 16px;
		accent-color: var(--gold-ink);
		cursor: pointer;
	}

	.col-toggle {
		width: 36px;
		padding-inline: var(--space-2);
	}

	.col-actions {
		width: 1%;
		white-space: nowrap;
	}

	.toggle {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-supporting);
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--mist);
		color: var(--charcoal);
	}

	.toggle :global(svg) {
		transition: transform 220ms var(--ease-out);
	}

	.toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}

	.delegate {
		min-width: 190px;
	}

	.person {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.who {
		display: grid;
		min-width: 0;
	}

	.who strong {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.code {
		font-size: 11px;
		color: var(--text-supporting);
	}

	.photo {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		object-fit: cover;
		background: var(--mist);
	}

	.email a {
		color: var(--text-body);
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.email a:hover {
		text-decoration: underline;
	}

	.muted {
		color: var(--text-supporting);
		font-size: 12px;
	}

	.voucher-tag {
		display: block;
		color: var(--gold-ink);
		font: 600 11px/1.3 ui-monospace, 'Cascadia Mono', Consolas, monospace;
		letter-spacing: 0.04em;
	}

	.mono {
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		letter-spacing: 0.02em;
	}

	.copy {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--charcoal);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.copy :global(svg) {
		color: var(--gold-ink);
	}

	.copied {
		margin-left: var(--space-2);
		font-size: 12px;
		color: var(--success);
	}

	.status {
		display: inline-block;
		padding: 2px 9px;
		border-radius: 999px;
		font: 600 11px/1.6 var(--font-sans);
		white-space: nowrap;
	}

	.status.payment_submitted {
		background: var(--warning-tint);
		color: var(--warning);
	}

	.status.pending_payment {
		background: var(--mist);
		color: var(--text-supporting);
	}

	.status.paid {
		background: var(--success-tint);
		color: var(--success);
	}

	.status.rejected {
		background: var(--danger-tint);
		color: var(--danger);
	}

	/* Ticket email ---------------------------------------------------- */

	.mail {
		white-space: nowrap;
	}

	.mail-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 1px 9px;
		border: 1px solid transparent;
		border-radius: 999px;
		font: 600 11px/1.7 var(--font-sans);
	}

	.mail-pill .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	.mail-pill.not_sent {
		border-color: var(--rule);
		background: var(--mist);
		color: var(--text-supporting);
	}

	.mail-pill.sent {
		border-color: color-mix(in srgb, var(--gold-ink) 30%, transparent);
		background: var(--gold-tint);
		color: var(--gold-ink);
	}

	.mail-pill.delivered {
		border-color: color-mix(in srgb, var(--success) 30%, transparent);
		background: var(--success-tint);
		color: var(--success);
	}

	.mail-pill.failed {
		border-color: color-mix(in srgb, var(--danger) 30%, transparent);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.mail-detail {
		display: block;
		margin-top: 2px;
		font-size: 11px;
		color: var(--text-supporting);
	}

	.email-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.email-tabs-label {
		margin-right: var(--space-2);
		font-size: 12px;
		font-weight: 600;
		color: var(--text-supporting);
	}

	.email-tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px;
		border: 1px solid var(--rule);
		border-radius: 999px;
		color: var(--text-body);
		font-size: 12px;
		text-decoration: none;
	}

	.email-tab:hover {
		border-color: var(--control-border);
	}

	.email-tab[aria-current='page'] {
		border-color: var(--charcoal);
		background: var(--charcoal);
		color: var(--white);
	}

	.email-tab[aria-current='page'] .count {
		background: rgb(255 255 255 / 0.18);
	}

	.email-tab.failed:not([aria-current='page']) .count {
		background: var(--danger-tint);
		color: var(--danger);
	}

	.failed-btn {
		border-color: color-mix(in srgb, var(--danger) 40%, transparent);
		background: var(--danger-tint);
		color: var(--danger);
	}

	.failed-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--danger-tint) 70%, var(--danger) 10%);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-1);
	}

	.row-actions form {
		display: contents;
	}

	/* A walk-in has no photo: their initials instead. */
	.photo.initials {
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 700;
		color: var(--charcoal);
	}

	/* Walk-in form: Delegate or Visitor, with what they pay. */
	.ticket-choice {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	.ticket-choice legend {
		margin-bottom: var(--space-2);
		padding: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--charcoal);
	}

	.ticket-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-2);
	}

	.ticket-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 48px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		cursor: pointer;
	}

	.ticket-option:has(input:checked) {
		border-color: var(--gold-ink);
		box-shadow: inset 0 0 0 1px var(--gold-ink);
	}

	.ticket-option:has(input:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.ticket-option input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--gold-ink);
	}

	.ticket-option span {
		display: grid;
		line-height: 1.25;
	}

	.ticket-option small {
		font-size: 12px;
		color: var(--text-supporting);
	}

	/* Amount received and UPI reference, side by side (same as the stall booking form). */
	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		align-items: start;
	}

	.prefixed {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.prefixed:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	.prefixed span {
		color: var(--text-supporting);
	}

	/* The shared .ops-label input style would draw a second box inside. */
	:global(.ops-label) .prefixed input {
		flex: 1;
		min-width: 0;
		min-height: 38px;
		padding: 0;
		border: 0;
		background: none;
		font-variant-numeric: tabular-nums;
	}

	:global(.ops-label) .prefixed input:focus {
		outline: none;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--gold-ink);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	@media (max-width: 640px) {
		.pair {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.label-error {
		display: block;
		max-width: 260px;
		margin: 4px 0 0 auto;
		white-space: normal;
		text-align: right;
		font-size: 12px;
		color: var(--danger);
	}

	/* Collapsed details: the inner wrapper animates, the cell carries no padding. */

	.details td {
		padding: 0;
		background: var(--paper);
	}

	.details-slide {
		overflow: hidden;
	}

	.details-body {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-4) var(--space-6);
		margin: 0 var(--space-3) var(--space-3) 48px;
		padding: var(--space-4);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
	}

	.details-body:has(> .details-main:only-child) {
		grid-template-columns: minmax(0, 1fr);
	}

	/* Front and back of the ID card side by side, each its own 110px column. */
	.card-sides {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 110px;
		gap: var(--space-3);
		align-items: start;
	}

	.poster {
		display: grid;
		gap: 4px;
		justify-items: center;
		font-size: 11px;
		color: var(--text-supporting);
		text-decoration: none;
	}

	.poster img {
		width: 110px;
		height: auto;
		border-radius: 6px;
		box-shadow: 0 0 0 1px var(--rule);
	}

	.pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-4);
		font-size: 13px;
		color: var(--text-supporting);
	}

	.pager-info strong {
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
	}

	.pager-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.pager-links a,
	.pager-links span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-width: 32px;
		min-height: 32px;
		padding-inline: var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
		text-decoration: none;
	}

	.pager-links a:hover {
		background: var(--mist);
	}

	.pager-links a[aria-current='page'] {
		background: var(--gold-tint);
		color: var(--charcoal);
		font-weight: 600;
		box-shadow: inset 0 -2px 0 var(--gold-ink);
	}

	.pager-links [aria-disabled='true'] {
		color: var(--text-supporting);
		opacity: 0.5;
	}

	.pager-gap {
		min-width: 20px;
	}

	.pending-back.square {
		aspect-ratio: 1;
	}

	.pending-back {
		display: grid;
		place-items: center;
		width: 110px;
		aspect-ratio: 9 / 16;
		border: 1px dashed var(--rule);
		border-radius: 6px;
		text-align: center;
	}

	.details-main {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3) var(--space-4);
		margin: 0;
	}

	.facts dt {
		font-size: 11px;
		color: var(--text-supporting);
	}

	.facts dd {
		margin: 0;
		color: var(--charcoal);
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.facts a {
		color: var(--gold-ink);
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--success);
	}

	.note.rejected {
		color: var(--danger);
	}

	.reject-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
	}

	.reject-form label {
		display: grid;
		gap: 4px;
		flex: 1 1 280px;
		font-size: 12px;
		color: var(--charcoal);
	}

	.reject-form input {
		min-height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		font-size: 13px;
	}

	.utr-edit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		margin-left: 4px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-supporting);
		cursor: pointer;
		vertical-align: middle;
	}

	.utr-edit:hover {
		background: var(--gold-tint, rgba(0, 0, 0, 0.06));
		color: var(--gold-ink);
	}

	.utr-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
	}

	.utr-form label {
		display: grid;
		gap: 4px;
		flex: 1 1 240px;
		font-size: 12px;
		color: var(--charcoal);
	}

	.utr-form input {
		min-height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--control-border);
		border-radius: var(--radius-sm);
		background: var(--white);
		font: 600 13px ui-monospace, 'Cascadia Mono', Consolas, monospace;
		letter-spacing: 0.04em;
	}

	.utr-form input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.utr-error {
		flex-basis: 100%;
		color: var(--danger);
		font-size: 12px;
	}

	:global(.btn-paid) {
		background: var(--success);
		color: var(--white);
	}

	:global(.btn-paid:hover:not(:disabled)) {
		background: #185759;
	}

	:global(.btn-danger) {
		background: var(--danger);
		color: var(--white);
	}

	.danger-text {
		color: var(--danger);
	}

	.front-side {
		display: grid;
		justify-items: center;
		gap: 2px;
		min-width: 0;
	}

	.regen {
		min-height: 28px;
		padding-inline: var(--space-2);
		font-size: 12px;
	}

	.regen-note {
		font-size: 11px;
		text-align: center;
	}

	.regen-note.ok {
		color: var(--success);
	}

	.regen-note.bad {
		color: var(--danger);
	}

	.dir-flags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
		font-size: 13px;
		color: var(--charcoal);
	}

	.dir-flags label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	.dir-flags input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--gold-ink);
	}

	.dir-flags small {
		flex-basis: 100%;
		color: var(--text-supporting);
		font-size: 12px;
	}

	.delete-zone {
		display: flex;
		justify-content: flex-end;
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
	}

	.delete-open {
		color: var(--danger);
	}

	.delete-open:hover:not(:disabled) {
		background: var(--danger-tint);
	}

	.delete-confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--danger-tint);
	}

	.delete-confirm p {
		flex: 1 1 280px;
		margin: 0;
		font-size: 13px;
		color: var(--charcoal);
	}

	.delete-actions {
		display: flex;
		gap: var(--space-2);
	}

	code {
		font-size: 12px;
	}

	:global(.spin) {
		animation: spin 900ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1100px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.panel {
			padding-inline: var(--space-4);
		}

		.head-actions {
			flex-wrap: wrap;
			width: 100%;
		}

		.search {
			width: 100%;
		}

		.table-wrap {
			margin-inline: calc(-1 * var(--space-4));
			padding-inline: var(--space-4);
		}

		.col-amount,
		.action-label {
			display: none;
		}

		.details-body {
			grid-template-columns: minmax(0, 1fr);
			margin-left: var(--space-3);
		}
	}

	.ticket-tag {
		font-family: inherit;
		font-weight: 600;
		color: var(--gold-ink);
	}
</style>
