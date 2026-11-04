<!--
	3D view of a floor map: the uploaded plan as the floor, open-topped walls standing
	on it, rooms tinted on the floor, stalls as blocks, floating room titles and markers.

	The map turns slowly on its own until someone touches it. Drag to rotate, pinch or
	scroll to zoom (towards the pointer), two fingers or right-drag to move. The buttons
	rotate 45° at a time, zoom in and out, reset the view and pause the turning.
	Tapping a room title (or the room) shows its description.

	Renders only while something moves, and releases every GPU resource when removed.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { Compass, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from '@lucide/svelte';
	import { centroid, markerInfo, zoneInfo, type Layout, type Point } from '#lib/floor-map/layout.ts';

	interface Props {
		imageUrl: string;
		imageWidth: number;
		imageHeight: number;
		/** Pixels of the image per real-world metre. */
		scale: number;
		layout: Layout;
		/** Smaller controls for the editor's preview. */
		compact?: boolean;
	}

	let { imageUrl, imageWidth, imageHeight, scale, layout, compact = false }: Props = $props();

	let host: HTMLDivElement;
	let canvasHost = $state<HTMLDivElement>() as unknown as HTMLDivElement;
	let webglFailed = $state(false);
	let loading = $state(true);
	type Picked = { id: string; name: string; kind: string; color: string; description: string };
	let picked = $state<Picked | null>(null);
	let fullscreen = $state(false);
	/** Slow turntable rotation; stops as soon as the visitor touches the map. */
	let spinning = $state(true);

	/* ---------- three.js state (not reactive: Svelte must not proxy these) ---------- */

	let renderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	const floorGroup = new THREE.Group();
	const contentGroup = new THREE.Group();
	let pickables: THREE.Mesh[] = [];
	let titles: THREE.Sprite[] = [];
	let bounds = { w: 10, h: 10 };
	let frame = 0;
	let idleFrames = 0;
	let lastTime = 0;
	let destroyed = false;
	let down: { x: number; y: number; moved: number } | null = null;

	/** Camera in orbit terms: what it looks at, how far, which way round, how high. */
	interface Orbit {
		target: THREE.Vector3;
		radius: number;
		theta: number;
		phi: number;
	}
	let tween: { from: Orbit; to: Orbit; t: number; duration: number; done?: () => void } | null = null;

	/** Looking down at about 50° from straight above: the whole floor reads, and walls show their height. */
	const HOME_PHI = 0.82;
	const MIN_PHI = 0.05;
	const MAX_PHI = 1.22;

	/* ---------- plan pixels → metres ---------- */

	const toWorld = (p: Point) => ({ x: (p[0] - imageWidth / 2) / scale, z: (p[1] - imageHeight / 2) / scale });

	/* ---------- building the scene ---------- */

	function disposeTree(root: THREE.Object3D) {
		root.traverse((o) => {
			const mesh = o as THREE.Mesh;
			mesh.geometry?.dispose();
			const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
			for (const m of mats) {
				for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
				m.dispose();
			}
		});
		root.clear();
	}

	/** The plan as the floor. SVGs are drawn at twice their size so lines stay sharp. */
	async function buildFloor() {
		disposeTree(floorGroup);
		bounds = { w: imageWidth / scale, h: imageHeight / scale };
		updateLimits();

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(bounds.w * 4, bounds.h * 4),
			new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 1 })
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.02;
		floorGroup.add(ground);

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.src = imageUrl;
		try {
			await img.decode();
		} catch {
			loading = false;
			return;
		}
		if (destroyed) return;
		let source: HTMLImageElement | HTMLCanvasElement = img;
		if (/\.svg($|\?)/i.test(imageUrl)) {
			const k = Math.min(2, 4096 / Math.max(imageWidth, imageHeight));
			const c = document.createElement('canvas');
			c.width = Math.round(imageWidth * k);
			c.height = Math.round(imageHeight * k);
			c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
			source = c;
		}
		const texture = new THREE.Texture(source);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
		texture.needsUpdate = true;
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(bounds.w, bounds.h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }));
		floor.rotation.x = -Math.PI / 2;
		floorGroup.add(floor);
		loading = false;
		wake();
	}

	function label(text: string, opts: { bg: string; fg: string; height: number }) {
		const px = 64;
		const c = document.createElement('canvas');
		const ctx = c.getContext('2d')!;
		const font = `600 ${px}px Montserrat, Arial, sans-serif`;
		ctx.font = font;
		c.width = Math.ceil(ctx.measureText(text).width) + px;
		c.height = px * 1.6;
		ctx.font = font;
		ctx.fillStyle = opts.bg;
		ctx.beginPath();
		ctx.roundRect(0, 0, c.width, c.height, c.height / 2.6);
		ctx.fill();
		ctx.fillStyle = opts.fg;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, c.width / 2, c.height / 2 + 4);
		const texture = new THREE.CanvasTexture(c);
		texture.colorSpace = THREE.SRGBColorSpace;
		const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, depthTest: false }));
		sprite.scale.set((opts.height * c.width) / c.height, opts.height, 1);
		sprite.renderOrder = 10;
		return sprite;
	}

	function readable(hex: string) {
		const n = parseInt(hex.slice(1), 16);
		const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return l > 0.6 ? '#1f2937' : '#ffffff';
	}

	function buildContent(l: Layout) {
		disposeTree(contentGroup);
		pickables = [];
		titles = [];
		highlighted = null;

		// Walls: one instanced box stretched per wall, open at the top (no roof), with a
		// dark cap line so the layout reads clearly from above.
		if (l.walls.length) {
			const walls = new THREE.InstancedMesh(
				new THREE.BoxGeometry(1, 1, 1),
				new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.85 }),
				l.walls.length
			);
			const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#374151' }), l.walls.length);
			const m = new THREE.Matrix4();
			const q = new THREE.Quaternion();
			const up = new THREE.Vector3(0, 1, 0);
			l.walls.forEach((w, i) => {
				const a = toWorld(w.a);
				const b = toWorld(w.b);
				const len = Math.hypot(b.x - a.x, b.z - a.z);
				q.setFromAxisAngle(up, -Math.atan2(b.z - a.z, b.x - a.x));
				m.compose(new THREE.Vector3((a.x + b.x) / 2, w.height / 2, (a.z + b.z) / 2), q, new THREE.Vector3(len + w.thickness, w.height, w.thickness));
				walls.setMatrixAt(i, m);
				m.compose(new THREE.Vector3((a.x + b.x) / 2, w.height + 0.01, (a.z + b.z) / 2), q, new THREE.Vector3(len + w.thickness, 0.02, w.thickness));
				caps.setMatrixAt(i, m);
			});
			contentGroup.add(walls, caps);
		}

		const wallTop = Math.max(2.5, ...l.walls.map((w) => w.height));
		for (const z of l.zones) {
			const shape = new THREE.Shape(
				z.polygon.map((p) => {
					const w = toWorld(p);
					return new THREE.Vector2(w.x, -w.z);
				})
			);
			const flat = z.height < 0.2;
			const geometry = new THREE.ExtrudeGeometry(shape, { depth: z.height, bevelEnabled: false });
			geometry.rotateX(-Math.PI / 2);
			// Rooms are a light tint on the floor, so the plan stays readable through them.
			const opacity = z.type === 'room' ? 0.22 : flat ? 0.55 : 1;
			const mesh = new THREE.Mesh(
				geometry,
				new THREE.MeshStandardMaterial({ color: z.color, roughness: 0.6, transparent: opacity < 1, opacity, depthWrite: opacity === 1 })
			);
			mesh.position.y = z.type === 'room' ? 0.005 : flat ? 0.01 : 0;
			const info: Picked = { id: z.id, name: z.name || zoneInfo(z.type).label, kind: zoneInfo(z.type).label, color: z.color, description: z.description };
			mesh.userData = { ...info };
			pickables.push(mesh);
			contentGroup.add(mesh);
			if (!flat) {
				contentGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#4b3d1f', transparent: true, opacity: 0.5 })));
			}
			if (z.name) {
				const c = toWorld(centroid(z.polygon));
				const xs = z.polygon.map((p) => p[0]);
				const ys = z.polygon.map((p) => p[1]);
				const roomSize = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / scale;
				const stall = z.type === 'stall';
				// Title size follows the room, so small rooms do not drown in big labels.
				const h = stall ? 0.45 : Math.min(0.9, Math.max(0.4, roomSize * 0.22));
				const s = label(z.name, { bg: stall ? z.color : '#0c1730', fg: stall ? readable(z.color) : '#ffffff', height: h });
				s.position.set(c.x, stall ? Math.max(z.height + 0.7, 2) : wallTop + 0.4, c.z);
				s.userData = { ...info };
				titles.push(s);
				contentGroup.add(s);
			}
		}

		for (const mk of l.markers) {
			const info = markerInfo(mk.type);
			const p = toWorld(mk.pos);
			const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#6b7280' }));
			pole.position.set(p.x, 1.1, p.z);
			contentGroup.add(pole);
			const text = mk.label.toLowerCase().includes(info.symbol.toLowerCase()) || info.symbol.length < 2 ? mk.label : `${info.symbol}  ${mk.label}`;
			const s = label(text, { bg: info.color, fg: '#ffffff', height: 0.6 });
			s.position.set(p.x, 2.6, p.z);
			contentGroup.add(s);
			const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.8 }));
			disc.rotation.x = -Math.PI / 2;
			disc.position.set(p.x, 0.02, p.z);
			contentGroup.add(disc);
		}

		if (pendingFocus) {
			const id = pendingFocus;
			pendingFocus = null;
			focusZone(id);
		} else if (picked) {
			// Keep the open room highlighted after a rebuild (editor preview).
			const again = pickables.find((m) => m.userData.id === picked!.id);
			if (again) highlight(again);
		}
		wake();
	}

	/* ---------- camera ---------- */

	/**
	 * Distance at which the floor fills the screen from any side (it turns). Seen at the
	 * home tilt, the far half is foreshortened, so the bounding circle can be a little
	 * tighter than its full radius.
	 */
	function fitRadius(width = bounds.w, depth = bounds.h) {
		const half = Math.hypot(width, depth) / 2;
		const vfov = THREE.MathUtils.degToRad(camera.fov);
		const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
		return (half / Math.tan(Math.min(vfov, hfov) / 2)) * 0.82;
	}

	function updateLimits() {
		if (!controls) return;
		const fit = fitRadius();
		controls.minDistance = Math.max(3, fit * 0.08);
		controls.maxDistance = fit * 1.8;
	}

	function current(): Orbit {
		const offset = camera.position.clone().sub(controls.target);
		const s = new THREE.Spherical().setFromVector3(offset);
		return { target: controls.target.clone(), radius: s.radius, theta: s.theta, phi: s.phi };
	}

	function place(o: Orbit) {
		const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(o.radius, o.phi, o.theta));
		controls.target.copy(o.target);
		camera.position.copy(o.target).add(offset);
		camera.lookAt(o.target);
	}

	/** Glides the camera around the orbit (never cutting through the map). */
	function glide(to: Partial<Orbit>, duration = 0.8, done?: () => void) {
		const from = current();
		const end: Orbit = {
			target: to.target ?? from.target,
			radius: THREE.MathUtils.clamp(to.radius ?? from.radius, controls.minDistance, controls.maxDistance),
			theta: to.theta ?? from.theta,
			phi: THREE.MathUtils.clamp(to.phi ?? from.phi, MIN_PHI, MAX_PHI)
		};
		// Turn the short way round.
		let dTheta = end.theta - from.theta;
		dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
		end.theta = from.theta + dTheta;
		controls.enabled = false;
		tween = {
			from,
			to: end,
			t: 0,
			duration,
			done: () => {
				controls.enabled = true;
				controls.update();
				done?.();
			}
		};
		wake();
	}

	export function resetView() {
		picked = null;
		highlight(null);
		glide({ target: new THREE.Vector3(), radius: fitRadius(), theta: 0, phi: HOME_PHI }, 1);
	}

	const stopSpin = () => {
		spinning = false;
		controls.autoRotate = false;
	};

	function rotateBy(deg: number) {
		stopSpin();
		glide({ theta: current().theta + THREE.MathUtils.degToRad(deg) }, 0.6);
	}

	function zoomBy(k: number) {
		stopSpin();
		glide({ radius: current().radius * k }, 0.45);
	}

	function toggleSpin() {
		spinning = !spinning;
		controls.autoRotate = spinning;
		wake();
	}

	/** Keeps the point the camera circles inside the floor, so the map cannot be dragged away. */
	function clampTarget() {
		const t = controls.target;
		const mx = bounds.w / 2;
		const mz = bounds.h / 2;
		const x = THREE.MathUtils.clamp(t.x, -mx, mx);
		const z = THREE.MathUtils.clamp(t.z, -mz, mz);
		if (x !== t.x || z !== t.z || t.y !== 0) {
			const dx = x - t.x;
			const dz = z - t.z;
			t.set(x, 0, z);
			camera.position.x += dx;
			camera.position.z += dz;
		}
	}

	/* ---------- rooms: highlight and fly to ---------- */

	let highlighted: THREE.Mesh | null = null;
	let pendingFocus: string | null = null;

	function highlight(mesh: THREE.Mesh | null) {
		if (highlighted) {
			const m = highlighted.material as THREE.MeshStandardMaterial;
			m.emissive.setHex(0x000000);
			m.opacity = highlighted.userData.baseOpacity ?? m.opacity;
		}
		highlighted = mesh;
		if (mesh) {
			const m = mesh.material as THREE.MeshStandardMaterial;
			mesh.userData.baseOpacity ??= m.opacity;
			m.emissive.set(mesh.userData.color);
			m.emissiveIntensity = 0.45;
			if (m.transparent) m.opacity = Math.min(0.75, m.opacity + 0.35);
		}
		wake();
	}

	function open(id: string) {
		const mesh = pickables.find((m) => m.userData.id === id) ?? null;
		const title = titles.find((s) => s.userData.id === id);
		const data = (mesh?.userData ?? title?.userData) as Picked | undefined;
		picked = data ? { id: data.id, name: data.name, kind: data.kind, color: data.color, description: data.description } : null;
		highlight(mesh);
		return mesh;
	}

	/** Opens a room: shows its name and description, highlights it and flies to it. */
	export function focusZone(id: string) {
		const mesh = renderer ? pickables.find((m) => m.userData.id === id) : undefined;
		if (!mesh) {
			pendingFocus = id;
			return;
		}
		stopSpin();
		open(id);
		const box = new THREE.Box3().setFromObject(mesh);
		const c = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());
		glide({ target: new THREE.Vector3(c.x, 0, c.z), radius: fitRadius(size.x + 6, size.z + 6), phi: 0.75 }, 1);
	}

	/* ---------- loop: runs only while something changes ---------- */

	function wake() {
		idleFrames = 0;
		if (!frame && renderer && !destroyed) {
			lastTime = performance.now();
			frame = requestAnimationFrame(tick);
		}
	}

	function tick(now: number) {
		frame = 0;
		if (!renderer || destroyed) return;
		const dt = Math.min(0.05, (now - lastTime) / 1000);
		lastTime = now;
		let active = false;

		if (tween) {
			tween.t = Math.min(1, tween.t + dt / tween.duration);
			const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
			const { from, to } = tween;
			place({
				target: from.target.clone().lerp(to.target, e),
				radius: THREE.MathUtils.lerp(from.radius, to.radius, e),
				theta: THREE.MathUtils.lerp(from.theta, to.theta, e),
				phi: THREE.MathUtils.lerp(from.phi, to.phi, e)
			});
			active = true;
			if (tween.t >= 1) {
				const done = tween.done;
				tween = null;
				done?.();
			}
		} else if (controls.enabled) {
			if (controls.update(dt)) active = true;
			clampTarget();
		}
		if (down || spinning) active = true;

		renderer.render(scene, camera);
		idleFrames = active ? 0 : idleFrames + 1;
		// wake() may already have scheduled the next frame during this one (controls 'change').
		if (idleFrames < 20 && !frame) frame = requestAnimationFrame(tick);
	}

	/* ---------- input ---------- */

	function onPointerDown(e: PointerEvent) {
		host.focus({ preventScroll: true });
		down = { x: e.clientX, y: e.clientY, moved: 0 };
		stopSpin();
		wake();
	}

	function onPointerMove(e: PointerEvent) {
		if (!down) return;
		down.moved += Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
		down.x = e.clientX;
		down.y = e.clientY;
	}

	function onPointerUp(e: PointerEvent) {
		if (!down) return;
		const tap = down.moved < 6;
		down = null;
		if (tap) pick(e);
		wake();
	}

	/** A tap on a room title (or the room itself) opens its description. */
	function pick(e: PointerEvent) {
		if (!renderer) return;
		const rect = renderer.domElement.getBoundingClientRect();
		const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
		const ray = new THREE.Raycaster();
		ray.setFromCamera(ndc, camera);
		const title = ray.intersectObjects(titles, false)[0];
		const hit = title ?? ray.intersectObjects(pickables, false)[0];
		if (!hit) {
			picked = null;
			highlight(null);
			return;
		}
		open((hit.object.userData as Picked).id);
	}

	function onKey(e: KeyboardEvent) {
		const k = e.key;
		if (k === 'ArrowLeft') rotateBy(-45);
		else if (k === 'ArrowRight') rotateBy(45);
		else if (k === '+' || k === '=') zoomBy(0.7);
		else if (k === '-' || k === '_') zoomBy(1 / 0.7);
		else if (k === 'Escape') {
			picked = null;
			highlight(null);
		} else return;
		e.preventDefault();
	}

	async function toggleFullscreen() {
		if (document.fullscreenElement) await document.exitFullscreen();
		else await host.requestFullscreen?.().catch(() => undefined);
	}

	/* ---------- lifecycle ---------- */

	onMount(() => {
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
		} catch {
			webglFailed = true;
			loading = false;
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.domElement.style.touchAction = 'none';
		canvasHost.appendChild(renderer.domElement);

		scene = new THREE.Scene();
		scene.background = new THREE.Color('#eef1f5');
		scene.add(new THREE.HemisphereLight('#ffffff', '#b9c0ca', 1.6));
		const sun = new THREE.DirectionalLight('#ffffff', 1.4);
		sun.position.set(12, 30, 18);
		scene.add(sun);
		scene.add(floorGroup, contentGroup);

		camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.rotateSpeed = 0.7;
		controls.zoomSpeed = 1.1;
		controls.panSpeed = 0.8;
		controls.zoomToCursor = true;
		controls.screenSpacePanning = false;
		controls.minPolarAngle = MIN_PHI;
		controls.maxPolarAngle = MAX_PHI;
		controls.autoRotate = spinning;
		controls.autoRotateSpeed = 0.9;
		controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
		controls.addEventListener('change', wake);
		controls.addEventListener('start', stopSpin);

		bounds = { w: imageWidth / scale, h: imageHeight / scale };
		let first = true;
		const resize = () => {
			if (!renderer) return;
			const w = canvasHost.clientWidth || 1;
			const h = canvasHost.clientHeight || 1;
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			updateLimits();
			if (first) {
				first = false;
				// Intro: from straight above, glide down to the home view, then start turning.
				place({ target: new THREE.Vector3(), radius: fitRadius() * 1.25, theta: 0, phi: MIN_PHI });
				glide({ radius: fitRadius(), phi: HOME_PHI }, 1.2);
			}
			wake();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvasHost);
		resize();

		const fsChange = () => (fullscreen = document.fullscreenElement === host);
		document.addEventListener('fullscreenchange', fsChange);

		return () => {
			destroyed = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
			document.removeEventListener('fullscreenchange', fsChange);
			controls.removeEventListener('change', wake);
			controls.removeEventListener('start', stopSpin);
			controls.dispose();
			disposeTree(floorGroup);
			disposeTree(contentGroup);
			renderer?.dispose();
			renderer?.domElement.remove();
			renderer = null;
		};
	});

	// Floor: when the image or scale changes.
	$effect(() => {
		void imageUrl;
		void scale;
		if (!renderer) return;
		buildFloor();
	});

	// Walls, rooms and markers: rebuilt shortly after the layout changes (the editor changes it often).
	$effect(() => {
		const snapshot = $state.snapshot(layout) as Layout;
		void scale;
		void imageWidth;
		void imageHeight;
		if (!renderer) return;
		const t = setTimeout(() => buildContent(snapshot), 120);
		return () => clearTimeout(t);
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="viewer" class:compact bind:this={host} tabindex="0" role="application" aria-label="3D floor map. Drag to rotate, pinch or scroll to zoom." onkeydown={onKey}>
	{#if webglFailed}
		<div class="fallback">
			<img src={imageUrl} alt="Floor plan" />
			<p>3D view is not available on this device, so the floor plan is shown instead.</p>
		</div>
	{:else}
		<div
			class="canvas"
			role="presentation"
			bind:this={canvasHost}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={() => (down = null)}
			onwheel={() => {
				stopSpin();
				wake();
			}}
		></div>

		{#if loading}
			<div class="loading" aria-live="polite">Loading floor map…</div>
		{/if}

		<div class="controls" role="toolbar" aria-label="View">
			<button type="button" onclick={() => rotateBy(-45)} title="Rotate left"><RotateCcw size={17} aria-hidden="true" /><span class="visually-hidden">Rotate left</span></button>
			<button type="button" onclick={() => rotateBy(45)} title="Rotate right"><RotateCw size={17} aria-hidden="true" /><span class="visually-hidden">Rotate right</span></button>
			<span class="sep" aria-hidden="true"></span>
			<button type="button" onclick={() => zoomBy(0.7)} title="Zoom in"><ZoomIn size={17} aria-hidden="true" /><span class="visually-hidden">Zoom in</span></button>
			<button type="button" onclick={() => zoomBy(1 / 0.7)} title="Zoom out"><ZoomOut size={17} aria-hidden="true" /><span class="visually-hidden">Zoom out</span></button>
			<span class="sep" aria-hidden="true"></span>
			<button type="button" onclick={toggleSpin} aria-pressed={spinning} title={spinning ? 'Stop turning' : 'Turn slowly'}>
				{#if spinning}<Pause size={17} aria-hidden="true" />{:else}<Play size={17} aria-hidden="true" />{/if}
				<span class="visually-hidden">{spinning ? 'Stop turning' : 'Turn slowly'}</span>
			</button>
			<button type="button" onclick={resetView} title="Reset view"><Compass size={17} aria-hidden="true" /><span class="visually-hidden">Reset view</span></button>
			{#if !compact}
				<button type="button" onclick={toggleFullscreen} title={fullscreen ? 'Exit full screen' : 'Full screen'}>
					{#if fullscreen}<Minimize size={17} aria-hidden="true" />{:else}<Maximize size={17} aria-hidden="true" />{/if}
					<span class="visually-hidden">{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
				</button>
			{/if}
		</div>

		{#if picked}
			<div class="picked" style:--c={picked.color} role="dialog" aria-label={picked.name}>
				<span class="dot" aria-hidden="true"></span>
				<div class="body">
					<strong>{picked.name}</strong>
					<small>{picked.kind}</small>
					{#if picked.description}<p>{picked.description}</p>{:else}<p class="none">No description yet.</p>{/if}
				</div>
				<button
					type="button"
					class="close"
					onclick={() => {
						picked = null;
						highlight(null);
					}}
					aria-label="Close"><X size={16} aria-hidden="true" /></button>
			</div>
		{/if}

		<p class="hint" class:hidden={picked}>Drag to rotate · pinch or scroll to zoom · tap a room name for details</p>
	{/if}
</div>

<style>
	.viewer {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 320px;
		overflow: hidden;
		border-radius: inherit;
		background: #eef1f5;
		outline: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.viewer:focus-visible {
		box-shadow: inset 0 0 0 3px var(--gold-ink, #8a5f10);
	}

	.canvas {
		position: absolute;
		inset: 0;
		touch-action: none;
		cursor: grab;
	}

	.canvas:active {
		cursor: grabbing;
	}

	.canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #475569;
		font-size: 14px;
		pointer-events: none;
	}

	.controls {
		position: absolute;
		top: 10px;
		right: 10px;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: 12px;
		background: rgb(12 23 48 / 0.82);
		backdrop-filter: blur(6px);
	}

	.sep {
		width: 1px;
		height: 20px;
		margin: 0 3px;
		background: rgb(255 255 255 / 0.2);
	}

	.controls button {
		display: inline-grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: #e5e7eb;
		cursor: pointer;
	}

	.controls button:hover {
		background: rgb(255 255 255 / 0.12);
	}

	.controls button[aria-pressed='true'] {
		color: var(--gold, #e3b04b);
	}

	.compact .controls button {
		width: 32px;
		height: 32px;
	}

	.picked {
		position: absolute;
		left: 10px;
		top: 10px;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		max-width: min(360px, calc(100% - 20px));
		max-height: calc(100% - 80px);
		overflow-y: auto;
		padding: 10px 8px 12px 12px;
		border-radius: 12px;
		background: #fff;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
	}

	/* Leave room for the buttons on narrow screens. */
	@media (max-width: 560px) {
		.picked {
			top: 62px;
		}
	}

	.compact .picked {
		top: 50px;
	}

	.picked .dot {
		flex: none;
		width: 12px;
		height: 12px;
		margin-top: 4px;
		border-radius: 4px;
		background: var(--c);
	}

	.body {
		display: grid;
		gap: 1px;
		min-width: 0;
		line-height: 1.25;
	}

	.body strong {
		font-size: 15px;
		color: #111827;
	}

	.body small {
		font-size: 12px;
		color: #6b7280;
	}

	.body p {
		margin: 6px 0 0;
		font-size: 13px;
		line-height: 1.45;
		color: #374151;
		white-space: pre-line;
	}

	.body p.none {
		color: #9ca3af;
	}

	.close {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 8px;
		background: #f3f4f6;
		color: #374151;
		cursor: pointer;
	}

	.hint {
		position: absolute;
		left: 50%;
		bottom: 8px;
		transform: translateX(-50%);
		max-width: calc(100% - 20px);
		margin: 0;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.85);
		color: #374151;
		font-size: 12px;
		text-align: center;
		pointer-events: none;
	}

	.hint.hidden,
	.compact .hint {
		display: none;
	}

	.fallback {
		display: grid;
		gap: 8px;
		padding: 12px;
	}

	.fallback img {
		width: 100%;
		height: auto;
	}

	.fallback p {
		font-size: 13px;
		color: #475569;
	}
</style>
