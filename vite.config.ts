import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter()
		})
	],
	// Pre-bundle the QR libraries at startup. Otherwise the first visit to the admin
	// configuration page makes Vite optimise them mid-session and reload the page,
	// which throws away a QR image the organiser has just chosen.
	optimizeDeps: {
		include: ['jsqr', 'qrcode']
	}
});
