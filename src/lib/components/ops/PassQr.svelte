<script lang="ts">
	import QRCode from 'qrcode';

	interface Props {
		/** The pass URL to encode. */
		value: string;
		label: string;
	}

	let { value, label }: Props = $props();

	let src = $state<string | null>(null);

	$effect(() => {
		let cancelled = false;
		QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 0, width: 560, color: { dark: '#0b1430', light: '#ffffff' } }).then(
			(url) => {
				if (!cancelled) src = url;
			}
		);
		return () => {
			cancelled = true;
		};
	});
</script>

<!-- Same frame as the UPI payment QR (UpiQr.svelte), without the rupee badge. -->
<div class="qr" role="img" aria-label={label}>
	<span class="corner tl" aria-hidden="true"></span>
	<span class="corner tr" aria-hidden="true"></span>
	<span class="corner bl" aria-hidden="true"></span>
	<span class="corner br" aria-hidden="true"></span>
	{#if src}
		<img {src} alt="" width="560" height="560" />
	{:else}
		<span class="placeholder" aria-hidden="true"></span>
	{/if}
</div>

<style>
	.qr {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 1;
		padding: 9%;
		border-radius: 16px;
		background: #fff;
	}

	img,
	.placeholder {
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		image-rendering: pixelated;
	}

	.placeholder {
		background: repeating-conic-gradient(#eef0f4 0% 25%, #fff 0% 50%) 50% / 12px 12px;
		border-radius: 6px;
	}

	.corner {
		position: absolute;
		width: 14%;
		height: 14%;
		border: 3px solid #c9952f;
	}

	.tl {
		top: 4%;
		left: 4%;
		border-right: 0;
		border-bottom: 0;
		border-top-left-radius: 10px;
	}

	.tr {
		top: 4%;
		right: 4%;
		border-left: 0;
		border-bottom: 0;
		border-top-right-radius: 10px;
	}

	.bl {
		bottom: 4%;
		left: 4%;
		border-right: 0;
		border-top: 0;
		border-bottom-left-radius: 10px;
	}

	.br {
		bottom: 4%;
		right: 4%;
		border-left: 0;
		border-top: 0;
		border-bottom-right-radius: 10px;
	}
</style>
