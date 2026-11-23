<script lang="ts">
	let { name, size = 40 }: { name: string; size?: number } = $props();

	// Whole letters, so a Tamil initial keeps its vowel sign.
	const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
	const firstLetter = (word: string) =>
		segmenter ? (segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? '') : (Array.from(word)[0] ?? '');

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map(firstLetter)
			.join('')
			.toUpperCase()
	);
</script>

<span class="avatar" style:--size="{size}px" aria-hidden="true">{initials}</span>

<style>
	.avatar {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		background: var(--gold-tint);
		color: var(--gold-ink);
		font: 600 calc(var(--size) * 0.34) / 1 var(--font-sans);
		overflow: hidden;
	}
</style>
