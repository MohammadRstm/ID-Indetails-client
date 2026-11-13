import { describe, expect, it } from "vitest";
import { centered, clampPlacement, MAX_ZOOM, shownSize, sourceSquare, zoomTo, type Placement } from "./squareCrop";

const side = 260;
// a wide photo: twice as wide as it is tall
const wide = { width: 2000, height: 1000 };
const tall = { width: 1000, height: 3000 };

/** Equal to the pixel's fraction: the maths is in floating point. */
function expectPlacement(got: Placement, want: Placement) {
    expect(got.zoom).toBeCloseTo(want.zoom, 5);
    expect(got.x).toBeCloseTo(want.x, 5);
    expect(got.y).toBeCloseTo(want.y, 5);
}
function expectSquare(got: { x: number; y: number; side: number }, want: { x: number; y: number; side: number }) {
    expect(got.x).toBeCloseTo(want.x, 3);
    expect(got.y).toBeCloseTo(want.y, 3);
    expect(got.side).toBeCloseTo(want.side, 3);
}

describe("placing a picture in a square window", () => {
    it("fills the window with the picture's shorter side at zoom 1", () => {
        const shown = shownSize(wide, side, 1);
        expect(shown.width).toBeCloseTo(520);
        expect(shown.height).toBeCloseTo(260);
        const upright = shownSize(tall, side, 1);
        expect(upright.width).toBeCloseTo(260);
        expect(upright.height).toBeCloseTo(780);
        expect(shownSize(wide, side, 2).width).toBeCloseTo(1040);
    });

    it("starts with the picture's middle in the middle of the window", () => {
        expectPlacement(centered(wide, side), { zoom: 1, x: -130, y: 0 });
        expectPlacement(centered(tall, side), { zoom: 1, x: 0, y: -260 });
        // and the square it cuts is the middle of the picture
        expectSquare(sourceSquare(centered(wide, side), wide, side), { x: 500, y: 0, side: 1000 });
        expectSquare(sourceSquare(centered(tall, side), tall, side), { x: 0, y: 1000, side: 1000 });
    });

    it("never leaves a gap at an edge, however far it is dragged", () => {
        const at = (x: number, y: number) => clampPlacement({ zoom: 1, x, y }, wide, side);
        expectPlacement(at(50, 40), { zoom: 1, x: 0, y: 0 });
        expectPlacement(at(-999, -999), { zoom: 1, x: -260, y: 0 });
        // between the edges it goes where it is put
        expect(at(-100, 0).x).toBeCloseTo(-100);
    });

    it("keeps the zoom between its limits, and the picture covering the window when zooming out", () => {
        expect(clampPlacement({ zoom: 99, x: 0, y: 0 }, wide, side).zoom).toBe(MAX_ZOOM);
        expect(clampPlacement({ zoom: 0.2, x: 0, y: 0 }, wide, side).zoom).toBe(1);
        // zoomed in and moved to the far corner, then zoomed out: still covering the window
        expectPlacement(zoomTo({ zoom: 3, x: -1040, y: -520 }, 1, wide, side), { zoom: 1, x: -260, y: 0 });
    });

    it("keeps what is in the middle of the window in the middle when zooming", () => {
        // the middle of the picture, zoomed to 2
        const placed = zoomTo(centered(wide, side), 2, wide, side);
        expectPlacement(placed, { zoom: 2, x: -390, y: -130 });
        // it now shows the middle 500px of the picture, across and down
        expectSquare(sourceSquare(placed, wide, side), { x: 750, y: 250, side: 500 });
    });

    it("cuts the square the window shows after the picture is moved", () => {
        // dragged all the way to the left edge: the picture's left-hand square
        expectSquare(sourceSquare({ zoom: 1, x: 0, y: 0 }, wide, side), { x: 0, y: 0, side: 1000 });
        // and all the way right
        expectSquare(sourceSquare({ zoom: 1, x: -260, y: 0 }, wide, side), { x: 1000, y: 0, side: 1000 });
    });
});
