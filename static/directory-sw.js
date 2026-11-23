// Visitors directory notifications. Registered only when a delegate taps
// "Turn on notifications"; it shows pushes and opens the conversation on tap.
// It handles no fetches, so it never changes how the site loads.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = {};
	}
	const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/visitorDirectory';
	// Always show something: iOS ends subscriptions whose pushes show nothing.
	event.waitUntil(
		self.registration.showNotification(data.title || 'New message', {
			body: data.body || 'Tap to read and reply',
			icon: '/icons/directory-192.png',
			badge: '/icons/directory-192.png',
			tag: url,
			data: { url }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/visitorDirectory';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
			for (const w of windows) {
				if ('focus' in w) {
					return w.navigate(url).then((n) => (n || w).focus());
				}
			}
			return self.clients.openWindow(url);
		})
	);
});
