import { renderHook } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { playNotification, playReceived, playSent, QUIET_MS, setMessageSounds, useArrivalChime, useNotificationChime } from "./messageSounds";

/** The frequency of each note played: each sound is two notes. */
let notes: number[] = [];
class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createOscillator() {
        return { type: "", frequency: { setValueAtTime: (hz: number) => notes.push(hz) }, connect: (node: unknown) => node, start() {}, stop() {} };
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
    notes = [];
    setMessageSounds(true);
});

// each test starts far from the last arrival of the one before
let clock = 0;
const later = () => (clock += 60_000);
/** How many sounds were played (two notes each). */
const sounds = () => notes.length / 2;

describe("the app's sounds", () => {
    it("chime once for twenty messages arriving at once", () => {
        const t = later();
        for (let i = 0; i < 20; i++) playReceived(t + i);
        expect(sounds()).toBe(1);
    });

    it("stay quiet while messages keep coming, and chime again once they stopped for 1.5 seconds", () => {
        expect(QUIET_MS).toBe(1500);
        const t = later();
        // one a second for five seconds: each comes before the quiet time is up
        for (let i = 0; i <= 5; i++) playReceived(t + i * 1000);
        expect(sounds()).toBe(1);
        const last = t + 5000 + QUIET_MS - 1;
        playReceived(last);
        expect(sounds()).toBe(1);
        playReceived(last + QUIET_MS);
        expect(sounds()).toBe(2);
    });

    it("ring for notifications with their own sound, grouped the same way but apart from messages", () => {
        const t = later();
        playNotification(t);
        playNotification(t + 200);
        playNotification(t + 900);
        expect(sounds()).toBe(1);
        const bell = notes.slice();
        // a message arriving meanwhile still chimes, and sounds different
        playReceived(t + 950);
        expect(sounds()).toBe(2);
        expect(notes.slice(2)).not.toEqual(bell);
        playNotification(t + 900 + QUIET_MS);
        expect(sounds()).toBe(3);
    });

    it("play each message sent", () => {
        playSent();
        playSent();
        expect(sounds()).toBe(2);
    });

    it("stay quiet once turned off, and remember it in this browser", () => {
        setMessageSounds(false);
        playSent();
        playReceived(later());
        playNotification(later());
        expect(sounds()).toBe(0);
        expect(localStorage.getItem("hl-message-sounds")).toBe("off");
        setMessageSounds(true);
        expect(localStorage.getItem("hl-message-sounds")).toBe("on");
    });

    it("chime when the unread messages go up, never for the first count or when it goes down", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(later());
        const { rerender } = renderHook(({ unread }) => useArrivalChime(unread), { initialProps: { unread: undefined as number | undefined } });
        rerender({ unread: 3 });
        expect(sounds()).toBe(0);
        rerender({ unread: 5 });
        expect(sounds()).toBe(1);
        vi.setSystemTime(later());
        rerender({ unread: 1 });
        rerender({ unread: 1 });
        expect(sounds()).toBe(1);
        rerender({ unread: 2 });
        expect(sounds()).toBe(2);
        vi.useRealTimers();
    });

    it("ring when the unread notifications go up, never for the first count", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(later());
        const { rerender } = renderHook(({ unread }) => useNotificationChime(unread), { initialProps: { unread: undefined as number | undefined } });
        rerender({ unread: 4 });
        expect(sounds()).toBe(0);
        // twenty at once: one ring
        rerender({ unread: 24 });
        expect(sounds()).toBe(1);
        vi.useRealTimers();
    });
});
