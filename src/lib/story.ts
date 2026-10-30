import type { City } from './event';

/** A branch of the network, highlighted on the story map in this order. */
export interface Branch extends City {
	/** Short regional descriptor shown with the city name. */
	region: string;
	/** One line about the city's business character. */
	note: string;
	/** Which side of the marker the label sits on. */
	side: 'left' | 'right';
}

/**
 * The cities on the event poster, Salem being the hub. Edit this list to match
 * the forum's branches: order here is the order they light up on the map.
 */
export const BRANCHES: Branch[] = [
	{
		name: 'Chennai',
		lat: 13.0827,
		lon: 80.2707,
		region: 'The capital',
		note: 'Ports, finance and technology on the Coromandel coast.',
		side: 'right'
	},
	{
		name: 'Coimbatore',
		lat: 11.0168,
		lon: 76.9558,
		region: 'The western hub',
		note: 'Textiles, pumps and precision engineering.',
		side: 'left'
	},
	{
		name: 'Trichy',
		lat: 10.7905,
		lon: 78.7047,
		region: 'The centre',
		note: 'Heavy engineering and the Cauvery delta.',
		side: 'right'
	},
	{
		name: 'Madurai',
		lat: 9.9252,
		lon: 78.1198,
		region: 'The south',
		note: 'Trade and tourism in the temple city.',
		side: 'right'
	},
	{
		name: 'Tirunelveli',
		lat: 8.7139,
		lon: 77.7567,
		region: 'The deep south',
		note: 'Agri-business and wind power near the Western Ghats.',
		side: 'right'
	}
];
