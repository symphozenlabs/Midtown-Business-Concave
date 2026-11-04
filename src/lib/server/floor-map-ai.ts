/**
 * "Analyse with AI": Claude reads an uploaded floor plan and returns its walls,
 * stalls and other zones, and markers (entrances, exits, help desks…) as JSON in the
 * image's pixel coordinates. The result only pre-fills the editor; the organiser
 * checks and corrects it before publishing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { DEFAULT_WALL, MARKER_TYPES, ZONE_TYPES, newId, type Layout, type Point } from '#lib/floor-map/layout.ts';

export const isFloorMapAiConfigured = Boolean(ANTHROPIC_API_KEY);

const MODEL = 'claude-opus-5-5';

const ZONE_VALUES = ZONE_TYPES.map((z) => z.value);
const MARKER_VALUES = MARKER_TYPES.map((m) => m.value);

/** Structured output: the API guarantees the reply matches this schema. */
const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['metres_per_100px', 'walls', 'zones', 'markers'],
	properties: {
		metres_per_100px: {
			type: 'number',
			description: 'Real-world metres covered by 100 image pixels, from a scale bar or printed dimensions. 0 if the plan gives no scale.'
		},
		walls: {
			type: 'array',
			description: 'Straight wall segments. Leave gaps where doors and openings are.',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['x1', 'y1', 'x2', 'y2'],
				properties: { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }
			}
		},
		zones: {
			type: 'array',
			description: 'Rectangular areas: every enclosed room (type "room", with its printed name such as "Conference room 2"), each stall or booth separately, plus stage, seating, food court, registration, restrooms, lounges.',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['type', 'name', 'x', 'y', 'width', 'height'],
				properties: {
					type: { type: 'string', enum: ZONE_VALUES },
					name: { type: 'string', description: 'Label printed on the plan (e.g. "A12", "Main stage"); empty if none.' },
					x: { type: 'number', description: 'Left edge in pixels.' },
					y: { type: 'number', description: 'Top edge in pixels.' },
					width: { type: 'number' },
					height: { type: 'number' }
				}
			}
		},
		markers: {
			type: 'array',
			description: 'Points of interest: entrances, exits, help desks, restrooms, food points, lifts or stairs, first aid.',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['type', 'label', 'x', 'y'],
				properties: {
					type: { type: 'string', enum: MARKER_VALUES },
					label: { type: 'string' },
					x: { type: 'number' },
					y: { type: 'number' }
				}
			}
		}
	}
} as const;

interface AiReply {
	metres_per_100px: number;
	walls: { x1: number; y1: number; x2: number; y2: number }[];
	zones: { type: string; name: string; x: number; y: number; width: number; height: number }[];
	markers: { type: string; label: string; x: number; y: number }[];
}

export class FloorMapAiError extends Error {}

export interface AiAnalysis {
	layout: Layout;
	/** Pixels per metre in the original image, when the plan shows a scale. */
	scalePxPerM: number | null;
}

/**
 * @param imageBase64 the plan as the browser sent it (already at most 2576 px on the long edge)
 * @param sentWidth width of that image in pixels
 * @param originalWidth width of the stored image the layout is drawn on
 */
export async function analyseFloorPlan(
	imageBase64: string,
	mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
	sentWidth: number,
	sentHeight: number,
	originalWidth: number
): Promise<AiAnalysis> {
	if (!ANTHROPIC_API_KEY) throw new FloorMapAiError('AI analysis is not set up (ANTHROPIC_API_KEY).');
	const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 1, timeout: 120_000 });

	let response;
	try {
		response = await client.beta.messages.create({
			model: MODEL,
			max_tokens: 16000,
			// If the model declines, the API retries on a fallback model in the same call.
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
			system:
				'You convert event-venue floor plans into structured geometry for a 3D viewer. Coordinates are pixels of the image you are given: origin at the top-left corner, x to the right, y downwards. Be precise: trace walls along their centre lines, and give every stall or booth its own rectangle with its printed number or name.',
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
						{
							type: 'text',
							text: `This floor plan is ${sentWidth} × ${sentHeight} pixels. List its walls, rooms and other zones (each stall separately) and markers. Ignore the title, legend, scale bar and furniture such as tables and sofas.`
						}
					]
				}
			]
		});
	} catch (e) {
		if (e instanceof Anthropic.AuthenticationError) throw new FloorMapAiError('The Claude API key was refused. Check ANTHROPIC_API_KEY.');
		if (e instanceof Anthropic.RateLimitError) throw new FloorMapAiError('The AI service is busy. Try again in a minute.');
		if (e instanceof Anthropic.BadRequestError) throw new FloorMapAiError(`The AI service could not read this image: ${e.message}`);
		if (e instanceof Anthropic.APIError) throw new FloorMapAiError(`The AI service failed (${e.status ?? 'network'}). Try again.`);
		throw e;
	}

	if (response.stop_reason === 'refusal') throw new FloorMapAiError('The AI declined to analyse this image.');
	if (response.stop_reason === 'max_tokens') throw new FloorMapAiError('The plan has too many items to analyse in one go. Trace it by hand or use a simpler plan.');
	const textBlock = response.content.find((b) => b.type === 'text');
	if (!textBlock || textBlock.type !== 'text') throw new FloorMapAiError('The AI returned no result.');

	let reply: AiReply;
	try {
		reply = JSON.parse(textBlock.text) as AiReply;
	} catch {
		throw new FloorMapAiError('The AI result could not be read. Try again.');
	}

	// Back to the stored image's pixels.
	const k = originalWidth / sentWidth;
	const p = (x: number, y: number): Point => [Math.round(x * k * 10) / 10, Math.round(y * k * 10) / 10];

	const layout: Layout = {
		walls: reply.walls.map((w) => ({ id: newId('w'), a: p(w.x1, w.y1), b: p(w.x2, w.y2), ...DEFAULT_WALL })),
		zones: reply.zones.map((z) => {
			const info = ZONE_TYPES.find((t) => t.value === z.type) ?? ZONE_TYPES[ZONE_TYPES.length - 1];
			return {
				id: newId('z'),
				type: info.value,
				name: z.name,
				polygon: [p(z.x, z.y), p(z.x + z.width, z.y), p(z.x + z.width, z.y + z.height), p(z.x, z.y + z.height)],
				color: info.color,
				height: info.height,
				description: ''
			};
		}),
		markers: reply.markers.map((m) => ({ id: newId('m'), type: m.type as Layout['markers'][number]['type'], label: m.label, pos: p(m.x, m.y) })),
		start: null
	};
	const entrance = layout.markers.find((m) => m.type === 'entrance');
	if (entrance) layout.start = { pos: entrance.pos, facing: 0 };

	const mPer100 = reply.metres_per_100px;
	const scalePxPerM = mPer100 > 0 ? (100 * k) / mPer100 : null;
	return { layout, scalePxPerM: scalePxPerM && scalePxPerM > 1 && scalePxPerM < 2000 ? scalePxPerM : null };
}
