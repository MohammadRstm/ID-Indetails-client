import { renderHook } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { playReceived, playSent, QUIET_MS, setMessageSounds, useArrivalChime } from "./messageSounds";

/** Counts the notes played: each sound is two. */
let notes = 0;
class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createOscillator() {
        notes++;
        return { type: "", frequency: { setValueAtTime() {} }, connect: (node: unknown) => node, start() {}, stop() {} };
    }
    createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (node: unknown) => node };
    }
    resume() {
        return Promise.resolve();
    }
}

beforeAll(() => vi.stubGlobal("AudioContext", FakeAudioContext));
beforeEach(() => {
    notes = 0;
    setMessageSounds(true);
});

// each test starts far from the last chime of the one before
let clock = 0;
const later = () => (clock += 60_000);

describe("the messages' sounds", () => {
    it("chime once for messages arriving together or close together", () => {
        const t = later();
        playReceived(t);
        playReceived(t + 10);
        playReceived(t + QUIET_MS - 1);
        expect(notes).toBe(2);
        playReceived(t + QUIET_MS + 1);
        expect(notes).toBe(4);
    });

    it("play each message sent", () => {
        playSent();
        playSent();
        expect(notes).toBe(4);
    });

    it("stay quiet once turned off, and remember it in this browser", () => {
        setMessageSounds(false);
        playSent();
        playReceived(later());
        expect(notes).toBe(0);
        expect(localStorage.getItem("hl-message-sounds")).toBe("off");
        setMessageSounds(true);
        expect(localStorage.getItem("hl-message-sounds")).toBe("on");
    });

    it("chime when the unread count goes up, never for the first count or when it goes down", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(later());
        const { rerender } = renderHook(({ unread }) => useArrivalChime(unread), { initialProps: { unread: undefined as number | undefined } });
        rerender({ unread: 3 });
        expect(notes).toBe(0);
        rerender({ unread: 5 });
        expect(notes).toBe(2);
        vi.setSystemTime(later());
        rerender({ unread: 1 });
        rerender({ unread: 1 });
        expect(notes).toBe(2);
        rerender({ unread: 2 });
        expect(notes).toBe(4);
        vi.useRealTimers();
    });
});
