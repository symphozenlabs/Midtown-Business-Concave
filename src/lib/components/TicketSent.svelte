<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, Clock, Mail, RotateCcw, UserPlus } from '@lucide/svelte';

	interface Props {
		posterUrl: string | null;
		email: string;
		code: string;
		utr: string;
		onrestart: () => void;
	}

	let { posterUrl, email, code, utr, onrestart }: Props = $props();

	let heading: HTMLElement;
	let play = $state(0);

	onMount(() => heading.focus({ preventScroll: true }));

	const sparks = Array.from({ length: 10 }, (_, i) => {
		const a = (i / 10) * Math.PI * 2 + 0.3;
		return { x: Math.cos(a) * (120 + (i % 3) * 18), y: Math.sin(a) * (80 + (i % 2) * 16), d: 1950 + (i % 4) * 60 };
	});
</script>

<div class="sent">
	<button type="button" class="stage" onclick={() => play++} aria-label="Play the animation again">
		{#key play}
			<div class="scene" aria-hidden="true">
				<div class="glow"></div>
				<div class="envelope">
					<div class="back"></div>
					<div class="letter">
						{#if posterUrl}
							<img src={posterUrl} alt="" />
						{:else}
							<div class="letter-fallback">I AM ATTENDING</div>
						{/if}
					</div>
					<div class="front"></div>
					<div class="flap"></div>
					<div class="seal">MBC</div>
				</div>
				{#each sparks as s, i (i)}
					<span class="spark" style="--x:{s.x}px; --y:{s.y}px; --delay:{s.d}ms"></span>
				{/each}
			</div>
		{/key}
		<span class="replay" aria-hidden="true"><RotateCcw size={13} /> Replay</span>
	</button>

	<div class="copy">
		<span class="chip"><Clock size={15} aria-hidden="true" /> Payment under review</span>
		<h3 tabindex="-1" bind:this={heading}>Your ticket is on its way</h3>
		<p class="lead">
			{#if utr}
				Thank you. We have your UPI transaction ID <strong class="mono">{utr}</strong>. Once the organisers confirm your
				payment, your “I am attending” ticket will be sent to <strong>{email}</strong>.
			{:else}
				Thank you. Your voucher covers the full fee. Once the organisers confirm it, your “I am attending” ticket will be
				sent to <strong>{email}</strong>.
			{/if}
		</p>

		<ol class="timeline">
			<li class="done" style="--i: 0"><span class="dot"><Check size={13} strokeWidth={3} /></span> Registered as <strong class="mono">{code}</strong></li>
			<li class="done" style="--i: 1"><span class="dot"><Check size={13} strokeWidth={3} /></span> Payment details received</li>
			<li style="--i: 2"><span class="dot"></span> Organisers verify your payment</li>
			<li style="--i: 3"><span class="dot"><Mail size={12} /></span> Ticket emailed to you</li>
		</ol>

		<p class="note">Keep your payment receipt until your ticket arrives. If it is not in your inbox, check the spam or promotions folder.</p>

		<button type="button" class="btn btn-secondary" onclick={onrestart}>
			<UserPlus size={18} aria-hidden="true" /> Register another delegate
		</button>
	</div>
</div>

<style>
	.sent {
		display: grid;
		grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
		gap: var(--space-8);
		align-items: center;
	}

	.stage {
		position: relative;
		display: grid;
		place-items: center;
		height: 300px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-lg);
		background:
			radial-gradient(70% 60% at 50% 45%, rgb(255 172 72 / 0.2), transparent 70%),
			linear-gradient(180deg, #0c1730, #060b1a);
		cursor: pointer;
		overflow: hidden;
	}

	.replay {
		position: absolute;
		right: 12px;
		bottom: 10px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font: 500 12px/1 var(--font-sans);
		color: rgb(246 236 216 / 0.55);
	}

	.stage:hover .replay {
		color: var(--gold);
	}

	.scene {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
	}

	.glow {
		position: absolute;
		width: 260px;
		height: 260px;
		border-radius: 50%;
		background: radial-gradient(circle, rgb(255 190 90 / 0.45), transparent 65%);
		opacity: 0;
		animation: glow 1.4s var(--ease-out) 1.9s both;
	}

	.envelope {
		position: relative;
		width: 220px;
		height: 144px;
		margin-top: 60px;
		perspective: 700px;
		animation: lift 1.1s var(--ease-out) 1.8s both;
	}

	.back,
	.front {
		position: absolute;
		inset: 0;
		border-radius: 8px;
	}

	.back {
		background: #0a1330;
		box-shadow: 0 0 0 1px rgb(240 196 112 / 0.45);
	}

	/* The ticket drops into the envelope. */
	.letter {
		position: absolute;
		left: 22px;
		right: 22px;
		bottom: 10px;
		height: 126px;
		border-radius: 6px;
		overflow: hidden;
		background: #0c1730;
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.45);
		z-index: 1;
		animation: drop 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
	}

	.letter img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top;
	}

	.letter-fallback {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--gold);
		font: 700 14px/1 var(--font-sans);
		letter-spacing: 0.2em;
	}

	.front {
		z-index: 2;
		/* The pocket's opening matches the flap exactly, so the shut envelope hides the ticket. */
		clip-path: polygon(0 0, 50% 66%, 100% 0, 100% 100%, 0 100%);
		background: linear-gradient(160deg, #1b2c63, #0d1838);
		box-shadow: inset 0 0 0 1px rgb(240 196 112 / 0.55);
	}

	/* The flap starts open (pointing up, behind the ticket) and folds shut. */
	.flap {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 66%;
		clip-path: polygon(0 0, 100% 0, 50% 100%);
		background: linear-gradient(180deg, #e9b556, #b26e1c);
		transform-origin: top;
		animation: fold 0.55s var(--ease-out) 1.05s both;
	}

	.seal {
		position: absolute;
		left: 50%;
		top: 66%;
		z-index: 4;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		margin: -20px 0 0 -20px;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 30%, #fff3cc, #e0a13f 55%, #8a5612);
		box-shadow:
			0 0 0 3px #0a1330,
			0 4px 10px rgb(0 0 0 / 0.45);
		color: #0a1330;
		font: 800 10px/1 var(--font-sans);
		letter-spacing: 0.06em;
		animation: seal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.55s both;
	}

	.spark {
		position: absolute;
		left: 50%;
		top: 58%;
		width: 8px;
		height: 8px;
		background: #f7d07d;
		clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
		opacity: 0;
		animation: spark 0.9s var(--ease-out) var(--delay) both;
	}

	@keyframes drop {
		from {
			transform: translateY(-150px) rotate(-4deg);
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	@keyframes fold {
		from {
			transform: rotateX(180deg);
			z-index: 0;
		}
		49% {
			z-index: 0;
		}
		50% {
			z-index: 3;
		}
		to {
			transform: rotateX(0deg);
			z-index: 3;
		}
	}

	@keyframes seal {
		from {
			transform: scale(0) rotate(-40deg);
		}
		to {
			transform: none;
		}
	}

	@keyframes lift {
		from {
			transform: none;
		}
		45% {
			transform: translateY(-16px) rotate(-2deg);
		}
		to {
			transform: translateY(-6px);
		}
	}

	@keyframes glow {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
		40% {
			opacity: 1;
		}
		to {
			opacity: 0.5;
			transform: scale(1);
		}
	}

	@keyframes spark {
		from {
			opacity: 0;
			transform: translate(0, 0) scale(0.4);
		}
		30% {
			opacity: 1;
		}
		to {
			opacity: 0;
			transform: translate(var(--x), var(--y)) scale(1) rotate(90deg);
		}
	}

	.copy {
		display: grid;
		gap: var(--space-4);
		justify-items: start;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		border-radius: 999px;
		background: var(--warning-tint);
		color: var(--warning);
		font: 600 13px/1.4 var(--font-sans);
	}

	h3 {
		font: var(--text-h3);
		font-size: clamp(26px, 3vw, 32px);
	}

	h3:focus {
		outline: none;
	}

	.lead {
		font: var(--text-lead);
		font-size: 17px;
		color: var(--text-body);
	}

	.lead strong {
		color: var(--charcoal);
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
		letter-spacing: 0.02em;
	}

	.timeline {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.timeline li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: 15px;
		color: var(--text-supporting);
		animation: item 0.5s var(--ease-out) both;
		animation-delay: calc(2.1s + var(--i) * 140ms);
	}

	.timeline li.done {
		color: var(--charcoal);
	}

	.dot {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1.5px dashed var(--control-border);
		color: var(--text-supporting);
		flex: none;
	}

	.done .dot {
		border: 0;
		background: var(--success);
		color: var(--white);
	}

	@keyframes item {
		from {
			opacity: 0;
			transform: translateX(-8px);
		}
	}

	.note {
		font: var(--text-caption);
		color: var(--text-supporting);
	}

	@media (max-width: 760px) {
		.sent {
			grid-template-columns: minmax(0, 1fr);
		}

		.stage {
			height: 260px;
		}
	}
</style>
