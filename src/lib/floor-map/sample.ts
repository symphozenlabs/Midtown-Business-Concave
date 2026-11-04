/**
 * The mock stall floor map: an exhibition hall 37 m × 22 m with 32 stalls, a stage,
 * food court, lounge, registration and restrooms. The image is
 * static/floor-maps/sample-stall-floor-plan.svg, drawn from these same numbers,
 * so the traced layout sits exactly on it. Redraw the image if they change.
 */
import type { Layout, Point, Wall, Zone } from './layout.ts';

export const SAMPLE_IMAGE = { url: '/floor-maps/sample-stall-floor-plan.svg', width: 1600, height: 1000 };
/** 40 px per metre: the hall is 1480 px (37 m) by 880 px (22 m). */
export const SAMPLE_SCALE = 40;
export const SAMPLE_TITLE = 'Stall floor map · Hall A';

const rect = (x: number, y: number, w: number, h: number): Point[] => [
	[x, y],
	[x + w, y],
	[x + w, y + h],
	[x, y + h]
];

const wall = (id: string, a: Point, b: Point, thickness = 0.2, height = 3.2): Wall => ({ id, a, b, thickness, height });

/** Stall grid: two blocks (A left, B centre), four rows of four, back to back in pairs. */
export const STALL = { w: 90, h: 80, gap: 5, blocks: [{ name: 'A', x: 140 }, { name: 'B', x: 620 }], rows: [300, 380, 560, 640] };

export function sampleStalls(): Zone[] {
	const zones: Zone[] = [];
	for (const block of STALL.blocks) {
		let n = 1;
		for (const y of STALL.rows) {
			for (let c = 0; c < 4; c++) {
				const x = block.x + c * (STALL.w + STALL.gap);
				zones.push({
					id: `stall-${block.name}${n}`,
					type: 'stall',
					name: `${block.name}${n}`,
					polygon: rect(x, y, STALL.w, STALL.h),
					color: block.name === 'A' ? '#e3b04b' : '#f2c46d',
					height: 1,
					description: `Exhibitor stall ${block.name}${n}, 2.25 m × 2 m, in block ${block.name}${block.name === 'A' ? ' (left of the centre aisle)' : ' (right of the centre aisle)'}.`
				});
				n++;
			}
		}
	}
	return zones;
}

export function sampleLayout(): Layout {
	return {
		walls: [
			// Outer walls; the main entrance is the gap in the bottom wall (740–860).
			wall('w-top', [60, 60], [1540, 60]),
			wall('w-right-a', [1540, 60], [1540, 140]),
			wall('w-right-b', [1540, 210], [1540, 940]),
			wall('w-bottom-a', [1540, 940], [860, 940]),
			wall('w-bottom-b', [740, 940], [60, 940]),
			wall('w-left-a', [60, 940], [60, 520]),
			wall('w-left-b', [60, 440], [60, 60]),
			// Restrooms in the bottom-left corner, door gap 180–230.
			wall('w-wc-top', [60, 800], [180, 800], 0.15, 2.6),
			wall('w-wc-side', [240, 800], [240, 940], 0.15, 2.6),
			// Back wall behind the stage.
			wall('w-stage-back', [540, 80], [1060, 80], 0.15, 4)
		],
		zones: [
			{ id: 'stage', type: 'stage', name: 'Main stage', polygon: rect(560, 90, 480, 140), color: '#8b5cf6', height: 0.8, description: 'Keynotes, panels and the award ceremony. Seating is in front of the stage; arrive 10 minutes early for the keynote.' },
			...sampleStalls(),
			{ id: 'food', type: 'food', name: 'Food court', polygon: rect(1100, 290, 380, 230), color: '#f97316', height: 0.05, description: 'Breakfast, lunch and tea for delegates. Show your pass QR at the counter.' },
			{ id: 'lounge', type: 'lounge', name: 'Business lounge', polygon: rect(1100, 580, 380, 160), color: '#22c55e', height: 0.05, description: 'Quiet seating for one-to-one meetings and networking.' },
			{ id: 'reg', type: 'registration', name: 'Registration', polygon: rect(540, 800, 170, 60), color: '#14b8a6', height: 1.05, description: 'Collect your ID card and event kit here, just inside the main entrance.' },
			{ id: 'wc', type: 'restroom', name: 'Restrooms', polygon: rect(70, 810, 160, 120), color: '#64748b', height: 0.05, description: 'Restrooms in the bottom-left corner of the hall.' }
		],
		markers: [
			{ id: 'm-in', type: 'entrance', label: 'Main entrance', pos: [800, 905] },
			{ id: 'm-exit-l', type: 'exit', label: 'Fire exit', pos: [95, 480] },
			{ id: 'm-exit-r', type: 'exit', label: 'Exit', pos: [1505, 175] },
			{ id: 'm-help', type: 'info', label: 'Help desk', pos: [940, 830] },
			{ id: 'm-wc', type: 'restroom', label: 'Restrooms', pos: [205, 770] },
			{ id: 'm-first', type: 'firstaid', label: 'First aid', pos: [1460, 880] }
		],
		start: { pos: [800, 880], facing: 0 }
	};
}
