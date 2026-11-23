import { describe, expect, it } from 'vitest';
import { linkOrigin } from './site-origin.ts';

const live = 'https://conclave.midtownevents.in';

describe('linkOrigin', () => {
	it('uses the live site in production, wherever the request came from', () =>
		expect(linkOrigin({ requestOrigin: 'https://midtown-business-concave.vercel.app', siteUrl: live, localTesting: false, vercelEnv: 'production' })).toBe(live));
	it('keeps a preview deployment’s links on the preview', () =>
		expect(linkOrigin({ requestOrigin: 'https://midtown-abc123.vercel.app', siteUrl: live, localTesting: false, vercelEnv: 'preview' })).toBe('https://midtown-abc123.vercel.app'));
	it('keeps local test links local', () =>
		expect(linkOrigin({ requestOrigin: 'http://localhost:5173', siteUrl: live, localTesting: true, vercelEnv: undefined })).toBe('http://localhost:5173'));
	it('uses the live site from a laptop on the live database', () =>
		expect(linkOrigin({ requestOrigin: 'http://localhost:5173', siteUrl: live, localTesting: false, vercelEnv: undefined })).toBe(live));
});
