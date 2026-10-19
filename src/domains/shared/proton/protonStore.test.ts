import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { answered, resetProton, showingPage, spoke, useProton, voiceAt } from "./protonStore";

afterEach(() => resetProton());

describe("Proton's store", () => {
    // Regression: the voice's loudness was stored state, so every Proton subscriber re-rendered on every frame
    // the voice spoke (about 60 times a second)
    it("follows the voice's loudness without re-rendering anything", () => {
        let renders = 0;
        renderHook(() => {
            renders++;
            return useProton();
        });
        const before = renders;

        act(() => {
            for (let i = 0; i < 100; i++) spoke(0.5);
        });

        expect(renders).toBe(before);
        expect(voiceAt(Date.now())).toBe(0.5);
        expect(voiceAt(Date.now() + 1_000)).toBe(0);
    });

    it("counts a reply read on the Proton page as seen", () => {
        const { result } = renderHook(() => useProton());
        act(() => {
            showingPage(true);
            answered("All quiet.", false);
        });
        expect(result.current.unseen).toBe(0);
        expect(result.current.peek).toBeNull();

        act(() => {
            showingPage(false);
            answered("Something new.", false);
        });
        expect(result.current.unseen).toBe(1);
    });

    // Regression: the preview beside the blob and the screen reader's announcement showed the answer's markdown
    it("previews and announces an answer as plain text", () => {
        const { result } = renderHook(() => useProton());
        act(() => answered("**Design**\n- **Hours:** 155.5 h, down 81%.", false));

        expect(result.current.peek).toBe("Design Hours: 155.5 h, down 81%.");
        expect(result.current.announce).toBe("Design\nHours: 155.5 h, down 81%.");
    });
});
