import { parseDirectorySettings, type DirectorySettings } from '#lib/directory/rules.ts';
import { sql } from '../db.ts';
import { opsReady } from '../ops/event.ts';
import { readSetting, writeSetting } from '../store.ts';

let tablesReady = false;

/**
 * True once db/schema.sql has added the directory tables. Until then the page says
 * the directory opens soon instead of failing. Only a positive answer is cached:
 * rerunning the schema switches it on.
 */
export async function directoryReady(): Promise<boolean> {
	if (tablesReady) return true;
	if (!(await opsReady())) return false;
	try {
		const [r] = await sql()`select to_regclass('public.directory_messages') is not null as ready`;
		tablesReady = Boolean(r?.ready);
	} catch (e) {
		console.error('[directory] could not check the database schema', e);
	}
	return tablesReady;
}

// Every directory request reads these; 30 seconds of staleness is fine.
const SETTINGS_TTL_MS = 30_000;
let cached: { value: DirectorySettings; at: number } | null = null;

/** Closing time, daily email cap and the push switch, with defaults for anything unset. */
export async function getDirectorySettings(): Promise<DirectorySettings> {
	if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) return cached.value;
	const value = parseDirectorySettings(await readSetting('directory'));
	cached = { value, at: Date.now() };
	return value;
}

export async function saveDirectorySettings(s: DirectorySettings, by: string): Promise<void> {
	const value = parseDirectorySettings(s);
	await writeSetting('directory', value, by);
	cached = { value, at: Date.now() };
}
