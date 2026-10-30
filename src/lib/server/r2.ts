import { AwsClient } from 'aws4fetch';
import { dev } from '$app/env';
import { R2_ACCESS_KEY_ID, R2_S3_API_URL, R2_SECRET_ACCESS_KEY } from '$app/env/private';

export const isR2Configured = Boolean(R2_S3_API_URL && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

/** In development without R2, objects live in memory until the dev server restarts. */
const memory = new Map<string, { body: Uint8Array; contentType: string }>();
const useMemory = !isR2Configured && dev;

let client: AwsClient | null = null;

function r2() {
	client ??= new AwsClient({
		accessKeyId: R2_ACCESS_KEY_ID!,
		secretAccessKey: R2_SECRET_ACCESS_KEY!,
		service: 's3',
		region: 'auto'
	});
	return client;
}

function objectUrl(key: string) {
	return `${R2_S3_API_URL!.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export const isStorageAvailable = isR2Configured || useMemory;

/** Stores an object through R2's S3-compatible API. */
export async function putObject(key: string, body: Uint8Array, contentType: string) {
	if (useMemory) {
		memory.set(key, { body, contentType });
		return;
	}
	const res = await r2().fetch(objectUrl(key), {
		method: 'PUT',
		body: body as BodyInit,
		headers: { 'content-type': contentType, 'cache-control': 'private, max-age=31536000' }
	});
	if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
}

export async function getObject(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
	if (useMemory) return memory.get(key) ?? null;
	const res = await r2().fetch(objectUrl(key));
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`R2 download failed (${res.status})`);
	return {
		body: new Uint8Array(await res.arrayBuffer()),
		contentType: res.headers.get('content-type') ?? 'application/octet-stream'
	};
}

export async function deleteObject(key: string | null | undefined) {
	if (!key) return;
	if (useMemory) {
		memory.delete(key);
		return;
	}
	await r2()
		.fetch(objectUrl(key), { method: 'DELETE' })
		.catch(() => undefined);
}
