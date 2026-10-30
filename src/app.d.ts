// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts for a signed-in organiser. */
			admin?: { email: string };
		}
	}
}

export {};
