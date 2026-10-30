import Lenis from 'lenis';

let lenis: Lenis | null = null;

function prefersReducedMotion() {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Gentle inertial scrolling; skipped entirely for reduced motion. Returns a cleanup. */
export function startSmoothScroll(): () => void {
	if (prefersReducedMotion()) return () => {};

	lenis = new Lenis({
		lerp: 0.085,
		wheelMultiplier: 0.9,
		smoothWheel: true,
		anchors: { offset: -16 }
	});

	let frame = 0;
	const raf = (time: number) => {
		lenis?.raf(time);
		frame = requestAnimationFrame(raf);
	};
	frame = requestAnimationFrame(raf);

	return () => {
		cancelAnimationFrame(frame);
		lenis?.destroy();
		lenis = null;
	};
}

export function scrollToElement(el: HTMLElement, offset = -24) {
	if (lenis) {
		lenis.scrollTo(el, { offset, duration: 1.1 });
	} else {
		const top = el.getBoundingClientRect().top + window.scrollY + offset;
		window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
	}
}

export function onScroll(callback: (scrollY: number) => void): () => void {
	if (lenis) {
		return lenis.on('scroll', (l: Lenis) => callback(l.scroll));
	}
	const handler = () => callback(window.scrollY);
	window.addEventListener('scroll', handler, { passive: true });
	return () => window.removeEventListener('scroll', handler);
}
