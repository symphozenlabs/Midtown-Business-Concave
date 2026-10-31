/**
 * Hall attendance scanned without a connection waits here and is sent when the
 * phone is back online. Only hall attendance queues: gate entry, meals and
 * certificates must be confirmed by the server before anyone is let through or
 * served. Each item keeps its clientScanId, so a send that was received but
 * whose answer was lost is not recorded twice.
 */

export interface QueuedScan {
	clientScanId: string;
	category: 'hall';
	eventId?: string;
	scanned: string;
	sessionId?: string;
	scannedAt: string;
}

const KEY = 'mbc-offline-scans';
const MAX = 2000;

export function queued(): QueuedScan[] {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? '[]');
	} catch {
		return [];
	}
}

function save(items: QueuedScan[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
		return true;
	} catch {
		return false;
	}
}

/** False when the phone cannot store it (private mode, storage full). */
export function enqueue(item: QueuedScan) {
	return save([...queued(), item]);
}

let syncing = false;

/**
 * Sends queued scans one at a time. `send` resolves true when the server
 * answered (recorded, duplicate or rejected alike) and false when the network
 * failed, which stops the run and keeps the rest for later.
 */
export async function flush(send: (item: QueuedScan) => Promise<boolean>): Promise<number> {
	if (syncing) return 0;
	syncing = true;
	let sent = 0;
	try {
		for (const item of queued()) {
			if (!(await send(item))) break;
			save(queued().filter((q) => q.clientScanId !== item.clientScanId));
			sent++;
		}
	} finally {
		syncing = false;
	}
	return sent;
}
