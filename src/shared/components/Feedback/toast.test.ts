import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToasts, holdToast, releaseToast, toast, TOAST_MS, useToasts } from "./toast";

const shown = () => renderHook(() => useToasts());

// the test setup stretches the timings; these are the app's own
const saved = { ...TOAST_MS };
beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(TOAST_MS, { short: 2000, long: 5000 });
});
afterEach(() => {
    clearToasts();
    vi.useRealTimers();
    Object.assign(TOAST_MS, saved);
});

describe("toasts", () => {
    it("go after 2 seconds", () => {
        const { result } = shown();
        act(() => { toast({ text: "Saved" }); });
        act(() => { vi.advanceTimersByTime(1999); });
        expect(result.current).toHaveLength(1);
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toHaveLength(0);
    });

    it("stay 5 seconds when they offer Undo or say what went wrong", () => {
        const { result } = shown();
        act(() => {
            toast({ text: "Project closed", actionLabel: "Undo", action: () => {} });
            toast({ text: "Not saved", icon: "alert" });
        });
        act(() => { vi.advanceTimersByTime(4999); });
        expect(result.current).toHaveLength(2);
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toHaveLength(0);
    });

    it("stay while they are being read, and count down again afterwards", () => {
        const { result } = shown();
        let id = 0;
        act(() => { id = toast({ text: "Saved" }); });
        act(() => { holdToast(id); vi.advanceTimersByTime(10_000); });
        expect(result.current).toHaveLength(1);
        act(() => { releaseToast(id); vi.advanceTimersByTime(2000); });
        expect(result.current).toHaveLength(0);
    });
});
