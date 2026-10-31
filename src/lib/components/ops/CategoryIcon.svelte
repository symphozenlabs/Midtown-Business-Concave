<script lang="ts">
	import { Award, DoorOpen, Handshake, Presentation, Ticket, Utensils } from '@lucide/svelte';
	import type { Category } from '#lib/ops/categories.ts';

	let { category, size = 24 }: { category: Category; size?: number } = $props();

	const ICONS = { ticket: Ticket, gate: DoorOpen, hall: Presentation, food: Utensils, certificate: Award, networking: Handshake };
	const Icon = $derived(ICONS[category]);
</script>

<Icon {size} aria-hidden="true" />
