/*
 * Where the blob sits: against the left or right edge, at a height kept as a fraction of the window so it stays in
 * the same place when the window changes size. Remembered in this browser with the person's other blob choices.
 */

export type BlobSide = "left" | "right";

export type BlobPrefs = {
    side: BlobSide;
    /** 0 at the top of the free area, 1 at the bottom. */
    y: number;
    /** No moving shapes: the blob stays still whatever its mood. */
    calm: boolean;
    /** Tucked into the edge, showing only a small tab. */
    tucked: boolean;
};

export type Box = { x: number; y: number; width: number; height: number };

export const DEFAULT_PREFS: BlobPrefs = { side: "right", y: 1, calm: false, tucked: false };

/** Kept clear of the top bar. */
const TOP = 70;
const MARGIN = 16;
const KEY = "proton:blob";

export function loadPrefs(): BlobPrefs {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<BlobPrefs> | null;
        if (!stored) return DEFAULT_PREFS;
        return {
            side: stored.side === "left" ? "left" : "right",
            y: typeof stored.y === "number" && stored.y >= 0 && stored.y <= 1 ? stored.y : DEFAULT_PREFS.y,
            calm: stored.calm === true,
            tucked: stored.tucked === true,
        };
    } catch {
        return DEFAULT_PREFS;
    }
}

export function savePrefs(prefs: BlobPrefs) {
    try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
        // not remembered: it still moves for now
    }
}

/** The blob's top-left corner in the window for these choices. */
export function placeOf(prefs: Pick<BlobPrefs, "side" | "y">, viewport: { width: number; height: number }, size: number): { x: number; y: number } {
    const span = Math.max(0, viewport.height - TOP - MARGIN - size);
    return {
        x: prefs.side === "left" ? MARGIN : Math.max(MARGIN, viewport.width - MARGIN - size),
        y: TOP + span * prefs.y,
    };
}

/** Where a blob dropped at (x, y) settles: the nearer edge, at that height. */
export function snapOf(x: number, y: number, viewport: { width: number; height: number }, size: number): Pick<BlobPrefs, "side" | "y"> {
    const span = Math.max(1, viewport.height - TOP - MARGIN - size);
    return {
        side: x + size / 2 < viewport.width / 2 ? "left" : "right",
        y: Math.min(1, Math.max(0, (y - TOP) / span)),
    };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The height the blob moves to so it doesn't cover what the person is working with (the focused field, a dialog's
 * buttons, the message composer): just above the first thing it would hide, or just below if there's no room above.
 */
export function clearOf(blob: Box, obstacles: Box[], viewport: { height: number }): number {
    let y = blob.y;
    for (const obstacle of obstacles) {
        if (!overlaps({ ...blob, y }, obstacle)) continue;
        const above = obstacle.y - blob.height - 8;
        y = above >= TOP ? above : Math.min(obstacle.y + obstacle.height + 8, viewport.height - blob.height - MARGIN);
    }
    return y;
}
