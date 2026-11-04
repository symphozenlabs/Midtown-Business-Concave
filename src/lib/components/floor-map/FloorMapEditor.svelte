<!--
	2D floor map editor: the uploaded plan with walls, zones (stalls, stage, food court…),
	and markers drawn over it. Select and drag to move, drag
	the round handles to reshape, and use the tools to add more. Undo/redo, snap to a
	half-metre grid and to 45° angles, and scale calibration from two points.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		CopyPlus,
		Grid3x3,
		Hand,
		MapPin,
		Maximize2,
		MousePointer2,
		Pentagon,
		Redo2,
		Ruler,
		Square,
		Trash2,
		TriangleRight,
		Undo2,
		ZoomIn,
		ZoomOut,
		Minus
	} from '@lucide/svelte';
	import {
		DEFAULT_WALL,
		MARKER_TYPES,
		ZONE_TYPES,
		markerInfo,
		newId,
		zoneInfo,
		type Layout,
		type MarkerType,
		type Point,
		type ZoneType
	} from '#lib/floor-map/layout.ts';

	interface Props {
		imageUrl: string;
		imageWidth: number;
		imageHeight: number;
		layout: Layout;
		/** Pixels per metre. */
		scale: number;
		/** Called after any change, so the page can mark the draft unsaved. */
		onchange?: () => void;
	}

	let { imageUrl, imageWidth, imageHeight, layout = $bindable(), scale = $bindable(), onchange }: Props = $props();

	type Tool = 'select' | 'pan' | 'wall' | 'rect' | 'polygon' | 'marker' | 'start' | 'calibrate';
	type Selection = { kind: 'wall' | 'zone' | 'marker'; id: string } | { kind: 'start'; id: 'start' } | null;

	const TOOLS: { id: Tool; label: string; key: string; icon: typeof Square }[] = [
		{ id: 'select', label: 'Select & move', key: 'V', icon: MousePointer2 },
		{ id: 'pan', label: 'Pan', key: 'H', icon: Hand },
		{ id: 'wall', label: 'Wall', key: 'W', icon: Minus },
		{ id: 'rect', label: 'Stall / area (rectangle)', key: 'R', icon: Square },
		{ id: 'polygon', label: 'Area (any shape)', key: 'P', icon: Pentagon },
		{ id: 'marker', label: 'Marker', key: 'M', icon: MapPin },
		{ id: 'calibrate', label: 'Calibrate scale', key: 'C', icon: Ruler }
	];

	let tool = $state<Tool>('select');
	let zoneType = $state<ZoneType>('stall');
	let markerType = $state<MarkerType>('entrance');
	let selection = $state<Selection>(null);
	let snapGrid = $state(true);
	let snapAngle = $state(true);

	let svg: SVGSVGElement;
	let host: HTMLDivElement;
	let view = $state(untrack(() => fit()));
	let hover = $state<Point | null>(null);

	// Drafts while drawing.
	let draftWall = $state<{ a: Point; b: Point } | null>(null);
	let draftRect = $state<{ a: Point; b: Point } | null>(null);
	let draftPoly = $state<Point[]>([]);
	let calib = $state<Point[]>([]);
	let calibMetres = $state<number | null>(null);

	let undoStack = $state<string[]>([]);
	let redoStack = $state<string[]>([]);

	let drag:
		| { kind: 'move'; start: Point; before: string; moved: boolean; original: Layout }
		| { kind: 'vertex'; target: 'wallA' | 'wallB' | 'zone'; id: string; index: number; before: string; moved: boolean }
		| { kind: 'pan'; sx: number; sy: number; view: typeof view; k: number }
		| { kind: 'rect' }
		| { kind: 'wall' }
		| null = null;

	/* ---------- geometry helpers ---------- */

	function fit() {
		const pad = Math.max(imageWidth, imageHeight) * 0.04;
		return { x: -pad, y: -pad, w: imageWidth + pad * 2, h: imageHeight + pad * 2 };
	}

	let stageW = $state(800);
	let stageH = $state(500);
	/** Image pixels per screen pixel: handle sizes and snapping distances use it. */
	const unit = $derived(Math.max(view.w / Math.max(1, stageW), view.h / Math.max(1, stageH)));
	const grid = $derived(scale * 0.5);

	function toImage(e: { clientX: number; clientY: number }): Point {
		const m = svg.getScreenCTM();
		if (!m) return [0, 0];
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
		return [p.x, p.y];
	}

	const round = (v: number) => Math.round(v * 10) / 10;
	const snapPt = (p: Point): Point => (snapGrid ? [round(Math.round(p[0] / grid) * grid), round(Math.round(p[1] / grid) * grid)] : [round(p[0]), round(p[1])]);

	/** Wall endpoints within 10 screen pixels pull the point onto them, so walls join cleanly. */
	function magnet(p: Point, skipId?: string): Point {
		const reach = 10 * unit;
		let best: Point | null = null;
		let bestD = reach;
		for (const w of layout.walls) {
			if (w.id === skipId) continue;
			for (const q of [w.a, w.b]) {
				const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
				if (d < bestD) {
					bestD = d;
					best = q;
				}
			}
		}
		return best ? [...best] : snapPt(p);
	}

	function angleSnap(a: Point, b: Point): Point {
		if (!snapAngle) return b;
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const len = Math.hypot(dx, dy);
		const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
		return [round(a[0] + Math.cos(ang) * len), round(a[1] + Math.sin(ang) * len)];
	}

	const metres = (px: number) => px / scale;
	const fmtM = (px: number) => `${metres(px).toFixed(metres(px) < 10 ? 2 : 1)} m`;

	/* ---------- history ---------- */

	const snapshot = () => JSON.stringify($state.snapshot(layout));

	function commit(before = snapshot()) {
		undoStack = [...undoStack.slice(-79), before];
		redoStack = [];
		onchange?.();
	}

	function undo() {
		const prev = undoStack.at(-1);
		if (!prev) return;
		redoStack = [...redoStack, snapshot()];
		undoStack = undoStack.slice(0, -1);
		layout = JSON.parse(prev);
		selection = null;
		onchange?.();
	}

	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		undoStack = [...undoStack, snapshot()];
		redoStack = redoStack.slice(0, -1);
		layout = JSON.parse(next);
		selection = null;
		onchange?.();
	}

	/** Selects a zone from outside (the rooms list) and switches to the select tool. */
	export function selectZone(id: string) {
		setTool('select');
		selection = { kind: 'zone', id };
		host.focus({ preventScroll: true });
	}

	/** Replaces the whole layout (analysis results): one undo step. */
	export function replaceLayout(next: Layout) {
		commit();
		layout = next;
		selection = null;
	}

	/* ---------- selection helpers ---------- */

	const selWall = $derived(selection?.kind === 'wall' ? layout.walls.find((w) => w.id === selection!.id) : undefined);
	const selZone = $derived(selection?.kind === 'zone' ? layout.zones.find((z) => z.id === selection!.id) : undefined);
	const selMarker = $derived(selection?.kind === 'marker' ? layout.markers.find((m) => m.id === selection!.id) : undefined);

	function remove() {
		if (!selection) return;
		commit();
		if (selection.kind === 'wall') layout.walls = layout.walls.filter((w) => w.id !== selection!.id);
		else if (selection.kind === 'zone') layout.zones = layout.zones.filter((z) => z.id !== selection!.id);
		else if (selection.kind === 'marker') layout.markers = layout.markers.filter((m) => m.id !== selection!.id);
		else layout.start = null;
		selection = null;
	}

	/** Next stall name after the last one: A7 → A8, 12 → 13; otherwise S1, S2… */
	function nextStallName() {
		const stalls = layout.zones.filter((z) => z.type === 'stall');
		for (let i = stalls.length - 1; i >= 0; i--) {
			const m = /^(.*?)(\d+)$/.exec(stalls[i].name);
			if (m) {
				const prefix = m[1];
				const used = new Set(stalls.map((s) => s.name));
				let n = Number(m[2]) + 1;
				while (used.has(`${prefix}${n}`)) n++;
				return `${prefix}${n}`;
			}
		}
		return `S${stalls.length + 1}`;
	}

	function duplicate() {
		const offset = snapGrid ? grid * 2 : 20;
		if (selZone) {
			commit();
			const copy = {
				...$state.snapshot(selZone),
				id: newId('z'),
				name: selZone.type === 'stall' ? nextStallName() : selZone.name,
				polygon: selZone.polygon.map((p) => [round(p[0] + offset), p[1]] as Point)
			};
			layout.zones.push(copy);
			selection = { kind: 'zone', id: copy.id };
		} else if (selWall) {
			commit();
			const copy = { ...$state.snapshot(selWall), id: newId('w'), a: [selWall.a[0] + offset, selWall.a[1] + offset] as Point, b: [selWall.b[0] + offset, selWall.b[1] + offset] as Point };
			layout.walls.push(copy);
			selection = { kind: 'wall', id: copy.id };
		}
	}

	function nudge(dx: number, dy: number) {
		if (!selection) return;
		commit();
		moveSelection(dx, dy, $state.snapshot(layout) as Layout);
	}

	/** Moves the selection by (dx, dy) from its position in `original`. */
	function moveSelection(dx: number, dy: number, original: Layout) {
		const sh = (p: Point): Point => [round(p[0] + dx), round(p[1] + dy)];
		if (selection?.kind === 'wall') {
			const o = original.walls.find((w) => w.id === selection!.id);
			const w = layout.walls.find((x) => x.id === selection!.id);
			if (o && w) {
				w.a = sh(o.a);
				w.b = sh(o.b);
			}
		} else if (selection?.kind === 'zone') {
			const o = original.zones.find((z) => z.id === selection!.id);
			const z = layout.zones.find((x) => x.id === selection!.id);
			if (o && z) z.polygon = o.polygon.map(sh);
		} else if (selection?.kind === 'marker') {
			const o = original.markers.find((m) => m.id === selection!.id);
			const m = layout.markers.find((x) => x.id === selection!.id);
			if (o && m) m.pos = sh(o.pos);
		} else if (selection?.kind === 'start' && original.start && layout.start) {
			layout.start.pos = sh(original.start.pos);
		}
	}

	/* ---------- pointer handling ---------- */

	function startPan(e: PointerEvent) {
		drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: { ...view }, k: unit };
	}

	function onBackgroundDown(e: PointerEvent) {
		host.focus({ preventScroll: true });
		svg.setPointerCapture(e.pointerId);
		if (e.button === 1 || tool === 'pan' || (e.button === 0 && e.altKey)) return startPan(e);
		if (e.button !== 0) return;
		const p = toImage(e);

		switch (tool) {
			case 'select':
				selection = null;
				startPan(e);
				break;
			case 'wall': {
				const a = magnet(p);
				draftWall = { a, b: a };
				drag = { kind: 'wall' };
				break;
			}
			case 'rect': {
				const a = snapPt(p);
				draftRect = { a, b: a };
				drag = { kind: 'rect' };
				break;
			}
			case 'polygon': {
				const q = snapPt(p);
				if (draftPoly.length >= 3 && Math.hypot(q[0] - draftPoly[0][0], q[1] - draftPoly[0][1]) < 12 * unit) finishPolygon();
				else draftPoly = [...draftPoly, q];
				break;
			}
			case 'marker': {
				commit();
				const info = markerInfo(markerType);
				const m = { id: newId('m'), type: markerType, label: info.label, pos: snapPt(p) };
				layout.markers.push(m);
				selection = { kind: 'marker', id: m.id };
				break;
			}
			case 'start':
				commit();
				layout.start = { pos: snapPt(p), facing: layout.start?.facing ?? 0 };
				selection = { kind: 'start', id: 'start' };
				break;
			case 'calibrate':
				calib = calib.length >= 2 ? [[round(p[0]), round(p[1])]] : [...calib, [round(p[0]), round(p[1])]];
				calibMetres = null;
				break;
		}
	}

	function onItemDown(e: PointerEvent, sel: NonNullable<Selection>) {
		if (tool !== 'select') return; // other tools draw on top of items
		e.stopPropagation();
		host.focus({ preventScroll: true });
		if (e.button !== 0) return;
		svg.setPointerCapture(e.pointerId);
		selection = sel;
		drag = { kind: 'move', start: toImage(e), before: snapshot(), moved: false, original: $state.snapshot(layout) as Layout };
	}

	function onHandleDown(e: PointerEvent, target: 'wallA' | 'wallB' | 'zone', id: string, index: number) {
		e.stopPropagation();
		if (e.button !== 0) return;
		svg.setPointerCapture(e.pointerId);
		drag = { kind: 'vertex', target, id, index, before: snapshot(), moved: false };
	}

	function onMove(e: PointerEvent) {
		const p = toImage(e);
		hover = p;
		if (!drag) return;
		switch (drag.kind) {
			case 'pan': {
				view = { ...drag.view, x: drag.view.x - (e.clientX - drag.sx) * drag.k, y: drag.view.y - (e.clientY - drag.sy) * drag.k };
				break;
			}
			case 'wall':
				if (draftWall) {
					const b = angleSnap(draftWall.a, snapPt(p));
					const m = magnet(b);
					draftWall = { ...draftWall, b: Math.hypot(m[0] - b[0], m[1] - b[1]) < 10 * unit ? m : b };
				}
				break;
			case 'rect':
				if (draftRect) draftRect = { ...draftRect, b: snapPt(p) };
				break;
			case 'move': {
				let dx = p[0] - drag.start[0];
				let dy = p[1] - drag.start[1];
				if (snapGrid) {
					dx = Math.round(dx / grid) * grid;
					dy = Math.round(dy / grid) * grid;
				}
				if (!drag.moved && Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) < 3 * unit) return;
				drag.moved = true;
				moveSelection(dx, dy, drag.original);
				break;
			}
			case 'vertex': {
				const d = drag;
				d.moved = true;
				if (d.target === 'zone') {
					const z = layout.zones.find((x) => x.id === d.id);
					if (z) z.polygon[d.index] = snapPt(p);
				} else {
					const w = layout.walls.find((x) => x.id === d.id);
					if (w) {
						const fixed = d.target === 'wallA' ? w.b : w.a;
						const q = magnet(angleSnap(fixed, snapPt(p)), w.id);
						if (d.target === 'wallA') w.a = q;
						else w.b = q;
					}
				}
				break;
			}
		}
	}

	function onUp() {
		if (!drag) return;
		const d = drag;
		drag = null;
		if (d.kind === 'wall' && draftWall) {
			const { a, b } = draftWall;
			draftWall = null;
			if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 4 * unit) {
				commit();
				const w = { id: newId('w'), a, b, ...DEFAULT_WALL };
				layout.walls.push(w);
				selection = { kind: 'wall', id: w.id };
			}
		} else if (d.kind === 'rect' && draftRect) {
			const { a, b } = draftRect;
			draftRect = null;
			const x0 = Math.min(a[0], b[0]);
			const y0 = Math.min(a[1], b[1]);
			const x1 = Math.max(a[0], b[0]);
			const y1 = Math.max(a[1], b[1]);
			if (x1 - x0 > 4 * unit && y1 - y0 > 4 * unit) addZone([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
		} else if ((d.kind === 'move' || d.kind === 'vertex') && d.moved) {
			commit(d.before);
		}
	}

	function addZone(polygon: Point[]) {
		commit();
		const info = zoneInfo(zoneType);
		const z = {
			id: newId('z'),
			type: zoneType,
			name: zoneType === 'stall' ? nextStallName() : info.label,
			polygon,
			color: info.color,
			height: info.height,
			description: ''
		};
		layout.zones.push(z);
		selection = { kind: 'zone', id: z.id };
	}

	function finishPolygon() {
		if (draftPoly.length >= 3) addZone(draftPoly);
		draftPoly = [];
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		zoomAt(toImage(e), e.deltaY > 0 ? 1.15 : 1 / 1.15);
	}

	function zoomAt(p: Point, k: number) {
		const w = Math.min(Math.max(imageWidth, imageHeight) * 4, Math.max(40, view.w * k));
		const real = w / view.w;
		view = { x: p[0] - (p[0] - view.x) * real, y: p[1] - (p[1] - view.y) * real, w, h: view.h * real };
	}

	const zoomCentre = (k: number) => zoomAt([view.x + view.w / 2, view.y + view.h / 2], k);

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, select, textarea')) return;
		const k = e.key.toLowerCase();
		const mod = e.ctrlKey || e.metaKey;
		if (mod && k === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
		} else if (mod && k === 'y') {
			e.preventDefault();
			redo();
		} else if (mod && k === 'd') {
			e.preventDefault();
			duplicate();
		} else if (k === 'delete' || k === 'backspace') {
			e.preventDefault();
			remove();
		} else if (k === 'escape') {
			draftPoly = [];
			draftWall = null;
			draftRect = null;
			calib = [];
			selection = null;
		} else if (k === 'enter' && tool === 'polygon') {
			finishPolygon();
		} else if (k.startsWith('arrow') && selection) {
			e.preventDefault();
			const step = (e.shiftKey ? 10 : 1) * (snapGrid ? grid : 2);
			nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
		} else if (!mod) {
			const t = TOOLS.find((x) => x.key.toLowerCase() === k);
			if (t) setTool(t.id);
		}
	}

	function setTool(t: Tool) {
		tool = t;
		draftPoly = [];
		draftWall = null;
		draftRect = null;
		if (t !== 'calibrate') calib = [];
	}

	function applyCalibration() {
		if (calib.length !== 2 || !calibMetres || calibMetres <= 0) return;
		const px = Math.hypot(calib[1][0] - calib[0][0], calib[1][1] - calib[0][1]);
		if (px < 2) return;
		scale = Math.round((px / calibMetres) * 1000) / 1000;
		calib = [];
		calibMetres = null;
		setTool('select');
		onchange?.();
	}

	/** Records an undo step when a property field starts changing. */
	let fieldBefore: string | null = null;
	const fieldFocus = () => (fieldBefore = snapshot());
	const fieldChange = () => {
		if (fieldBefore && fieldBefore !== snapshot()) commit(fieldBefore);
		fieldBefore = snapshot();
	};

	const handleR = $derived(5 * unit);
	const pts = (poly: Point[]) => poly.map((p) => p.join(',')).join(' ');
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="editor" bind:this={host} tabindex="0" onkeydown={onKey} role="application" aria-label="Floor map editor">
	<div class="toolbar" role="toolbar" aria-label="Editing tools">
		<div class="group">
			{#each TOOLS as t (t.id)}
				<button type="button" class="tool" aria-pressed={tool === t.id} title="{t.label} ({t.key})" onclick={() => setTool(t.id)}>
					<t.icon size={17} aria-hidden="true" />
					<span class="visually-hidden">{t.label}</span>
				</button>
			{/each}
		</div>

		{#if tool === 'rect' || tool === 'polygon'}
			<label class="inline">
				<span>Type</span>
				<select bind:value={zoneType}>
					{#each ZONE_TYPES as z (z.value)}<option value={z.value}>{z.label}</option>{/each}
				</select>
			</label>
		{:else if tool === 'marker'}
			<label class="inline">
				<span>Marker</span>
				<select bind:value={markerType}>
					{#each MARKER_TYPES as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
				</select>
			</label>
		{/if}

		<div class="group end">
			<button type="button" class="tool" aria-pressed={snapGrid} title="Snap to a 0.5 m grid" onclick={() => (snapGrid = !snapGrid)}>
				<Grid3x3 size={17} aria-hidden="true" /><span class="visually-hidden">Snap to grid</span>
			</button>
			<button type="button" class="tool" aria-pressed={snapAngle} title="Snap walls to 45°" onclick={() => (snapAngle = !snapAngle)}>
				<TriangleRight size={17} aria-hidden="true" /><span class="visually-hidden">Snap angles</span>
			</button>
			<span class="sep" aria-hidden="true"></span>
			<button type="button" class="tool" title="Undo (Ctrl+Z)" disabled={!undoStack.length} onclick={undo}><Undo2 size={17} aria-hidden="true" /><span class="visually-hidden">Undo</span></button>
			<button type="button" class="tool" title="Redo (Ctrl+Shift+Z)" disabled={!redoStack.length} onclick={redo}><Redo2 size={17} aria-hidden="true" /><span class="visually-hidden">Redo</span></button>
			<span class="sep" aria-hidden="true"></span>
			<button type="button" class="tool" title="Zoom in" onclick={() => zoomCentre(1 / 1.3)}><ZoomIn size={17} aria-hidden="true" /><span class="visually-hidden">Zoom in</span></button>
			<button type="button" class="tool" title="Zoom out" onclick={() => zoomCentre(1.3)}><ZoomOut size={17} aria-hidden="true" /><span class="visually-hidden">Zoom out</span></button>
			<button type="button" class="tool" title="Fit the plan" onclick={() => (view = fit())}><Maximize2 size={17} aria-hidden="true" /><span class="visually-hidden">Fit</span></button>
		</div>
	</div>

	<div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH} class:crosshair={tool !== 'select' && tool !== 'pan'} class:grab={tool === 'pan'}>
		<svg
			bind:this={svg}
			viewBox="{view.x} {view.y} {view.w} {view.h}"
			preserveAspectRatio="xMidYMid meet"
			onpointerdown={onBackgroundDown}
			onpointermove={onMove}
			onpointerup={onUp}
			onpointercancel={onUp}
			onpointerleave={() => (hover = null)}
			onwheel={onWheel}
			ondblclick={() => tool === 'polygon' && finishPolygon()}
			role="presentation"
		>
			<rect x={view.x} y={view.y} width={view.w} height={view.h} fill="#e9ecf1" />
			<image href={imageUrl} x="0" y="0" width={imageWidth} height={imageHeight} preserveAspectRatio="none" />

			{#if snapGrid && grid / unit > 6}
				<defs>
					<pattern id="fm-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
						<path d="M{grid} 0H0V{grid}" fill="none" stroke="#2563eb" stroke-opacity="0.12" stroke-width={unit} />
					</pattern>
				</defs>
				<rect x="0" y="0" width={imageWidth} height={imageHeight} fill="url(#fm-grid)" pointer-events="none" />
			{/if}

			{#each layout.zones as z (z.id)}
				{@const tl = [Math.min(...z.polygon.map((p) => p[0])), Math.min(...z.polygon.map((p) => p[1]))]}
				{@const sel = selection?.kind === 'zone' && selection.id === z.id}
				<polygon
					points={pts(z.polygon)}
					fill={z.color}
					fill-opacity={z.type === 'walkway' ? 0.15 : 0.35}
					stroke={sel ? '#c9952f' : z.color}
					stroke-width={(sel ? 3 : 1.5) * unit}
					class="item"
					role="presentation"
					onpointerdown={(e) => onItemDown(e, { kind: 'zone', id: z.id })}
				/>
				{#if z.name}
					<!-- Tag in the top-left corner, so it does not cover the name printed on the plan. -->
					<text x={tl[0] + 3 * unit} y={tl[1] + 3 * unit} font-size={10 * unit} class="zone-label" dominant-baseline="hanging">{z.name}</text>
				{/if}
			{/each}

			{#each layout.walls as w (w.id)}
				{@const sel = selection?.kind === 'wall' && selection.id === w.id}
				{#if sel}
					<line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="#e3b04b" stroke-width={w.thickness * scale + 6 * unit} stroke-linecap="square" pointer-events="none" />
				{/if}
				<line
					x1={w.a[0]}
					y1={w.a[1]}
					x2={w.b[0]}
					y2={w.b[1]}
					stroke="#0f172a"
					stroke-opacity="0.85"
					stroke-width={Math.max(w.thickness * scale, 3 * unit)}
					stroke-linecap="square"
					class="item"
					role="presentation"
					onpointerdown={(e) => onItemDown(e, { kind: 'wall', id: w.id })}
				/>
			{/each}

			{#each layout.markers as m (m.id)}
				{@const info = markerInfo(m.type)}
				{@const sel = selection?.kind === 'marker' && selection.id === m.id}
				<g class="item" onpointerdown={(e) => onItemDown(e, { kind: 'marker', id: m.id })} role="presentation">
					<circle cx={m.pos[0]} cy={m.pos[1]} r={11 * unit} fill={info.color} stroke={sel ? '#e3b04b' : '#fff'} stroke-width={(sel ? 3 : 2) * unit} />
					<text x={m.pos[0]} y={m.pos[1]} font-size={(info.symbol.length > 2 ? 6 : 9) * unit} class="marker-sym" text-anchor="middle" dominant-baseline="central">{info.symbol}</text>
				</g>
			{/each}


			<!-- Handles for reshaping the selection -->
			{#if tool === 'select' && selWall}
				<circle cx={selWall.a[0]} cy={selWall.a[1]} r={handleR} class="handle" onpointerdown={(e) => onHandleDown(e, 'wallA', selWall!.id, 0)} role="presentation" />
				<circle cx={selWall.b[0]} cy={selWall.b[1]} r={handleR} class="handle" onpointerdown={(e) => onHandleDown(e, 'wallB', selWall!.id, 0)} role="presentation" />
			{/if}
			{#if tool === 'select' && selZone}
				{#each selZone.polygon as p, i (i)}
					<circle cx={p[0]} cy={p[1]} r={handleR} class="handle" onpointerdown={(e) => onHandleDown(e, 'zone', selZone!.id, i)} role="presentation" />
				{/each}
			{/if}

			<!-- Drafts -->
			{#if draftWall}
				<line x1={draftWall.a[0]} y1={draftWall.a[1]} x2={draftWall.b[0]} y2={draftWall.b[1]} stroke="#c9952f" stroke-width={Math.max(DEFAULT_WALL.thickness * scale, 3 * unit)} stroke-linecap="square" />
				<text x={(draftWall.a[0] + draftWall.b[0]) / 2} y={(draftWall.a[1] + draftWall.b[1]) / 2 - 10 * unit} font-size={12 * unit} class="measure" text-anchor="middle">
					{fmtM(Math.hypot(draftWall.b[0] - draftWall.a[0], draftWall.b[1] - draftWall.a[1]))}
				</text>
			{/if}
			{#if draftRect}
				{@const x = Math.min(draftRect.a[0], draftRect.b[0])}
				{@const y = Math.min(draftRect.a[1], draftRect.b[1])}
				{@const w = Math.abs(draftRect.b[0] - draftRect.a[0])}
				{@const h = Math.abs(draftRect.b[1] - draftRect.a[1])}
				<rect {x} {y} width={w} height={h} fill={zoneInfo(zoneType).color} fill-opacity="0.35" stroke="#c9952f" stroke-width={2 * unit} />
				<text x={x + w / 2} y={y - 8 * unit} font-size={12 * unit} class="measure" text-anchor="middle">{fmtM(w)} × {fmtM(h)}</text>
			{/if}
			{#if draftPoly.length}
				<polyline points={pts(hover ? [...draftPoly, snapPt(hover)] : draftPoly)} fill={zoneInfo(zoneType).color} fill-opacity="0.25" stroke="#c9952f" stroke-width={2 * unit} />
				{#each draftPoly as p, i (i)}
					<circle cx={p[0]} cy={p[1]} r={handleR * 0.8} fill={i === 0 ? '#c9952f' : '#fff'} stroke="#c9952f" stroke-width={unit} />
				{/each}
			{/if}
			{#if calib.length}
				{#each calib as p, i (i)}
					<circle cx={p[0]} cy={p[1]} r={handleR} fill="#dc2626" />
				{/each}
				{#if calib.length === 2}
					<line x1={calib[0][0]} y1={calib[0][1]} x2={calib[1][0]} y2={calib[1][1]} stroke="#dc2626" stroke-width={2 * unit} stroke-dasharray="{6 * unit} {4 * unit}" />
				{/if}
			{/if}
		</svg>

		<p class="tip">
			{#if tool === 'select'}Click an item to select it, drag to move, drag the round handles to reshape. Drag empty space to pan; scroll to zoom.
			{:else if tool === 'pan'}Drag to move around the plan; scroll to zoom.
			{:else if tool === 'wall'}Drag from one end of a wall to the other. Ends snap to other walls.
			{:else if tool === 'rect'}Drag a rectangle for each stall or area. Stalls are numbered automatically.
			{:else if tool === 'polygon'}Click each corner; click the first point, double-click or press Enter to finish.
			{:else if tool === 'marker'}Click to place a {markerInfo(markerType).label.toLowerCase()} marker.
			{:else}Click two points whose real distance you know (a wall, a stall, the scale bar).{/if}
		</p>
	</div>

	<div class="props">
		{#if tool === 'calibrate'}
			<div class="row">
				<strong>Calibrate scale</strong>
				{#if calib.length === 2}
					<span class="ops-hint">Measured {Math.round(Math.hypot(calib[1][0] - calib[0][0], calib[1][1] - calib[0][1]))} px, currently {fmtM(Math.hypot(calib[1][0] - calib[0][0], calib[1][1] - calib[0][1]))}.</span>
					<label class="inline"><span>Real distance (m)</span><input type="number" min="0.1" step="0.1" bind:value={calibMetres} /></label>
					<button type="button" class="btn btn-primary small" disabled={!calibMetres} onclick={applyCalibration}>Apply</button>
				{:else}
					<span class="ops-hint">Click {calib.length ? 'the second' : 'the first'} point on the plan. Now {scale.toFixed(1)} px = 1 m (plan is {fmtM(imageWidth)} wide).</span>
				{/if}
			</div>
		{:else if selWall}
			<div class="row">
				<strong>Wall</strong>
				<span class="ops-hint">{fmtM(Math.hypot(selWall.b[0] - selWall.a[0], selWall.b[1] - selWall.a[1]))} long</span>
				<label class="inline"><span>Thickness (m)</span><input type="number" min="0.05" max="2" step="0.05" bind:value={selWall.thickness} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<label class="inline"><span>Height (m)</span><input type="number" min="0.3" max="12" step="0.1" bind:value={selWall.height} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<button type="button" class="btn btn-ghost small" onclick={duplicate}><CopyPlus size={15} aria-hidden="true" /> Duplicate</button>
				<button type="button" class="btn btn-ghost small danger" onclick={remove}><Trash2 size={15} aria-hidden="true" /> Delete</button>
			</div>
		{:else if selZone}
			<div class="row">
				<label class="inline"><span>Name</span><input type="text" maxlength="60" bind:value={selZone.name} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<label class="inline">
					<span>Type</span>
					<select
						value={selZone.type}
						onchange={(e) => {
							commit();
							const info = zoneInfo((e.currentTarget as HTMLSelectElement).value);
							selZone!.type = info.value;
							selZone!.color = info.color;
							selZone!.height = info.height;
						}}
					>
						{#each ZONE_TYPES as z (z.value)}<option value={z.value}>{z.label}</option>{/each}
					</select>
				</label>
				<label class="inline"><span>Colour</span><input type="color" bind:value={selZone.color} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<label class="inline"><span>Height (m)</span><input type="number" min="0.01" max="6" step="0.05" bind:value={selZone.height} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<button type="button" class="btn btn-ghost small" onclick={duplicate} title="Ctrl+D"><CopyPlus size={15} aria-hidden="true" /> Duplicate</button>
				<button type="button" class="btn btn-ghost small danger" onclick={remove}><Trash2 size={15} aria-hidden="true" /> Delete</button>
			</div>
			<label class="desc">
				<span>Description for visitors <small>({selZone.description.length}/600)</small></span>
				<textarea
					rows="2"
					maxlength="600"
					placeholder="What is in this room? Who is here, what happens, timings…"
					bind:value={selZone.description}
					onfocus={fieldFocus}
					onchange={fieldChange}
				></textarea>
			</label>
		{:else if selMarker}
			<div class="row">
				<label class="inline">
					<span>Marker</span>
					<select
						value={selMarker.type}
						onchange={(e) => {
							commit();
							selMarker!.type = markerInfo((e.currentTarget as HTMLSelectElement).value).value;
						}}
					>
						{#each MARKER_TYPES as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
					</select>
				</label>
				<label class="inline"><span>Label</span><input type="text" maxlength="60" bind:value={selMarker.label} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<button type="button" class="btn btn-ghost small danger" onclick={remove}><Trash2 size={15} aria-hidden="true" /> Delete</button>
			</div>
		{:else if selection?.kind === 'start' && layout.start}
			<div class="row">
				<strong>Walk start</strong>
				<label class="inline"><span>Facing {layout.start.facing}°</span><input type="range" min="-180" max="180" step="5" bind:value={layout.start.facing} onfocus={fieldFocus} onchange={fieldChange} /></label>
				<button type="button" class="btn btn-ghost small danger" onclick={remove}><Trash2 size={15} aria-hidden="true" /> Remove</button>
			</div>
		{:else}
			<div class="row">
				<span class="ops-hint">
					{layout.zones.filter((z) => z.type === 'stall').length} stalls · {layout.zones.filter((z) => z.type !== 'stall').length} other areas ·
					{layout.walls.length} walls · {layout.markers.length} markers · scale {scale.toFixed(1)} px/m ({fmtM(imageWidth)} × {fmtM(imageHeight)})
				</span>
				<span class="ops-hint keys">V select · W wall · R rectangle · P shape · M marker · C calibrate · Del delete · Ctrl+Z undo · Ctrl+D duplicate · arrows nudge</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.editor {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: 100%;
		min-height: 520px;
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		background: var(--white);
		outline: none;
		overflow: hidden;
	}

	.editor:focus-visible {
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		padding: 6px 8px;
		border-bottom: 1px solid var(--rule);
		background: var(--mist);
	}

	.group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.group.end {
		margin-left: auto;
	}

	.sep {
		width: 1px;
		height: 22px;
		margin: 0 4px;
		background: var(--rule);
	}

	.tool {
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--charcoal);
		cursor: pointer;
	}

	.tool:hover:not(:disabled) {
		background: var(--white);
		border-color: var(--rule);
	}

	.tool[aria-pressed='true'] {
		background: var(--gold-tint);
		border-color: var(--gold);
		color: var(--gold-ink);
	}

	.tool:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.inline {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-supporting);
	}

	.inline input,
	.inline select {
		min-height: 32px;
		padding: 0 8px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--white);
		font: inherit;
		color: var(--charcoal);
	}

	.inline input[type='number'] {
		width: 80px;
	}

	.inline input[type='text'] {
		width: 160px;
	}

	.inline input[type='color'] {
		width: 40px;
		padding: 2px;
	}

	.stage {
		position: relative;
		min-height: 0;
		background: #e9ecf1;
		touch-action: none;
	}

	.stage svg {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		user-select: none;
	}

	.crosshair svg {
		cursor: crosshair;
	}

	.grab svg {
		cursor: grab;
	}

	.item {
		cursor: move;
	}

	.crosshair .item {
		cursor: crosshair;
	}

	.handle {
		fill: #fff;
		stroke: #c9952f;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
		cursor: grab;
	}

	.zone-label {
		fill: #8a5f10;
		font-weight: 700;
		pointer-events: none;
		paint-order: stroke;
		stroke: rgb(255 255 255 / 0.8);
		stroke-width: 3px;
		vector-effect: non-scaling-stroke;
	}

	.marker-sym {
		fill: #fff;
		font-weight: 700;
		pointer-events: none;
	}

	.measure {
		fill: #8a5f10;
		font-weight: 700;
		paint-order: stroke;
		stroke: #fff;
		stroke-width: 3px;
		vector-effect: non-scaling-stroke;
	}

	.tip {
		position: absolute;
		left: 8px;
		bottom: 8px;
		max-width: calc(100% - 16px);
		margin: 0;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.9);
		color: var(--text-body);
		font-size: 12px;
		pointer-events: none;
	}

	.desc {
		display: grid;
		gap: 4px;
		margin-top: 8px;
		font-size: 13px;
		color: var(--text-supporting);
	}

	.desc textarea {
		width: 100%;
		min-height: 52px;
		padding: 6px 8px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		font: inherit;
		font-size: 14px;
		color: var(--charcoal);
		resize: vertical;
	}

	.props {
		padding: 8px 10px;
		border-top: 1px solid var(--rule);
		background: var(--white);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 14px;
		min-height: 36px;
	}

	.row strong {
		font-size: 14px;
		color: var(--charcoal);
	}

	.keys {
		font-size: 12px;
	}

	.small {
		min-height: 32px;
		padding-inline: 10px;
		font-size: 13px;
	}

	.danger {
		color: var(--danger);
	}
</style>
