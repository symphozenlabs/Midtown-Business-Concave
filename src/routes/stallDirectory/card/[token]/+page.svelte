<script lang="ts">
	import { page } from '$app/state';
	import { BadgeCheck, Mail, MapPin, MessageCircle, Phone, Store, UserRoundPlus } from '@lucide/svelte';
	import Avatar from '#lib/components/directory/Avatar.svelte';
	import FloorMap from '#lib/components/directory/FloorMap.svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { SIDE_LABEL, stallSide } from '#lib/stall-directory/rules.ts';

	let { data } = $props();

	/** +91XXXXXXXXXX → +91 98427 88990 */
	const prettyPhone = (p: string) => p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2');
	const side = $derived(data.valid && data.card.stall ? stallSide(data.card.stall) : null);
</script>

<svelte:head>
	<title>{data.valid ? `${data.card.businessName} · ` : ''}Exhibitor · Midtown Business Conclave</title>
</svelte:head>

<PublicShell subtitle="Exhibitor contact">
	{#if !data.valid}
		<div class="ops-card">
			<span class="ops-eyebrow">Stall QR</span>
			<h1 class="ops-title">Not a valid stall QR</h1>
			<p class="ops-sub">This QR was not issued by the Midtown Business Conclave organisers, or the stall is not confirmed.</p>
			<a class="btn btn-secondary" href="/stallDirectory">Open the stall directory</a>
		</div>
	{:else}
		{@const c = data.card}
		<section class="ops-card" aria-labelledby="name">
			<div class="holder">
				<Avatar name={c.businessName} size={84} />
				<div>
					<span class="ops-eyebrow"><BadgeCheck size={14} aria-hidden="true" /> Confirmed exhibitor{c.stall ? ` · Stall ${c.stall}` : ''}</span>
					<h1 id="name" class="ops-title name">{c.businessName}</h1>
					<p class="role">{c.contactName}</p>
				</div>
			</div>
			<ul class="contact" aria-label="Contact details">
				<li><a href="tel:{c.phone}"><Phone size={18} aria-hidden="true" /><span>{prettyPhone(c.phone)}</span></a></li>
				<li><a href="mailto:{c.email}"><Mail size={18} aria-hidden="true" /><span>{c.email}</span></a></li>
			</ul>
			<a class="ops-big-btn save" href="/stallDirectory/card/{page.params.token}/vcard" download>
				<UserRoundPlus size={24} aria-hidden="true" /> SAVE CONTACT
			</a>
			<a class="btn btn-secondary message" href="/stallDirectory/{c.id}"><MessageCircle size={18} aria-hidden="true" /> Message this stall</a>
			<dl class="facts">
				<div><dt>Stall</dt><dd>{c.stall ? `No. ${c.stall}` : 'To be announced'}</dd></div>
				{#if side}<div><dt>Where</dt><dd>{SIDE_LABEL[side]}</dd></div>{/if}
				<div><dt>Stall type</dt><dd>{c.stallType}</dd></div>
			</dl>
		</section>

		{#if c.stall}
			<section class="ops-card" aria-label="Where to find them">
				<span class="ops-eyebrow"><MapPin size={14} aria-hidden="true" /> On the floor</span>
				<FloorMap exhibitors={data.exhibitors} selected={c.stall} fit />
			</section>
		{/if}
		<a class="ops-muted all" href="/stallDirectory"><Store size={15} aria-hidden="true" /> See all stalls</a>
	{/if}
</PublicShell>

<style>
	.holder {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	.holder .ops-eyebrow,
	section > .ops-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.name {
		font-family: var(--font-display);
		font-weight: 500;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}
	.role {
		font-size: 17px;
		color: var(--text-body);
	}
	.contact {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.contact a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 48px;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		color: var(--charcoal);
		font-size: 16px;
		text-decoration: none;
	}
	.contact a:hover,
	.contact a:focus-visible {
		border-color: var(--gold);
	}
	.contact a span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.contact :global(svg) {
		flex: none;
		color: var(--gold-ink);
	}
	.save,
	.message {
		text-decoration: none;
	}
	.message {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
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
	.all {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}
</style>
