<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { LayoutDashboard, LogOut, Settings2 } from '@lucide/svelte';

	let { data, children } = $props();

	const NAV = [
		{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/admin/configuration', label: 'Configuration', icon: Settings2 }
	];

	const current = (href: string) =>
		href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.admin}
	<div class="admin">
		<header class="topbar">
			<div class="brand">
				<img src="/poster/mbc.webp" alt="" width="1655" height="747" />
				<div>
					<strong>Organiser dashboard</strong>
					<span>Midtown Business Conclave 2026</span>
				</div>
			</div>

			<nav class="nav" aria-label="Admin">
				{#each NAV as item (item.href)}
					<a href={item.href} aria-current={current(item.href) ? 'page' : undefined}>
						<item.icon size={16} aria-hidden="true" />
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="who">
				<span>{data.admin.email}</span>
				<form method="post" action="/admin?/logout" use:enhance>
					<button type="submit" class="btn btn-ghost small"><LogOut size={16} aria-hidden="true" /> Sign out</button>
				</form>
			</div>
		</header>

		<main class="wrap">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.admin {
		min-height: 100svh;
		background: var(--mist);
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) clamp(var(--space-4), 3vw, var(--space-8));
		background: #0c1730;
		color: var(--on-ink-soft);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.brand img {
		width: 92px;
		height: auto;
	}

	.brand div {
		display: grid;
		line-height: 1.3;
	}

	.brand strong {
		color: var(--on-ink);
		font-weight: 600;
	}

	.brand span,
	.who span {
		font: var(--text-caption);
	}

	.nav {
		display: flex;
		gap: var(--space-1);
		margin-inline: auto;
	}

	.nav a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 38px;
		padding: 0 var(--space-4);
		border-radius: var(--radius-sm);
		color: var(--on-ink-soft);
		font: var(--text-ui);
		font-size: 14px;
		text-decoration: none;
	}

	.nav a:hover {
		background: rgb(255 255 255 / 0.08);
		color: var(--on-ink);
	}

	.nav a[aria-current='page'] {
		background: rgb(227 176 75 / 0.16);
		color: var(--on-ink);
		box-shadow: inset 0 -2px 0 var(--gold);
	}

	.nav a :global(svg) {
		color: var(--gold);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.who :global(.btn-ghost) {
		color: var(--on-ink);
	}

	.who :global(.btn-ghost:hover) {
		background: rgb(255 255 255 / 0.08);
	}

	.small {
		min-height: 38px;
		padding-inline: var(--space-4);
		font-size: 14px;
	}

	.wrap {
		display: grid;
		gap: var(--space-6);
		max-width: 1400px;
		margin-inline: auto;
		padding: var(--space-6) clamp(var(--space-4), 3vw, var(--space-8)) var(--space-16);
	}

	@media (max-width: 760px) {
		.topbar {
			flex-wrap: wrap;
		}

		.nav {
			order: 3;
			width: 100%;
			margin-inline: 0;
		}

		.who span,
		.brand span {
			display: none;
		}
	}
</style>
