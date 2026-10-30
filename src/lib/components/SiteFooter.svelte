<script lang="ts">
	import { EVENT } from '#lib/event.ts';
</script>

<footer class="footer on-ink">
	<div class="container inner">
		<div class="brand">
			<p class="name">{EVENT.name}</p>
			<p class="by">Presented by {EVENT.presenter}. {EVENT.presenterTagline}</p>
		</div>

		<ul class="partners">
			{#each EVENT.partners as partner (partner.role)}
				<li>
					<span class="role">{partner.role}</span>
					<span class="partner">{partner.name}</span>
				</li>
			{/each}
		</ul>
	</div>
	<div class="container legal">
		<p>© 2026 {EVENT.presenter}. All rights reserved.</p>
	</div>
</footer>

<style>
	.footer {
		background: var(--ink);
		color: var(--on-ink-soft);
	}

	.inner {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-8);
		padding-block: var(--space-12) var(--space-8);
	}

	.brand {
		display: grid;
		gap: var(--space-2);
	}

	.name {
		font: 500 24px/1.2 var(--font-display);
		color: var(--on-ink);
	}

	.by {
		font: var(--text-caption);
	}

	.partners {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-6) var(--space-12);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.partners li {
		display: grid;
		gap: var(--space-1);
	}

	.role {
		font: var(--text-eyebrow);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.partner {
		font: var(--text-ui);
		color: var(--on-ink);
	}

	.legal {
		padding-block: var(--space-6);
		border-top: 1px solid var(--rule-inverse);
		font: var(--text-caption);
	}
</style>
