<script lang="ts">
	import { onMount } from 'svelte';
	import { CameraOff, Flashlight, FlashlightOff, LoaderCircle, RefreshCw, SwitchCamera } from '@lucide/svelte';
	import { createVideoDecoder } from '#lib/qr-decode.ts';

	interface Props {
		/** Called once per code; the same code is ignored for a few seconds after. */
		onscan: (text: string) => void;
		/** While true the camera stays on but nothing is read (a result is showing). */
		paused?: boolean;
	}

	let { onscan, paused = false }: Props = $props();

	type CameraState = 'starting' | 'live' | 'denied' | 'missing' | 'busy' | 'insecure' | 'error';

	let video: HTMLVideoElement;
	let camera = $state<CameraState>('starting');
	let facing = $state<'environment' | 'user'>('environment');
	let torchSupported = $state(false);
	let torchOn = $state(false);
	let cameras = $state(0);

	let stream: MediaStream | null = null;
	let decoder: ReturnType<typeof createVideoDecoder> | null = null;
	let frame = 0;
	let reading = false;
	let lastText = '';
	let lastAt = 0;
	let lastRead = 0;

	const REPEAT_MS = 3000;

	function stop() {
		cancelAnimationFrame(frame);
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		torchOn = false;
	}

	async function start() {
		stop();
		camera = 'starting';
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			camera = window.isSecureContext ? 'error' : 'insecure';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
			});
			video.srcObject = stream;
			await video.play();
			const track = stream.getVideoTracks()[0];
			const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
			torchSupported = Boolean(caps.torch);
			cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length;
			decoder ??= createVideoDecoder();
			camera = 'live';
			loop();
		} catch (e) {
			const name = (e as DOMException)?.name;
			camera =
				name === 'NotAllowedError' || name === 'SecurityError'
					? 'denied'
					: name === 'NotFoundError' || name === 'OverconstrainedError'
						? 'missing'
						: name === 'NotReadableError'
							? 'busy'
							: 'error';
		}
	}

	function loop() {
		frame = requestAnimationFrame(async (t) => {
			// jsQR is heavier than the platform decoder: about eight reads a second is plenty.
			const gap = decoder?.native ? 0 : 120;
			if (!paused && !reading && t - lastRead >= gap && decoder) {
				reading = true;
				lastRead = t;
				try {
					const text = await decoder.read(video);
					const now = Date.now();
					if (text && !paused && (text !== lastText || now - lastAt > REPEAT_MS)) {
						lastText = text;
						lastAt = now;
						onscan(text);
					}
				} catch {
					/* a dropped frame; keep going */
				} finally {
					reading = false;
				}
			}
			if (stream) loop();
		});
	}

	async function toggleTorch() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		try {
			await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
			torchOn = !torchOn;
		} catch {
			torchSupported = false;
		}
	}

	function flip() {
		facing = facing === 'environment' ? 'user' : 'environment';
		start();
	}

	/** Lets the same pass be scanned again straight after "Continue scanning". */
	export function reset() {
		lastText = '';
		lastAt = 0;
	}

	// Phones pause the camera when the tab is hidden; restart it when the handler comes back.
	function visibility() {
		if (document.visibilityState === 'visible' && camera === 'live' && !stream?.active) start();
	}

	// Cleanup lives in onMount's return: onDestroy also runs during server rendering.
	onMount(() => {
		start();
		document.addEventListener('visibilitychange', visibility);
		return () => {
			stop();
			document.removeEventListener('visibilitychange', visibility);
		};
	});

	const MESSAGES: Record<Exclude<CameraState, 'live' | 'starting'>, string> = {
		denied: 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.',
		missing: 'No camera found on this device. Use manual lookup instead.',
		busy: 'Another app is using the camera. Close it, then try again.',
		insecure: 'The camera only works over https. Open the secure address of this site.',
		error: 'The camera could not start. Try again, or use manual lookup.'
	};
</script>

<div class="scanner" class:mirrored={facing === 'user'}>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video bind:this={video} playsinline muted autoplay></video>

	{#if camera === 'live'}
		<div class="frame" aria-hidden="true">
			<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
			{#if !paused}<span class="line"></span>{/if}
		</div>
	{:else if camera === 'starting'}
		<div class="overlay" role="status">
			<LoaderCircle size={28} class="ops-spin" aria-hidden="true" />
			<p>Starting camera…</p>
		</div>
	{:else}
		<div class="overlay" role="alert">
			<CameraOff size={32} aria-hidden="true" />
			<p>{MESSAGES[camera]}</p>
			<button type="button" class="btn btn-gold" onclick={start}><RefreshCw size={18} aria-hidden="true" /> Try again</button>
		</div>
	{/if}

	{#if camera === 'live'}
		<div class="controls">
			{#if cameras > 1}
				<button type="button" class="control" onclick={flip} aria-label="Switch camera">
					<SwitchCamera size={22} aria-hidden="true" />
				</button>
			{/if}
			{#if torchSupported}
				<button type="button" class="control" onclick={toggleTorch} aria-pressed={torchOn} aria-label="Flashlight">
					{#if torchOn}<FlashlightOff size={22} aria-hidden="true" />{:else}<Flashlight size={22} aria-hidden="true" />{/if}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.scanner {
		position: relative;
		overflow: hidden;
		width: 100%;
		aspect-ratio: 3 / 4;
		max-height: 62svh;
		border-radius: var(--radius-md);
		background: #04070f;
	}

	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.mirrored video {
		transform: scaleX(-1);
	}

	.frame {
		position: absolute;
		inset: 50% auto auto 50%;
		width: min(68%, 300px);
		aspect-ratio: 1;
		translate: -50% -50%;
		box-shadow: 0 0 0 100vmax rgb(4 7 15 / 0.45);
		border-radius: 14px;
	}

	.corner {
		position: absolute;
		width: 22%;
		height: 22%;
		border: 4px solid var(--gold);
	}

	.tl {
		top: 0;
		left: 0;
		border-right: 0;
		border-bottom: 0;
		border-top-left-radius: 14px;
	}

	.tr {
		top: 0;
		right: 0;
		border-left: 0;
		border-bottom: 0;
		border-top-right-radius: 14px;
	}

	.bl {
		bottom: 0;
		left: 0;
		border-right: 0;
		border-top: 0;
		border-bottom-left-radius: 14px;
	}

	.br {
		bottom: 0;
		right: 0;
		border-left: 0;
		border-top: 0;
		border-bottom-right-radius: 14px;
	}

	.line {
		position: absolute;
		left: 8%;
		right: 8%;
		height: 2px;
		background: var(--gold-bright);
		box-shadow: 0 0 12px var(--gold);
		animation: sweep 1.8s ease-in-out infinite alternate;
	}

	@keyframes sweep {
		from {
			top: 10%;
		}
		to {
			top: 90%;
		}
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-4);
		padding: var(--space-6);
		color: var(--on-ink);
		text-align: center;
		font-size: 16px;
	}

	.overlay :global(svg) {
		color: var(--gold);
	}

	.controls {
		position: absolute;
		right: var(--space-3);
		bottom: var(--space-3);
		display: flex;
		gap: var(--space-2);
	}

	.control {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border: 0;
		border-radius: 50%;
		background: rgb(4 7 15 / 0.65);
		color: var(--on-ink);
		cursor: pointer;
	}

	.control[aria-pressed='true'] {
		background: var(--gold);
		color: var(--ink);
	}
</style>
