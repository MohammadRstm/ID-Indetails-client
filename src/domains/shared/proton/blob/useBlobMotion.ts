import { useEffect, type RefObject } from "react";
import { blobPath, radiiAt, springStep } from "./blobShape";
import { isLively, type ProtonMood } from "./protonMood";
import { talkDuration, talkLevel } from "./talkPlan";

/** While talking, the shape is redrawn at most this often (about 30 frames a second). */
const TALK_FRAME_MS = 33;

export type BlobMotionInput = {
    mood: ProtonMood;
    saying: { text: string; until: number } | null;
    /** Reduced motion or "Calm animations": the loop never runs. */
    still: boolean;
};

/**
 * Moves the blob while it thinks, works or talks: a requestAnimationFrame loop that redraws its outline (no React
 * render per frame) and inflates it with the talk level through a spring. It runs only in those moods, pauses while
 * the tab is hidden, and never runs when motion should be still.
 */
export function useBlobMotion(paths: RefObject<(SVGPathElement | null)[]>, input: BlobMotionInput) {
    const { mood, saying, still } = input;

    useEffect(() => {
        if (still || !isLively(mood)) return;
        const nodes = paths.current;
        let frame = 0;
        let last = 0;
        let scale = 0;
        let velocity = 0;

        const tick = (time: number) => {
            frame = requestAnimationFrame(tick);
            if (mood === "talking" && time - last < TALK_FRAME_MS) return;
            const dt = last ? (time - last) / 1000 : 0;
            last = time;
            const now = Date.now();
            const level = saying && now < saying.until ? talkLevel(saying.text, now - (saying.until - talkDuration(saying.text))) : 0;
            [scale, velocity] = springStep(scale, velocity, level, dt);
            draw(nodes, blobPath(radiiAt(time / 1000, mood, Math.max(0, scale)), CENTRE, CENTRE, RADIUS));
        };

        const start = () => {
            if (!document.hidden && !frame) frame = requestAnimationFrame(tick);
        };
        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
        };
        const onVisibility = () => (document.hidden ? stop() : start());

        start();
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
            // back to the shape at rest, which React drew and won't draw again
            draw(nodes, restingPath(mood));
        };
    }, [mood, saying, still, paths]);
}

/** The blob is drawn in a 100 × 100 box. */
const CENTRE = 50;
const RADIUS = 34;

export const restingPath = (mood: ProtonMood) => blobPath(radiiAt(0, mood), CENTRE, CENTRE, RADIUS);

function draw(paths: (SVGPathElement | null)[], d: string) {
    for (const path of paths) path?.setAttribute("d", d);
}
