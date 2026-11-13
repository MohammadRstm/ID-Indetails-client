import type { ProtonMood } from "../blob/protonMood";

/*
 * How the orb looks in each mood, and the small pieces of arithmetic its animation needs. Everything here is pure, so
 * a mood's look and the way the orb eases between them can be tested without a screen.
 */

export type Rgb = readonly [number, number, number];

/** What the shader is given for a mood. The animation eases from one mood's look to the next, never jumps. */
export type OrbLook = {
    /** How restless the outline and the band are: 0 calm, 1 very lively. */
    energy: number;
    /** How fast the light flows round the ring. */
    flow: number;
    /** A bright arc circling the ring while Proton thinks. */
    swirl: number;
    /** How far the glow reaches outside the ring. */
    glow: number;
    /** Dimmed and greyed while Proton can't answer. */
    dim: number;
    /** How deeply it breathes at rest. */
    breath: number;
    /** The ring's three colours: its body, where the light gathers, and the highlights. */
    colors: readonly [Rgb, Rgb, Rgb];
};

const VIOLET: Rgb = [0.44, 0.2, 1];
const MAGENTA: Rgb = [0.78, 0.22, 1];
const PINK: Rgb = [1, 0.46, 0.86];
const BRAND: OrbLook["colors"] = [VIOLET, MAGENTA, PINK];

const LOOKS: Record<ProtonMood, OrbLook> = {
    idle: { energy: 0.18, flow: 0.32, swirl: 0, glow: 0.85, dim: 0, breath: 1, colors: BRAND },
    listening: { energy: 0.45, flow: 0.6, swirl: 0, glow: 1.05, dim: 0, breath: 0.6, colors: BRAND },
    thinking: { energy: 0.6, flow: 1.05, swirl: 0.85, glow: 1, dim: 0, breath: 0.4, colors: BRAND },
    working: { energy: 0.8, flow: 1.55, swirl: 1, glow: 1.1, dim: 0, breath: 0.3, colors: BRAND },
    talking: { energy: 0.5, flow: 0.8, swirl: 0, glow: 1.1, dim: 0, breath: 0.3, colors: BRAND },
    // waiting for the person's Confirm: calm, with a slow, deeper breath that draws the eye
    proposing: { energy: 0.28, flow: 0.42, swirl: 0, glow: 1, dim: 0, breath: 1.8, colors: BRAND },
    happy: { energy: 0.5, flow: 0.75, swirl: 0, glow: 1.2, dim: 0, breath: 1, colors: [[0.62, 0.3, 1], [0.95, 0.36, 0.95], [1, 0.72, 0.92]] },
    error: { energy: 0.25, flow: 0.3, swirl: 0, glow: 0.9, dim: 0, breath: 0.5, colors: [[0.86, 0.24, 0.42], [1, 0.38, 0.3], [1, 0.66, 0.5]] },
    asleep: { energy: 0.05, flow: 0.12, swirl: 0, glow: 0.55, dim: 0.55, breath: 0.6, colors: [[0.36, 0.31, 0.56], [0.46, 0.39, 0.63], [0.62, 0.56, 0.76]] },
};

export const lookOf = (mood: ProtonMood): OrbLook => LOOKS[mood];

/** How much of the way to a target to move in `dt` seconds at `rate`: the same feel whatever the frame rate. */
export const easeFactor = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

/** One step of easing the look on screen towards a mood's look. */
export function easeLook(current: OrbLook, target: OrbLook, k: number): OrbLook {
    return {
        energy: mix(current.energy, target.energy, k),
        flow: mix(current.flow, target.flow, k),
        swirl: mix(current.swirl, target.swirl, k),
        glow: mix(current.glow, target.glow, k),
        dim: mix(current.dim, target.dim, k),
        breath: mix(current.breath, target.breath, k),
        colors: [mixRgb(current.colors[0], target.colors[0], k), mixRgb(current.colors[1], target.colors[1], k), mixRgb(current.colors[2], target.colors[2], k)],
    };
}

/**
 * A level that follows its input quickly when it rises and lets go more slowly, as a voice meter does: the orb
 * opens with each syllable and settles between them instead of flickering.
 */
export const follow = (current: number, target: number, dt: number, rise = 22, fall = 7) =>
    mix(current, target, easeFactor(dt, target > current ? rise : fall));

/** What the orb hears and says at a moment: Proton's voice, split into low, middle and high, and the person's voice. */
export type OrbSignal = {
    /** How loudly Proton speaks, 0–1. */
    speak: number;
    /** The voice's low, middle and high parts, 0–1 each, when real audio is playing. */
    bands: readonly [number, number, number] | null;
    /** How loudly the person speaks into the microphone, 0–1. */
    hear: number;
};

/**
 * Bands for speech with no audio to measure (the answer written in the chat): a syllable-like rhythm, a few beats a
 * second, under the loudness the text gives, so the orb still seems to talk rather than just glow.
 */
export function syllableBands(level: number, t: number): [number, number, number] {
    if (level <= 0) return [0, 0, 0];
    const beat = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 4.3);
    const lilt = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 1.7 + 1.3);
    const hiss = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 7.9 + 0.4);
    return [level * (0.55 + 0.45 * lilt), level * (0.35 + 0.65 * beat), level * 0.5 * hiss * beat];
}

/** At rest the orb draws at half the frame rate: it moves slowly, and the laptop stays cool. */
export const frameGapMs = (mood: ProtonMood) => (mood === "idle" || mood === "asleep" || mood === "proposing" ? 33 : 0);
