import type { ProtonMood } from "./protonMood";

/*
 * The blob's outline: a few radii around a centre, joined by a closed Catmull-Rom curve so it always stays soft.
 * Everything here is pure, so the shape for a moment can be tested and drawn the same way every time.
 */

export const POINTS = 9;

/** How much each mood wobbles, how fast, and how round it sits at rest. */
const STYLE: Record<ProtonMood, { wobble: number; speed: number; squash: number }> = {
    idle: { wobble: 0.03, speed: 0.6, squash: 0 },
    listening: { wobble: 0.035, speed: 0.8, squash: 0 },
    thinking: { wobble: 0.06, speed: 1.6, squash: 0 },
    working: { wobble: 0.08, speed: 2.4, squash: 0 },
    talking: { wobble: 0.05, speed: 2, squash: 0 },
    proposing: { wobble: 0.03, speed: 0.7, squash: 0 },
    happy: { wobble: 0.04, speed: 1.2, squash: -0.04 },
    error: { wobble: 0.02, speed: 0.5, squash: 0.06 },
    asleep: { wobble: 0.015, speed: 0.3, squash: 0.08 },
};

/**
 * The radii (as fractions of the size) at `t` seconds, for a mood, inflated by `level` (0–1) while talking. Squash
 * flattens the top and bottom: a sleepy or upset blob sits lower, a happy one stands a little taller.
 */
export function radiiAt(t: number, mood: ProtonMood, level = 0): number[] {
    const { wobble, speed, squash } = STYLE[mood];
    return Array.from({ length: POINTS }, (_, i) => {
        const angle = (i / POINTS) * Math.PI * 2;
        const wave = Math.sin(t * speed + i * 2.1) * wobble + Math.sin(t * speed * 0.7 + i * 1.3) * wobble * 0.5;
        const flat = -squash * Math.abs(Math.cos(angle));
        return 1 + wave + flat + level * 0.12;
    });
}

/** A closed SVG path through the radii around (cx, cy), scaled by `size`, as cubic Béziers. */
export function blobPath(radii: number[], cx: number, cy: number, size: number): string {
    const points = radii.map((r, i) => {
        // the first point is straight up, so the head of the blob is where the wobble shows least
        const angle = (i / radii.length) * Math.PI * 2 - Math.PI / 2;
        return [cx + Math.cos(angle) * r * size, cy + Math.sin(angle) * r * size] as const;
    });
    const n = points.length;
    const f = (v: number) => v.toFixed(2);
    let d = `M${f(points[0][0])},${f(points[0][1])}`;
    for (let i = 0; i < n; i++) {
        const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
        // Catmull-Rom to Bézier: each control point a sixth of the way along the neighbours' chord
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
    }
    return `${d} Z`;
}

/**
 * One step of a soft spring from `value` towards `target`: what makes the blob ease into a bigger breath instead
 * of jumping. Returns the new value and velocity.
 */
export function springStep(value: number, velocity: number, target: number, dt: number, stiffness = 180, damping = 18): [number, number] {
    const step = Math.min(dt, 0.05);
    const acceleration = stiffness * (target - value) - damping * velocity;
    const next = velocity + acceleration * step;
    return [value + next * step, next];
}
