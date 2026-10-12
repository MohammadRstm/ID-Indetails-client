import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resetProton, spoke, useProton, voiceAt } from "./protonStore";

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
});
