<script lang="ts">
	import { Bell, BellOff, Share, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { pushState, turnOnPush, type PushState } from '#lib/directory/push-client.ts';

	let { publicKey }: { publicKey: string } = $props();

	/** null until checked in the browser, so nothing flashes on load. */
	let status = $state<PushState | null>(null);
	let busy = $state(false);
	let failed = $state(false);
	let showSteps = $state(false);

	onMount(() => {
		pushState()
			.then((s) => (status = s))
			.catch(() => (status = 'unsupported'));
	});

	async function turnOn() {
		if (status === 'ios-home-screen') {
			showSteps = true;
			return;
		}
		busy = true;
		failed = false;
		try {
			status = await turnOnPush(publicKey);
			failed = status === 'off';
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

{#if status === 'off' || status === 'ios-home-screen'}
	<div class="notify" role="region" aria-label="Notifications">
		<Bell size={20} aria-hidden="true" />
		<p><strong>Know when someone messages you.</strong>{failed ? ' That didn’t work. Try again.' : ''}</p>
		<button type="button" class="btn btn-primary ops-btn-sm" onclick={turnOn} disabled={busy}>
			{busy ? 'Turning on…' : 'Turn on notifications'}
		</button>
	</div>
{:else if status === 'denied'}
	<div class="notify muted" role="status">
		<BellOff size={18} aria-hidden="true" />
		<p>Notifications are blocked for this site. Allow them in your browser’s site settings to get message alerts.</p>
	</div>
{/if}

{#if showSteps}
	<div class="sheet-backdrop" role="presentation" onclick={() => (showSteps = false)}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="home-screen-title">
		<button type="button" class="close" onclick={() => (showSteps = false)} aria-label="Close"><X size={20} aria-hidden="true" /></button>
		<h2 id="home-screen-title">Add the directory to your Home Screen</h2>
		<p>On iPhone, notifications only work from the Home Screen icon.</p>
		<ol>
			<li>Tap <strong>Share</strong> <Share size={16} aria-label="(the square with an arrow)" />.</li>
			<li>Tap <strong>Add to Home Screen</strong>. Leave “Open as Web App” on.</li>
			<li>Open the directory from the new icon and tap <strong>Turn on notifications</strong> there.</li>
		</ol>
		<button type="button" class="btn btn-secondary" onclick={() => (showSteps = false)}>Got it</button>
	</div>
{/if}

<style>
	.notify {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--gold-tint);
		color: var(--charcoal);
		font-size: 14px;
	}
	.notify :global(svg) {
		flex: none;
		color: var(--gold-ink);
	}
	.notify p {
		flex: 1 1 160px;
	}
	.notify.muted {
		background: var(--white);
		border: 1px solid var(--rule);
		color: var(--text-supporting);
		font-size: 13px;
	}
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgb(0 0 0 / 0.4);
	}
	.sheet {
		position: fixed;
		inset: auto 0 0;
		z-index: 21;
		display: grid;
		gap: var(--space-3);
		max-width: 640px;
		margin-inline: auto;
		padding: var(--space-6) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom));
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		background: var(--white);
		color: var(--text-body);
	}
	.sheet h2 {
		padding-right: 44px;
		font: 500 21px/1.25 var(--font-display);
		color: var(--charcoal);
	}
	.sheet ol {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding-left: 1.3em;
	}
	.sheet ol :global(svg) {
		display: inline-block;
		vertical-align: -3px;
	}
	.close {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		background: transparent;
		color: var(--charcoal);
		cursor: pointer;
	}
</style>
