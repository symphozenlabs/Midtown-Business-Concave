<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { BadgeCheck, CircleAlert, Handshake, UserRoundCheck } from '@lucide/svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';

	let { data, form } = $props();
	let pending = $state(false);

	const STATE_TEXT = {
		requested: 'Request sent. You are connected once they accept.',
		incoming: 'They asked to connect with you.',
		connected: 'You are connected. Their contact details are on your pass.',
		declined: 'You declined or removed this connection.'
	} as const;
</script>

<svelte:head>
	<title>Delegate · Midtown Business Conclave</title>
</svelte:head>

<PublicShell subtitle="Delegate pass">
	{#if !data.valid}
		<div class="ops-card">
			<span class="ops-eyebrow">Pass check</span>
			<h1 class="ops-title">{data.revoked ? 'This pass was replaced' : 'Not a valid pass'}</h1>
			<p class="ops-sub">
				{data.revoked
					? 'The organisers issued a newer QR for this delegate. Ask them for the latest one from their email.'
					: 'This QR was not issued by the Midtown Business Conclave organisers, or the delegate is not confirmed yet.'}
			</p>
		</div>
	{:else}
		{#if form?.message}
			<div class="ops-banner error" role="alert"><CircleAlert size={18} aria-hidden="true" /><p>{form.message}</p></div>
		{:else if form?.success}
			<div class="ops-banner ok" role="status"><BadgeCheck size={18} aria-hidden="true" /><p>{form.success}</p></div>
		{/if}

		<section class="ops-card" aria-labelledby="name">
			<div class="holder">
				{#if data.hasPhoto}
					<img class="photo" src="/pass/{page.params.token}/photo" alt="Photo of {data.profile.fullName}" width="96" height="96" />
				{:else}
					<span class="photo initials" aria-hidden="true">{data.profile.fullName.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
				{/if}
				<div>
					<span class="ops-eyebrow"><BadgeCheck size={14} aria-hidden="true" /> Confirmed delegate · {data.profile.code}</span>
					<h1 id="name" class="ops-title name">{data.profile.fullName}</h1>
					<p class="role">{data.profile.designation}, {data.profile.companyName}</p>
				</div>
			</div>
			<dl class="facts">
				<div><dt>Industry</dt><dd>{data.profile.industry}</dd></div>
				<div><dt>City</dt><dd>{data.profile.city}</dd></div>
				{#if data.interests.length}
					<div><dt>Interested in</dt><dd>{data.interests.join(', ')}</dd></div>
				{/if}
				{#if data.profile.website}
					<div><dt>Website</dt><dd><a href={data.profile.website} rel="noopener noreferrer nofollow" target="_blank">{data.profile.website.replace(/^https?:\/\//, '')}</a></dd></div>
				{/if}
			</dl>
			{#if data.profile.about}<p class="about">{data.profile.about}</p>{/if}
		</section>

		{#if data.signedIn}
			<section class="ops-card">
				{#if data.state && data.state !== 'none'}
					<p class="ops-sub">{STATE_TEXT[data.state]}</p>
				{/if}
				{#if data.state === 'none' || data.state === 'incoming' || data.state === 'declined'}
					<form
						method="post"
						action="?/connect"
						use:enhance={() => {
							pending = true;
							return async ({ update }) => {
								await update();
								pending = false;
							};
						}}
					>
						<button type="submit" class="ops-big-btn" disabled={pending}>
							{#if data.state === 'incoming'}<UserRoundCheck size={26} aria-hidden="true" /> ACCEPT AND CONNECT{:else}<Handshake size={26} aria-hidden="true" /> CONNECT / EXCHANGE CONTACT{/if}
						</button>
					</form>
					<p class="ops-muted">Your phone number and email are shared only when both of you have accepted.</p>
				{:else if data.state === 'requested' || data.state === 'connected'}
					<form method="post" action="?/withdraw" use:enhance>
						<button type="submit" class="btn btn-secondary">{data.state === 'connected' ? 'Remove connection' : 'Cancel request'}</button>
					</form>
				{/if}
				<a class="ops-muted" href="/me">Back to my pass</a>
			</section>
		{:else}
			<div class="ops-banner warn" role="status">
				<Handshake size={18} aria-hidden="true" />
				<p>
					Delegate? To connect, first open <strong>your own pass</strong> on this phone using the <em>Open my pass</em> button in
					your ticket email, then scan again. Event staff: scan from your desk instead.
				</p>
			</div>
		{/if}
	{/if}
</PublicShell>

<style>
	.holder {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.photo {
		flex: none;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		object-fit: cover;
		box-shadow: 0 0 0 3px var(--gold);
	}

	.initials {
		display: grid;
		place-items: center;
		background: var(--ink);
		color: var(--gold);
		font: 700 30px/1 var(--font-sans);
	}

	.holder .ops-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.name {
		font-family: var(--font-display);
		font-weight: 500;
		letter-spacing: 0;
	}

	.role {
		font-size: 17px;
		color: var(--text-body);
	}

	.facts {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	.facts div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		padding-top: var(--space-2);
		border-top: 1px solid var(--rule);
		font-size: 15px;
	}

	.facts dt {
		color: var(--text-supporting);
	}

	.facts dd {
		margin: 0;
		color: var(--charcoal);
		text-align: right;
		overflow-wrap: anywhere;
	}

	.facts a {
		color: var(--gold-ink);
	}

	.about {
		font-size: 15px;
		color: var(--text-body);
	}
</style>
