import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProtonMood } from "./protonMood";
import { useBlobMotion } from "./useBlobMotion";

const paths = { current: [] as (SVGPathElement | null)[] };

afterEach(() => vi.restoreAllMocks());

describe("the blob's animation loop", () => {
    it("runs while Proton thinks, works or talks, and stops when it rests", () => {
        const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
        const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
        const { rerender } = renderHook(({ mood }: { mood: ProtonMood }) => useBlobMotion(paths, { mood, saying: null, still: false }), {
            initialProps: { mood: "idle" as ProtonMood },
        });
        expect(frame).not.toHaveBeenCalled();

        rerender({ mood: "thinking" });
        expect(frame).toHaveBeenCalledTimes(1);

        rerender({ mood: "idle" });
        expect(cancel).toHaveBeenCalled();
    });

    it("never runs when motion should be still (reduced motion or Calm animations)", () => {
        const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
        renderHook(() => useBlobMotion(paths, { mood: "talking", saying: { text: "Hi", until: Date.now() + 900 }, still: true }));
        expect(frame).not.toHaveBeenCalled();
    });

    it("pauses while the tab is hidden", () => {
        const frame = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
        const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        renderHook(() => useBlobMotion(paths, { mood: "working", saying: null, still: false }));
        expect(frame).not.toHaveBeenCalled();

        hidden.mockReturnValue(false);
        document.dispatchEvent(new Event("visibilitychange"));
        expect(frame).toHaveBeenCalledTimes(1);
    });
});
