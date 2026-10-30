import { DEFAULT_EVENT, type EventSettings } from './event-settings.ts';
import { DEFAULT_PAYMENT } from './payment.ts';
import { fetchSiteConfig } from './submit.ts';

/**
 * Settings the organisers change from the dashboard, for the prerendered public
 * page: it ships with the defaults and swaps in the live values once loaded.
 */
export const siteConfig = $state({
	priceRupees: DEFAULT_PAYMENT.priceRupees,
	event: { ...DEFAULT_EVENT } as EventSettings,
	loaded: false
});

let loading: Promise<void> | null = null;

/** Fetches once per page; later calls share the same request. */
export function loadSiteConfig() {
	loading ??= fetchSiteConfig().then((config) => {
		if (config.priceRupees != null) siteConfig.priceRupees = config.priceRupees;
		if (config.event) siteConfig.event = config.event;
		siteConfig.loaded = true;
	});
	return loading;
}
