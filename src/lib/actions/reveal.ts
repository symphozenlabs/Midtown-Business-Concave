import type { Action } from 'svelte/action';

/** Fades an element up once when it enters the viewport. Pair with `data-reveal`. */
export const reveal: Action<HTMLElement, number | undefined> = (node, delay = 0) => {
	node.setAttribute('data-reveal', '');
	if (delay) node.style.setProperty('--reveal-delay', `${delay}ms`);

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.add('is-revealed');
					observer.disconnect();
				}
			}
		},
		{ rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
	);
	observer.observe(node);

	return { destroy: () => observer.disconnect() };
};
