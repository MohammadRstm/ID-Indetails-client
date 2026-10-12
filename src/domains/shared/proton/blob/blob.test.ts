import { describe, expect, it } from "vitest";
import { blobPath, POINTS, radiiAt, springStep } from "./blobShape";
import { clearOf, DEFAULT_PREFS, loadPrefs, placeOf, savePrefs, snapOf } from "./blobPosition";
import { isLively, moodName, moodOf, WORKING_AFTER_MS, type MoodInputs } from "./protonMood";
import { talkDuration, talkLevel } from "./talkPlan";

const calm: MoodInputs = { available: true, askedAt: null, talkingUntil: 0, errorUntil: 0, happyUntil: 0, cardOpen: false, composing: false };

describe("Proton's mood", () => {
    it("shows the most important thing first", () => {
        const now = 10_000;
        expect(moodOf(calm, now)).toBe("idle");
        expect(moodOf({ ...calm, composing: true }, now)).toBe("listening");
        expect(moodOf({ ...calm, composing: true, cardOpen: true }, now)).toBe("proposing");
        expect(moodOf({ ...calm, cardOpen: true, happyUntil: now + 1 }, now)).toBe("happy");
        expect(moodOf({ ...calm, happyUntil: now + 1, talkingUntil: now + 1 }, now)).toBe("talking");
        expect(moodOf({ ...calm, talkingUntil: now + 1, askedAt: now }, now)).toBe("thinking");
        expect(moodOf({ ...calm, askedAt: now - WORKING_AFTER_MS }, now)).toBe("working");
        expect(moodOf({ ...calm, askedAt: now, errorUntil: now + 1 }, now)).toBe("error");
        expect(moodOf({ ...calm, available: false, errorUntil: now + 1 }, now)).toBe("asleep");
        // what has passed no longer counts
        expect(moodOf({ ...calm, talkingUntil: now, errorUntil: now - 1, happyUntil: now }, now)).toBe("idle");
    });

    it("names the blob with its mood, and only thinking, working and talking move", () => {
        expect(moodName("thinking")).toBe("Proton, thinking");
        expect(moodName("asleep")).toBe("Proton, resting");
        expect(["thinking", "working", "talking"].every((m) => isLively(m as never))).toBe(true);
        expect(isLively("idle")).toBe(false);
    });
});

describe("Proton talking", () => {
    it("talks for a time that follows the reply's length, within bounds", () => {
        expect(talkDuration("Hi")).toBe(900);
        expect(talkDuration("x".repeat(100))).toBe(2800);
        expect(talkDuration("x".repeat(1000))).toBe(4200);
    });

    it("is louder on letters than on spaces and stops", () => {
        const text = "Villa Mounir is on hold. Anything else?";
        const at = (i: number) => (i / text.length) * talkDuration(text) + 1;
        expect(talkLevel(text, at(0))).toBeGreaterThan(0.6);
        expect(talkLevel(text, at(5))).toBe(0.25);
        expect(talkLevel(text, at(text.indexOf(".")))).toBe(0.05);
        expect(talkLevel(text, talkDuration(text))).toBe(0);
        expect(talkLevel(text, -1)).toBe(0);
    });
});

describe("the blob's shape", () => {
    it("is a closed, soft curve through its radii, the same for the same moment", () => {
        const radii = radiiAt(1.5, "thinking");
        expect(radii).toHaveLength(POINTS);
        expect(radiiAt(1.5, "thinking")).toEqual(radii);
        const d = blobPath(radii, 50, 50, 34);
        expect(d.startsWith("M")).toBe(true);
        expect(d.endsWith("Z")).toBe(true);
        expect(d.match(/C/g)).toHaveLength(POINTS);
    });

    it("inflates while talking and sits lower when asleep", () => {
        const average = (r: number[]) => r.reduce((a, b) => a + b) / r.length;
        expect(average(radiiAt(0, "talking", 1))).toBeGreaterThan(average(radiiAt(0, "talking", 0)) + 0.1);
        expect(average(radiiAt(0, "asleep"))).toBeLessThan(average(radiiAt(0, "idle")));
    });

    it("eases towards a new size instead of jumping", () => {
        let [value, velocity] = [0, 0];
        [value, velocity] = springStep(value, velocity, 1, 1 / 60);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(0.5);
        for (let i = 0; i < 240; i++) [value, velocity] = springStep(value, velocity, 1, 1 / 60);
        expect(value).toBeCloseTo(1, 2);
    });
});

describe("where the blob sits", () => {
    const viewport = { width: 1200, height: 800 };

    it("sits against an edge at a height kept as a share of the window", () => {
        expect(placeOf({ side: "right", y: 1 }, viewport, 64)).toEqual({ x: 1120, y: 720 });
        expect(placeOf({ side: "left", y: 0 }, viewport, 64)).toEqual({ x: 16, y: 70 });
    });

    it("snaps to the nearer edge where it was dropped", () => {
        expect(snapOf(200, 395, viewport, 64)).toEqual({ side: "left", y: 0.5 });
        expect(snapOf(900, 2000, viewport, 64)).toEqual({ side: "right", y: 1 });
    });

    it("moves off what the person is working with", () => {
        const blob = { x: 1120, y: 720, width: 64, height: 64 };
        expect(clearOf(blob, [{ x: 1000, y: 700, width: 180, height: 40 }], viewport)).toBe(700 - 64 - 8);
        expect(clearOf(blob, [{ x: 0, y: 0, width: 100, height: 100 }], viewport)).toBe(720);
    });

    it("remembers the person's choices, and ignores what it can't read", () => {
        savePrefs({ side: "left", y: 0.25, calm: true, tucked: false });
        expect(loadPrefs()).toEqual({ side: "left", y: 0.25, calm: true, tucked: false });
        localStorage.setItem("proton:blob", "{bad");
        expect(loadPrefs()).toEqual(DEFAULT_PREFS);
        localStorage.setItem("proton:blob", JSON.stringify({ side: "up", y: 7 }));
        expect(loadPrefs()).toEqual(DEFAULT_PREFS);
        localStorage.clear();
    });
});
