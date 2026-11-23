/** Browser side of directory notifications. The permission prompt appears only from turnOnPush(). */

export type PushState = 'unsupported' | 'ios-home-screen' | 'denied' | 'off' | 'on';

const SW_URL = '/directory-sw.js';

function isIos(): boolean {
	return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
	return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iOS only allows push from a Home Screen web app (16.4 and later), never a Safari tab. */
export async function pushState(): Promise<PushState> {
	if (isIos() && !isStandalone()) return 'ios-home-screen';
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const registration = await navigator.serviceWorker.getRegistration('/');
	const subscription = await registration?.pushManager.getSubscription();
	return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/** Asks for permission, subscribes this browser and tells the server. */
export async function turnOnPush(publicKey: string): Promise<PushState> {
	const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
	const permission = await Notification.requestPermission();
	if (permission === 'denied') return 'denied';
	if (permission !== 'granted') return 'off';
	await navigator.serviceWorker.ready;
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
	const res = await fetch('/api/directory/push', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(subscription.toJSON())
	});
	return res.ok ? 'on' : 'off';
}
