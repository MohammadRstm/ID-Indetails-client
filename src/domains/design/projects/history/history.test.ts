import { describe, expect, it } from "vitest";
import { companyTimeToUtc } from "@/shared/format/time";
import { buildHistory, dayStart, effortAt, initialMoment, progressAt, segmentsFor, shiftWindow, snapshot, statusAt, windowFor, type Entry, type ProjectEvent } from "./history";

const at = (day: string, h: number, m = 0) => +companyTimeToUtc(day, h * 60 + m);
let seq = 1;
const entry = (userId: number, day: string, from: number, to: number, team: string | null = "Interiors"): Entry => ({
    id: seq++, userId, userName: `Person ${userId}`, team, description: `Work ${userId} on ${day}`,
    start: at(day, from), end: at(day, to), minutes: (to - from) * 60,
});
const event = (kind: string, when: number, amount: number | null = null): ProjectEvent => ({ kind, at: when, actorName: "Nadia Karam", amount });
const project = { startDate: "2026-09-01", completedAt: null, heldSince: null, createdAt: "2026-09-01T06:00:00Z", status: "active" };
const NOW = at("2026-09-30", 12);

describe("a project's history", () => {
    it("takes the status from recorded events, and says when it was not created yet", () => {
        const h = buildHistory(project, [], [], [
            event("project_created", at("2026-09-01", 9)),
            event("project_hold", at("2026-09-10", 9)),
            event("project_resumed", at("2026-09-15", 9)),
        ], NOW);
        expect(statusAt(h, at("2026-08-31", 9)).status).toBe("not-created");
        expect(statusAt(h, at("2026-09-12", 9)).status).toBe("hold");
        const back = statusAt(h, at("2026-09-20", 9));
        expect(back).toMatchObject({ status: "active", again: true, source: "event" });
    });

    it("rebuilds the status from the project's dates when nothing was recorded, and says so", () => {
        const h = buildHistory({ ...project, status: "completed", completedAt: "2026-09-20T12:00:00Z" }, [], [], [], NOW);
        expect(statusAt(h, at("2026-09-10", 9))).toMatchObject({ status: "active", source: "inferred" });
        expect(statusAt(h, at("2026-09-25", 9)).status).toBe("completed");
    });

    it("estimates progress between checkpoints by the work logged in between, never by the calendar", () => {
        const entries = [entry(1, "2026-09-02", 9, 13), entry(1, "2026-09-03", 9, 13)];
        const h = buildHistory(project, entries, [], [event("progress_set", at("2026-09-02", 8), 10), event("progress_set", at("2026-09-04", 8), 50)], NOW);
        expect(progressAt(h, at("2026-09-01", 9))).toMatchObject({ value: null, basis: "unknown" });
        expect(progressAt(h, at("2026-09-02", 8))).toMatchObject({ value: 10, basis: "checkpoint" });
        // half the work between the checkpoints is done by the end of the 2nd
        expect(progressAt(h, at("2026-09-02", 18))).toMatchObject({ value: 30, basis: "interpolated" });
        expect(progressAt(h, at("2026-09-10", 9))).toMatchObject({ value: 50, basis: "held" });
        expect(h.progressTrack[1].prev).toBe(10);
    });

    it("holds progress when no work was logged between two checkpoints", () => {
        const h = buildHistory(project, [], [], [event("progress_set", at("2026-09-02", 8), 10), event("progress_set", at("2026-09-04", 8), 50)], NOW);
        expect(progressAt(h, at("2026-09-03", 8))).toMatchObject({ value: 10, basis: "held" });
    });

    it("counts the effort done by a moment, including an entry still running", () => {
        const h = buildHistory(project, [entry(1, "2026-09-02", 9, 11), entry(2, "2026-09-02", 10, 12)], [], [], NOW);
        expect(effortAt(h, at("2026-09-02", 10, 30))).toBeCloseTo((90 + 30) / 240);
    });

    it("marks pauses of four or more empty days, and a trailing pause only while the project is open", () => {
        const entries = [entry(1, "2026-09-01", 9, 12), entry(1, "2026-09-08", 9, 12), entry(1, "2026-09-10", 9, 12)];
        const open = buildHistory(project, entries, [], [event("project_created", at("2026-09-01", 8))], NOW);
        expect(open.gaps.map((g) => [g.days, g.kind])).toEqual([[6, "silent"], [19, "trailing"]]);
        const done = buildHistory(project, entries, [], [event("project_created", at("2026-09-01", 8)), event("project_completed", at("2026-09-11", 8))], NOW);
        expect(done.gaps.map((g) => g.kind)).toEqual(["silent"]);
    });

    it("cuts a day where people start and stop, ends before starts at the same instant", () => {
        const h = buildHistory(project, [entry(1, "2026-09-02", 9, 11), entry(2, "2026-09-02", 10, 12), entry(1, "2026-09-02", 11, 13)], [], [], NOW);
        const segs = segmentsFor(h.days[0], null);
        expect(segs.map((s) => s.n)).toEqual([1, 2, 2, 1]);
        // at 11:00 person 1's first entry ends and their next begins: one change, no zero-length slice
        expect(segs[2]).toMatchObject({ startedHere: [1], endedHere: [1] });
        expect(h.days[0].peakConcurrency).toBe(2);
    });

    it("notes who joined, who stopped, and the busiest day", () => {
        const entries = [entry(1, "2026-09-01", 9, 17), entry(2, "2026-09-02", 9, 12), entry(2, "2026-09-25", 9, 12), entry(1, "2026-09-03", 9, 10)];
        const h = buildHistory(project, entries, [], [], NOW);
        const kinds = h.annotations.map((a) => a.kind);
        expect(kinds.filter((k) => k === "joined")).toHaveLength(2);
        expect(h.annotations.find((a) => a.kind === "last_entry")?.personId).toBe(1);
        expect(h.annotations.find((a) => a.kind === "peak_day")?.dayKey).toBe("2026-09-01");
    });

    it("describes the project at a moment", () => {
        const h = buildHistory(project, [entry(1, "2026-09-02", 9, 11), entry(2, "2026-09-03", 9, 11)], [], [event("project_created", at("2026-09-01", 8))], NOW);
        expect(snapshot(h, at("2026-09-02", 10)).state).toBe("active");
        expect(snapshot(h, at("2026-09-02", 12)).state).toBe("between");
        expect(snapshot(h, at("2026-09-01", 12)).state).toBe("before-first-work");
        expect(snapshot(h, at("2026-09-05", 12)).state).toBe("after-last-work");
        expect(snapshot(h, NOW + 3_600_000).state).toBe("future");
        expect(initialMoment(h)).toBeLessThanOrEqual(NOW);
    });

    it("moves its window by day, week, month and year", () => {
        expect(windowFor("2026-09-30", "month")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
        expect(windowFor("2026-09-30", "year")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
        expect(windowFor("2026-09-30", "week").from).toBe("2026-09-28");
        expect(shiftWindow("2026-09-30", "month", 1)).toBe("2026-10-01");
        expect(dayStart("2026-09-30")).toBe(at("2026-09-30", 0));
    });
});
