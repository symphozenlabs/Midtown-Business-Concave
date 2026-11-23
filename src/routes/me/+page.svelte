<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Award, BadgeCheck, CircleAlert, Mail, MessagesSquare, Phone, ScanQrCode, UserRoundCheck, X } from '@lucide/svelte';
	import { BLOCKER_TEXT } from '#lib/directory/rules.ts';
	import PassQr from '#lib/components/ops/PassQr.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import QrScanner from '#lib/components/ops/QrScanner.svelte';

	let { data, form } = $props();

	let scanning = $state(false);
	let scanError = $state('');

	const incoming = $derived(data.signedIn ? data.connections.filter((c) => c.state === 'incoming') : []);
	const connected = $derived(data.signedIn ? data.connections.filter((c) => c.state === 'connected') : []);
	const requested = $derived(data.signedIn ? data.connections.filter((c) => c.state === 'requested') : []);

	/** Another delegate's QR opens their card, where Connect lives. */
	function onscan(text: string) {
		const m = text.match(/\/pass\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/);
		if (!m) {
			scanError = 'That is not a Midtown Business Conclave pass.';
			return;
		}
		scanning = false;
		goto(`/pass/${m[1]}`);
	}
</script>

<svelte:head>
	<title>My pass · Midtown Business Conclave</title>
</svelte:head>

<PublicShell subtitle="My event pass">
	{#if !data.signedIn}
		<div class="ops-card">
			<span class="ops-eyebrow">My pass</span>
			<h1 class="ops-title">Open your pass from your email</h1>
			{#if data.invalidLink}
				<div class="ops-banner error" role="alert">
					<CircleAlert size={18} aria-hidden="true" />
					<p>That link is no longer valid. Use the link in your most recent ticket or pass email.</p>
				</div>
			{/if}
			<p class="ops-sub">
				Your ticket email has an <strong>Open my pass</strong> button. Tap it on this phone to see your QR, accept connection
				requests and find your certificate.
			</p>
		</div>
	{:else}
		{#if form?.message}
			<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{form.message}</p></div>
		{:else if form?.success}
			<div class="ops-banner ok" role="status"><BadgeCheck size={18} aria-hidden="true" /><p>{form.success}</p></div>
		{/if}

		<section class="ops-card pass" aria-labelledby="pass-title">
			<div class="who">
				<span class="ops-eyebrow">Delegate pass · {data.me.code}</span>
				<h1 id="pass-title" class="ops-title name">{data.me.name}</h1>
				<p class="ops-sub">{data.me.designation}, {data.me.company}</p>
			</div>
			<div class="qr-wrap"><PassQr value={data.passUrl} label="Your event pass QR code" /></div>
			<p class="ops-sub center">
				Show this at the gate, halls, food counters and certificate desk. Turn up the screen brightness.
			</p>
			{#if !data.me.paid}
				<div class="ops-banner warn" role="status">
					<CircleAlert size={18} aria-hidden="true" /><p>Your payment is not confirmed yet, so desks will not accept this pass.</p>
				</div>
			{/if}
		</section>

		{#if data.certificate}
			<a class="ops-big-btn secondary" href="/certificate/{data.certificate}"><Award size={22} aria-hidden="true" /> View my certificate</a>
		{/if}

		<section class="ops-card" aria-labelledby="connect-title">
			<h2 id="connect-title" class="section-title">Connect with delegates</h2>
			<p class="ops-sub">
				Scan another delegate’s QR with this button or your phone camera to see their contact card. Anyone who scans your
				QR sees yours (name, phone, email, company and designation), so share it with the people you want to meet.
			</p>
			{#if scanning}
				<QrScanner {onscan} />
				{#if scanError}<p class="ops-muted">{scanError}</p>{/if}
				<button type="button" class="ops-big-btn secondary" onclick={() => (scanning = false)}><X size={22} aria-hidden="true" /> Close camera</button>
			{:else}
				<button type="button" class="ops-big-btn" onclick={() => ((scanning = true), (scanError = ''))}>
					<ScanQrCode size={26} aria-hidden="true" /> SCAN TO CONNECT
				</button>
			{/if}
		</section>

		{#if data.directory}
			{@const dir = data.directory}
			<section class="ops-card" aria-labelledby="directory-title">
				<h2 id="directory-title" class="section-title">Visitors directory</h2>
				<a class="ops-big-btn secondary" href="/visitorDirectory">
					<MessagesSquare size={22} aria-hidden="true" />
					Open the visitors directory{dir.unread ? ` (${dir.unread} unread)` : ''}
				</a>
				<form method="post" action="?/directorySettings" use:enhance={() => async ({ update }) => update({ reset: false })} class="dir-settings">
					<label class="ops-check">
						<input type="checkbox" name="listed" checked={!dir.flags.hidden && !dir.flags.adminHidden} disabled={dir.flags.adminHidden} />
						Show me in the directory
					</label>
					{#if dir.flags.adminHidden}
						<p class="ops-muted">The organisers have turned this off for your pass. Speak to the registration desk.</p>
					{/if}
					<label class="ops-check">
						<input type="checkbox" name="messages" checked={!dir.flags.messagesOff && !dir.flags.adminMessagesOff} disabled={dir.flags.adminMessagesOff} />
						Let delegates message me
					</label>
					{#if dir.flags.adminMessagesOff}
						<p class="ops-muted">{BLOCKER_TEXT['admin-off']}</p>
					{:else}
						<p class="ops-muted">Turning this off also stops you sending, and makes your conversations read-only.</p>
					{/if}
					<button class="btn btn-secondary" type="submit">Save</button>
				</form>
				{#if dir.blocked.length}
					<h3 class="sub-title">People you blocked</h3>
					<ul class="people">
						{#each dir.blocked as b (b.id)}
							<li>
								<div>
									<strong>{b.fullName}</strong>
									<span>{b.companyName}</span>
								</div>
								<form method="post" action="?/unblockPerson" use:enhance>
									<input type="hidden" name="other" value={b.id} />
									<button class="btn btn-ghost ops-btn-sm" type="submit">Unblock</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		{#if incoming.length}
			<section class="ops-card" aria-labelledby="requests-title">
				<h2 id="requests-title" class="section-title">Requests for you ({incoming.length})</h2>
				<ul class="people">
					{#each incoming as c (c.other.registrationId)}
						<li>
							<div>
								<strong>{c.other.fullName}</strong>
								<span>{c.other.designation}, {c.other.companyName}</span>
								{#if c.introduced}<span class="ops-pill warning">Introduced by the networking desk</span>{/if}
							</div>
							<div class="ops-actions">
								<form method="post" action="?/accept" use:enhance>
									<input type="hidden" name="other" value={c.other.registrationId} />
									<button class="btn btn-primary" type="submit"><UserRoundCheck size={18} aria-hidden="true" /> Accept</button>
								</form>
								<form method="post" action="?/withdraw" use:enhance>
									<input type="hidden" name="other" value={c.other.registrationId} />
									<button class="btn btn-secondary" type="submit">Decline</button>
								</form>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="ops-card" aria-labelledby="connections-title">
			<h2 id="connections-title" class="section-title">My connections ({connected.length})</h2>
			{#if connected.length === 0}
				<p class="ops-sub">No connections yet.</p>
			{:else}
				<ul class="people">
					{#each connected as c (c.other.registrationId)}
						<li>
							<div>
								<strong>{c.other.fullName}</strong>
								<span>{c.other.designation}, {c.other.companyName}</span>
								{#if c.contact}
									<a href="tel:{c.contact.phone}"><Phone size={14} aria-hidden="true" /> {c.contact.phone}</a>
									<a href="mailto:{c.contact.email}"><Mail size={14} aria-hidden="true" /> {c.contact.email}</a>
								{/if}
							</div>
							<form method="post" action="?/withdraw" use:enhance>
								<input type="hidden" name="other" value={c.other.registrationId} />
								<button class="btn btn-ghost ops-btn-sm" type="submit" title="Stop sharing contact details">Remove</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			{#if requested.length}
				<p class="ops-muted">Waiting for {requested.map((c) => c.other.fullName).join(', ')} to accept.</p>
			{/if}
		</section>

		<form method="post" action="?/signout" class="signout">
			<button type="submit" class="btn btn-ghost">Sign out of this phone</button>
		</form>
	{/if}
</PublicShell>

<style>
	.pass {
		justify-items: center;
		text-align: center;
	}

	.who {
		display: grid;
		gap: var(--space-1);
	}

	.name {
		font-family: var(--font-display);
		font-weight: 500;
		letter-spacing: 0;
	}

	.qr-wrap {
		width: min(100%, 320px);
	}

	.center {
		text-align: center;
	}

	.section-title {
		font: 600 17px/1.3 var(--font-sans);
		color: var(--charcoal);
	}

	.people {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.people li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--rule);
	}

	.people li:first-child {
		border-top: 0;
	}

	.people li > div:first-child {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.people strong {
		font-size: 16px;
		color: var(--charcoal);
	}

	.people span {
		font-size: 14px;
		color: var(--text-supporting);
	}

	.people a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		color: var(--gold-ink);
		font-size: 15px;
		overflow-wrap: anywhere;
	}

	.dir-settings {
		display: grid;
		gap: var(--space-1);
		justify-items: start;
	}
	.sub-title {
		font: 600 15px/1.3 var(--font-sans);
		color: var(--charcoal);
	}
	.signout {
		display: flex;
		justify-content: center;
	}
</style>
