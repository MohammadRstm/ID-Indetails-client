import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToasts, dismissToast, holdToast, releaseToast, toast, TOAST_MS, useToasts } from "./toast";

const shown = () => renderHook(() => useToasts());

// the test setup stretches the timings; these are the app's own
const saved = { ...TOAST_MS };
beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(TOAST_MS, { short: 2000, long: 5000, exit: 260 });
});
afterEach(() => {
    clearToasts();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.assign(TOAST_MS, saved);
});

describe("toasts", () => {
    it("fade out after 2 seconds, then go", () => {
        const { result } = shown();
        act(() => { toast({ text: "Saved" }); });
        const leaving = () => result.current.map((t) => !!t.leaving);
        act(() => { vi.advanceTimersByTime(1999); });
        expect(leaving()).toEqual([false]);
        act(() => { vi.advanceTimersByTime(1); });
        expect(leaving()).toEqual([true]);
        act(() => { vi.advanceTimersByTime(260); });
        expect(result.current).toHaveLength(0);
    });

    it("stay 5 seconds when they offer Undo or say what went wrong", () => {
        const { result } = shown();
        act(() => {
            toast({ text: "Project closed", actionLabel: "Undo", action: () => {} });
            toast({ text: "Not saved", icon: "alert" });
        });
        act(() => { vi.advanceTimersByTime(4999); });
        expect(result.current.filter((t) => !t.leaving)).toHaveLength(2);
        act(() => { vi.advanceTimersByTime(1 + 260); });
        expect(result.current).toHaveLength(0);
    });

    it("stay while they are being read, and count down again afterwards", () => {
        const { result } = shown();
        let id = 0;
        act(() => { id = toast({ text: "Saved" }); });
        act(() => { holdToast(id); vi.advanceTimersByTime(10_000); });
        expect(result.current).toHaveLength(1);
        act(() => { releaseToast(id); vi.advanceTimersByTime(2000 + 260); });
        expect(result.current).toHaveLength(0);
    });

    it("once fading out, can't be held back by the pointer", () => {
        const { result } = shown();
        let id = 0;
        act(() => { id = toast({ text: "Saved" }); });
        act(() => { dismissToast(id); holdToast(id); vi.advanceTimersByTime(260); });
        expect(result.current).toHaveLength(0);
    });

    it("go at once for people who prefer less motion", () => {
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
        const { result } = shown();
        let id = 0;
        act(() => { id = toast({ text: "Saved" }); });
        act(() => { dismissToast(id); });
        expect(result.current).toHaveLength(0);
    });
});
