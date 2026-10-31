<script lang="ts">
	import { BadgeCheck, CircleAlert, Printer } from '@lucide/svelte';
	import PublicShell from '#lib/components/ops/PublicShell.svelte';
	import { EVENT } from '#lib/event.ts';

	let { data } = $props();
	const cert = $derived(data.certificate);
	const issued = $derived(
		cert ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(cert.issuedAt)) : ''
	);
</script>

<svelte:head>
	<title>Certificate {data.number} · Midtown Business Conclave</title>
</svelte:head>

<PublicShell subtitle="Certificate verification">
	{#if !cert}
		<div class="ops-card">
			<span class="ops-eyebrow">Certificate {data.number}</span>
			<h1 class="ops-title">Not found</h1>
			<div class="ops-banner error" role="alert">
				<CircleAlert size={18} aria-hidden="true" />
				<p>No certificate with this number was issued by the organisers. Check the number for typing mistakes.</p>
			</div>
		</div>
	{:else}
		<div class="ops-banner {cert.revokedAt ? 'error' : 'ok'} no-print" role="status">
			{#if cert.revokedAt}<CircleAlert size={18} aria-hidden="true" /><p>This certificate was revoked by the organisers.</p>
			{:else}<BadgeCheck size={18} aria-hidden="true" /><p>Genuine certificate, issued by the organisers on {issued}.</p>{/if}
		</div>

		<article class="certificate" aria-label="Certificate of participation">
			<img src="/poster/mbc.webp" alt="Midtown Business Conclave" width="1655" height="747" />
			<p class="kicker">Certificate of participation</p>
			<p class="line">This is to certify that</p>
			<h1>{cert.fullName}</h1>
			<p class="role">{cert.designation}, {cert.companyName}</p>
			<p class="line">took part in <strong>{cert.eventName}</strong>, presented by {EVENT.presenter}, on {data.when.dateLabel} at {EVENT.venue}.</p>
			<div class="foot">
				<span>Certificate no. <strong>{cert.number}</strong></span>
				<span>Issued {issued}</span>
			</div>
		</article>

		{#if !cert.revokedAt}
			<button type="button" class="ops-big-btn secondary no-print" onclick={() => window.print()}>
				<Printer size={22} aria-hidden="true" /> Print or save as PDF
			</button>
		{/if}
	{/if}
</PublicShell>

<style>
	.certificate {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: clamp(var(--space-6), 6vw, 56px) clamp(var(--space-4), 5vw, 48px);
		border: 1px solid #6b5426;
		border-radius: var(--radius-lg);
		background:
			radial-gradient(60% 40% at 50% 0%, rgb(227 176 75 / 0.16), transparent 70%),
			#101a3a;
		color: #e9dfc9;
		text-align: center;
		box-shadow: inset 0 0 0 6px #101a3a, inset 0 0 0 7px var(--gold-line);
	}

	img {
		width: 170px;
		height: auto;
	}

	.kicker {
		margin-top: var(--space-3);
		font: var(--text-eyebrow);
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.line {
		max-width: 46ch;
		font-size: 16px;
		line-height: 1.6;
	}

	.line strong {
		color: var(--on-ink);
		font-weight: 600;
	}

	h1 {
		font: 500 clamp(30px, 7vw, 48px) / 1.15 var(--font-display);
		color: var(--gold-bright);
		overflow-wrap: anywhere;
	}

	.role {
		font-size: 15px;
		color: var(--on-ink-soft);
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2) var(--space-6);
		width: 100%;
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--gold-line);
		font-size: 13px;
		color: var(--on-ink-soft);
	}

	.foot strong {
		color: var(--on-ink);
		letter-spacing: 0.06em;
	}

	@media print {
		:global(.ops-top),
		.no-print {
			display: none !important;
		}

		:global(.ops-shell) {
			background: none;
		}

		.certificate {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
	}
</style>
