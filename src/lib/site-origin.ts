/**
 * The origin for links and QR codes sent to people: the live site, except on a local
 * test setup or a Vercel preview, whose links must lead back to that same test site.
 */
export function linkOrigin(o: { requestOrigin: string; siteUrl: string; localTesting: boolean; vercelEnv: string | undefined }): string {
	return o.localTesting || o.vercelEnv === 'preview' ? o.requestOrigin : o.siteUrl;
}
