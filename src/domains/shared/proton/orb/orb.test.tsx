import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orbSignalAt, personSpoke, resetProton, spoke } from "../protonStore";
import { voiceBands } from "../protonVoice";
import OrbFigure from "./OrbFigure";
import { easeLook, follow, frameGapMs, lookOf, syllableBands } from "./orbLook";

afterEach(() => {
    vi.useRealTimers();
    resetProton();
});

describe("the orb's looks", () => {
    it("are calm at rest, swirl while thinking, livelier while working, and dim while asleep", () => {
        expect(lookOf("idle").swirl).toBe(0);
        expect(lookOf("thinking").swirl).toBeGreaterThan(0);
        expect(lookOf("working").energy).toBeGreaterThan(lookOf("thinking").energy);
        expect(lookOf("listening").energy).toBeGreaterThan(lookOf("idle").energy);
        expect(lookOf("asleep").dim).toBeGreaterThan(0);
        expect(lookOf("idle").dim).toBe(0);
        // something went wrong: the ring turns red
        expect(lookOf("error").colors[0][0]).toBeGreaterThan(lookOf("error").colors[0][2]);
    });

    it("ease from one mood to the next instead of jumping", () => {
        const halfway = easeLook(lookOf("idle"), lookOf("working"), 0.5);
        expect(halfway.flow).toBeCloseTo((lookOf("idle").flow + lookOf("working").flow) / 2);
        const arrived = easeLook(lookOf("idle"), lookOf("working"), 1);
        expect(arrived.energy).toBeCloseTo(lookOf("working").energy);
        expect(arrived.swirl).toBeCloseTo(lookOf("working").swirl);
        expect(arrived.colors[1][0]).toBeCloseTo(lookOf("working").colors[1][0]);
    });

    it("follow a voice quickly as it rises and let go more slowly", () => {
        const rising = follow(0, 1, 0.05);
        const falling = 1 - follow(1, 0, 0.05);
        expect(rising).toBeGreaterThan(falling);
    });

    it("give written answers a syllable rhythm under their loudness, and nothing when silent", () => {
        expect(syllableBands(0, 3)).toEqual([0, 0, 0]);
        for (let t = 0; t < 2; t += 0.07) {
            for (const band of syllableBands(0.6, t)) {
                expect(band).toBeGreaterThanOrEqual(0);
                expect(band).toBeLessThanOrEqual(0.6);
            }
        }
    });

    it("draw at half the frame rate at rest, and every frame while busy", () => {
        expect(frameGapMs("idle")).toBeGreaterThan(0);
        expect(frameGapMs("talking")).toBe(0);
        expect(frameGapMs("thinking")).toBe(0);
    });
});

describe("the voice the orb follows", () => {
    it("is split into low, middle and high parts", () => {
        // 48 kHz over 512 points: each bin is 93.75 Hz; loud only under 350 Hz
        const spectrum = new Uint8Array(256);
        spectrum.fill(255, 1, 4);
        const [low, middle, high] = voiceBands(spectrum, 93.75);
        expect(low).toBeGreaterThan(0.5);
        expect(middle).toBe(0);
        expect(high).toBe(0);
    });

    it("comes from Proton's voice with its bands, and from the person's microphone, only while they last", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-11-11T09:00:00Z"));
        spoke(0.8, [0.2, 0.5, 0.7]);
        personSpoke(0.4);
        expect(orbSignalAt(Date.now())).toEqual({ speak: 0.8, bands: [0.2, 0.5, 0.7], hear: 0.4 });

        vi.setSystemTime(new Date("2026-11-11T09:00:01Z"));
        expect(orbSignalAt(Date.now())).toEqual({ speak: 0, bands: null, hear: 0 });
    });
});

describe("the orb figure", () => {
    it("is the classic blob where the browser can't draw it", () => {
        // the test browser has no WebGL
        const { container } = render(<OrbFigure mood="idle" signalAt={orbSignalAt} voiceAt={() => 0} still={false} />);
        expect(container.querySelector("svg.proton-figure")).not.toBeNull();
        expect(container.querySelector("canvas")).toBeNull();
    });
});
