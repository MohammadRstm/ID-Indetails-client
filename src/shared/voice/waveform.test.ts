import { describe, expect, it } from "vitest";
import { BARS, peaksOf, placeholderPeaks } from "./waveform";

describe("a voice note's waveform", () => {
    it("has one bar per stretch, the loudest at the top and silence on the floor", () => {
        // the first half silent, the second loud
        const samples = new Float32Array(8000).map((_, i) => (i < 4000 ? 0 : Math.sin(i) * 0.8));
        const peaks = peaksOf(samples);
        expect(peaks).toHaveLength(BARS);
        expect(Math.max(...peaks)).toBe(1);
        expect(peaks[0]).toBe(0.14);
        expect(peaks[BARS - 1]).toBeGreaterThan(0.9);
    });

    it("stands in with the same made-up shape for the same note", () => {
        expect(placeholderPeaks("file-7")).toEqual(placeholderPeaks("file-7"));
        expect(placeholderPeaks("file-7")).not.toEqual(placeholderPeaks("file-8"));
        expect(placeholderPeaks("file-7").every((h) => h >= 0.14 && h <= 1)).toBe(true);
    });
});
