import { pollDelay } from './rules.ts';

/**
 * Asks the server for news while the page is visible: every 10 s in an active
 * conversation, slowing to 30 s after two quiet minutes, 30 s elsewhere. Pauses while
 * the tab is hidden and checks at once when it comes back. `tick` resolves true when
 * something new arrived. Returns stop().
 */
export function startPolling(opts: { inConversation: boolean; tick: () => Promise<boolean> }): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	let stopped = false;
	let lastNews = Date.now();

	const clear = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};

	const schedule = () => {
		clear();
		if (stopped || document.visibilityState === 'hidden') return;
		timer = setTimeout(run, pollDelay({ inConversation: opts.inConversation, quietMs: Date.now() - lastNews }));
	};

	async function run() {
		timer = null;
		if (stopped || running) return;
		running = true;
		try {
			if (await opts.tick()) lastNews = Date.now();
		} catch {
			// Patchy Wi-Fi: try again next time.
		} finally {
			running = false;
		}
		schedule();
	}

	const onVisibility = () => {
		if (document.visibilityState === 'visible') {
			clear();
			void run();
		} else {
			clear();
		}
	};

	document.addEventListener('visibilitychange', onVisibility);
	schedule();
	return () => {
		stopped = true;
		clear();
		document.removeEventListener('visibilitychange', onVisibility);
	};
}
