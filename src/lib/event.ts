export const EVENT = {
	name: 'Midtown Business Conclave',
	presenter: 'Salem Entrepreneurs Forum',
	presenterTagline: 'Meet. Learn. Collaborate. Grow.',
	tagline: 'Connecting entrepreneurs across Tamil Nadu at one place in Salem.',
	// As on the client-approved "I am attending" artwork.
	startsAt: '2026-11-28T10:00:00+05:30',
	endsAt: '2026-11-28T18:00:00+05:30',
	dateLabel: 'Saturday, 28 November 2026',
	shortDate: '28 Nov 2026',
	timeLabel: '10.00 am – 6.00 pm',
	compactDate: 'Sat, 28 Nov 2026',
	compactTime: '10 am – 6 pm',
	compactVenue: 'Salem, TN',
	venue: 'Salem, Tamil Nadu',
	partners: [
		{ role: 'Networking partner', name: 'Coimbatore Entrepreneurs Forum' },
		{ role: 'Event partner', name: 'Midtown Events' },
		{ role: 'AI technology partner', name: 'ITK' }
	]
} as const;

export interface City {
	name: string;
	lat: number;
	lon: number;
}

/** Salem is the hub; the rest are the poster's cities plus nearby business centres. */
export const SALEM: City = { name: 'Salem', lat: 11.6643, lon: 78.146 };

export const CITIES: City[] = [
	{ name: 'Chennai', lat: 13.0827, lon: 80.2707 },
	{ name: 'Vellore', lat: 12.9165, lon: 79.1325 },
	{ name: 'Hosur', lat: 12.7409, lon: 77.8253 },
	{ name: 'Dharmapuri', lat: 12.1211, lon: 78.1582 },
	{ name: 'Erode', lat: 11.341, lon: 77.7172 },
	{ name: 'Namakkal', lat: 11.2189, lon: 78.1674 },
	{ name: 'Tiruppur', lat: 11.1085, lon: 77.3411 },
	{ name: 'Coimbatore', lat: 11.0168, lon: 76.9558 },
	{ name: 'Trichy', lat: 10.7905, lon: 78.7047 },
	{ name: 'Madurai', lat: 9.9252, lon: 78.1198 },
	{ name: 'Tirunelveli', lat: 8.7139, lon: 77.7567 }
];

/** Straight-line distance in km. */
export function distanceKm(a: City, b: City): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}
