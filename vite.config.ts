import cloudflare from '@sveltejs/adapter-cloudflare';
import vercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Vercel sets VERCEL=1 during its builds; everywhere else (Cloudflare Pages,
// local builds) the Cloudflare adapter is used.
const adapter = process.env.VERCEL
	? vercel({
			runtime: 'nodejs24.x',
			// Sending a batch of ticket emails (each with the 4K poster attached) takes
			// longer than the default function time limit.
			maxDuration: 60
		})
	: cloudflare();

export default defineConfig({
	plugins: [
		sveltekit({
			adapter
		})
	],
	// Pre-bundle the QR libraries at startup. Otherwise the first visit to the admin
	// configuration page makes Vite optimise them mid-session and reload the page,
	// which throws away a QR image the organiser has just chosen.
	optimizeDeps: {
		include: ['jsqr', 'qrcode']
	}
});
