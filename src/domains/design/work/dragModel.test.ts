import { describe, expect, it } from "vitest";
import { work } from "@/test/fixtures/work";
import { checkLog, defaultSlot, isoAt, restoreOf, spanOn, type Span } from "./day";
import { BOX, dayModel, type DayTask } from "./dragModel";

const task = (id: number, s: number, e: number, locked = false): DayTask => ({ id, span: { s, e }, whole: true, locked });
// 7 AM to 9 PM on screen, a 9-to-5 working day
const model = (tasks: DayTask[], box: Span | null = null, limit = 21 * 60) =>
    dayModel({ tasks, range: [7 * 60, 21 * 60], limit, workHours: { s: 540, e: 1020 }, box, live: {} });

describe("the drag timeline's rules", () => {
    it("snaps to the working day and to task edges within ten minutes, else to five minutes", () => {
        const m = model([task(1, 600, 660)]);
        expect(m.magnet(533)).toBe(540);
        expect(m.magnet(668)).toBe(660);
        expect(m.magnet(703)).toBe(705);
    });

    it("finds the free stretch around a moment", () => {
        const m = model([task(1, 600, 660), task(2, 720, 780)]);
        expect(m.gapAround(690)).toEqual([660, 720]);
        expect(m.gapAround(500)).toEqual([420, 600]);
    });

    it("starts a new box where a pressed task ends", () => {
        expect(model([task(1, 600, 660)]).anchorAt(630)).toBe(660);
    });

    it("pushes the neighbours along, back to back, when an edge is stretched", () => {
        const m = model([task(1, 600, 660), task(2, 660, 720)], { s: 540, e: 600 });
        expect(m.pushEdge(m.blocksNow({}), BOX, "r", 630)).toEqual({ s: 540, e: 630, moved: { 1: { s: 630, e: 690 }, 2: { s: 690, e: 750 } }, over: 0 });
    });

    it("stops an edge against a locked task instead of moving it", () => {
        const m = model([task(1, 600, 660, true)], { s: 540, e: 600 });
        expect(m.pushEdge(m.blocksNow({}), BOX, "r", 630)).toEqual({ s: 540, e: 600, moved: {}, over: 0 });
    });

    it("never pushes past now", () => {
        const m = model([task(1, 600, 660)], { s: 540, e: 600 }, 680);
        expect(m.pushEdge(m.blocksNow({}), BOX, "r", 650)?.e).toBe(620);
    });

    it("trades places with a task the box is carried into, keeping the gap", () => {
        const m = model([task(1, 600, 690)], { s: 540, e: 600 });
        expect(m.carry({ grab: 0, s: 540, e: 600, swaps: {}, lastSwap: null }, 620, true))
            .toEqual({ s: 630, e: 690, swaps: { 1: { s: 540, e: 630 } }, lastSwap: 1 });
    });

    it("slides a moved task through free time only", () => {
        const m = model([task(1, 600, 660), task(2, 720, 780)]);
        expect(m.carryTask({ id: 1, grab: 0, s: 600, e: 660, swaps: {} }, 640, true)).toEqual({ s: 640, e: 700 });
        expect(m.carryTask({ id: 1, grab: 0, s: 600, e: 660, swaps: {} }, 700, true)).toEqual({ s: 660, e: 720 });
    });

    it("forgets moves that put a task back where it was", () => {
        const m = model([task(1, 600, 660)]);
        expect(m.tidy({ 1: { s: 600, e: 660 } })).toEqual({});
        expect(m.tidy({ 1: { s: 610, e: 670 } })).toEqual({ 1: { s: 610, e: 670 } });
    });
});

describe("a log's checks", () => {
    const day = work.day.date;
    const base = { projectId: 2, day, others: work.day.entries, moves: {}, allowFuture: false, allowOverlap: false };

    it("asks for a project and at least five minutes", () => {
        expect(checkLog({ ...base, projectId: null, startMin: 1080, duration: 60 })).toBe("Pick a project.");
        expect(checkLog({ ...base, startMin: 1080, duration: 3 })).toBe("An entry needs to be at least 5 minutes.");
    });

    it("names the entry it overlaps", () => {
        expect(checkLog({ ...base, startMin: 10 * 60, duration: 30 })).toMatch(/^This overlaps with your entry 9:10 AM → 10:10 AM \(/);
        expect(checkLog({ ...base, allowOverlap: true, startMin: 10 * 60, duration: 30 })).toBeNull();
        // the entry it overlapped is being moved out of the way
        const first = work.day.entries[0];
        expect(checkLog({ ...base, moves: { [first.id]: { s: 7 * 60, e: 8 * 60 } }, startMin: 9 * 60 + 10, duration: 60 })).toBeNull();
    });

    it("starts a new log after the day's last entry", () => {
        const spans = work.day.entries.map((e) => spanOn(e, day));
        expect(defaultSlot(spans, 540, false, 0)).toEqual({ s: 18 * 60, d: 60 });
        // today, up to now, rounded down so it never ends in the future
        expect(defaultSlot(spans, 540, true, 18 * 60 + 23)).toEqual({ s: 18 * 60, d: 20 });
        expect(defaultSlot([], 540, false, 0)).toEqual({ s: 540, d: 60 });
    });
});

describe("undoing a log that moved other tasks", () => {
    const day = work.day.date;
    const [a, b] = work.day.entries;

    it("puts every moved task back where it was, in one save", () => {
        const was = { a: spanOn(a, day), b: spanOn(b, day) };
        const restore = restoreOf(work.day.entries, day, { [a.id]: { s: was.a.s + 30, e: was.a.e + 30 }, [b.id]: { s: was.b.s + 30, e: was.b.e + 30 } });
        expect(restore?.id).toBe(a.id);
        expect(restore?.body).toMatchObject({
            startedAt: isoAt(day, was.a.s),
            endedAt: isoAt(day, was.a.e),
            moves: [{ id: b.id, startedAt: isoAt(day, was.b.s), endedAt: isoAt(day, was.b.e) }],
        });
    });

    it("has nothing to restore when nothing moved", () => {
        expect(restoreOf(work.day.entries, day, {})).toBeNull();
    });
});
