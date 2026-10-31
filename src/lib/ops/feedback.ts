import type { Outcome } from './categories.ts';

/**
 * Sound and vibration after a scan. Three distinct tones so a handler can tell
 * the result without looking: a rising chirp, a double mid beep, a low buzz.
 */

let audio: AudioContext | null = null;

function tone(ctx: AudioContext, freq: number, start: number, length: number, type: OscillatorType = 'sine') {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
	gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
	osc.connect(gain).connect(ctx.destination);
	osc.start(ctx.currentTime + start);
	osc.stop(ctx.currentTime + start + length + 0.02);
}

const PATTERNS: Record<Outcome, { vibrate: number[]; play: (ctx: AudioContext) => void }> = {
	success: {
		vibrate: [60],
		play: (ctx) => {
			tone(ctx, 880, 0, 0.09);
			tone(ctx, 1320, 0.09, 0.14);
		}
	},
	warning: {
		vibrate: [80, 80, 80],
		play: (ctx) => {
			tone(ctx, 620, 0, 0.1, 'triangle');
			tone(ctx, 620, 0.16, 0.1, 'triangle');
		}
	},
	error: {
		vibrate: [250],
		play: (ctx) => tone(ctx, 180, 0, 0.35, 'square')
	}
};

/** Browsers only allow sound after a tap: call this from the first button press. */
export function unlockAudio() {
	try {
		audio ??= new AudioContext();
		if (audio.state === 'suspended') audio.resume();
	} catch {
		audio = null;
	}
}

export function feedback(outcome: Outcome, sound: boolean) {
	const p = PATTERNS[outcome];
	try {
		navigator.vibrate?.(p.vibrate);
	} catch {
		/* not supported */
	}
	if (!sound) return;
	try {
		audio ??= new AudioContext();
		p.play(audio);
	} catch {
		/* no audio */
	}
}

/* ---------- per-device preferences ---------- */

export interface DeskPrefs {
	sound: boolean;
	/** Seconds before the result clears itself; 0 waits for "Continue scanning". */
	autoReturn: number;
}

const KEY = 'mbc-desk-prefs';
const DEFAULTS: DeskPrefs = { sound: true, autoReturn: 3 };

export function loadPrefs(): DeskPrefs {
	try {
		return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
	} catch {
		return { ...DEFAULTS };
	}
}

export function savePrefs(prefs: DeskPrefs) {
	try {
		localStorage.setItem(KEY, JSON.stringify(prefs));
	} catch {
		/* private mode: the setting lasts for this visit */
	}
}
