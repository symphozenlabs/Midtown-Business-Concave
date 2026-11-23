import { defineConfig } from 'vitest/config';

// Unit tests for plain modules (no SvelteKit plugin): `npm test`.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts']
	}
});
