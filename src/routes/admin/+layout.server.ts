import type { LayoutServerLoad } from './$types';

// Admin pages are dynamic and private: never prerendered or indexed.
export const prerender = false;

export const load: LayoutServerLoad = ({ locals }) => ({ admin: locals.admin ?? null });
