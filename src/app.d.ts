// See https://svelte.dev/docs/kit/types#app.d.ts
import type { HandlerSession } from '#lib/server/ops/handlers.ts';

declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts for a signed-in organiser. */
			admin?: { email: string };
			/** Set by hooks.server.ts for a signed-in event handler on /handler and /api/ops. */
			handler?: HandlerSession;
		}
	}
}

export {};
