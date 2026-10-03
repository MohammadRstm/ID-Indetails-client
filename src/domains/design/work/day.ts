import type { Schemas } from "@/api/types";
import { companyTimeToUtc, companyToday, dayKey, fmtH, fmtHourLabel, fmtMinutes, fmtRange, fmtTime, minutesOfDay } from "@/shared/format/time";
import type { TrackEntry } from "./DayTrack";
import { entryBody, type EntryMove, type SaveEntryBody, type WorkEntry } from "./workApi";

/*
 * A working day as minutes after midnight, in company time (the prototype's 72-workday.js). What counts
 * as overtime is never worked out here: the API's overtime preview says.
 */

export type Span = { s: number; e: number };
/** Logged entries moved by a swap or a push on the timeline, by id: saved with the log. */
export type Moves = Record<number, Span>;

export const DAY = 1440;
/** The shortest entry the API takes, in minutes. */
export const MIN_ENTRY = 5;
/** Where a day starts when the schedule doesn't say (9 AM). */
export const DEFAULT_START = 9 * 60;
/** What a day off's timeline shows before anything is logged on it: 7 AM to 9 PM. */
export const DAY_OFF_HOURS: [number, number] = [7 * 60, 21 * 60];

export const snap = (m: number, step = 5) => Math.round(m / step) * step;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Timed = { startedAt: string; endedAt: string };

/** An entry as minutes of `day`, clipped to it. */
export function spanOn(entry: Timed, day: string): Span {
    const s = dayKey(entry.startedAt) === day ? minutesOfDay(entry.startedAt) : 0;
    const e = dayKey(entry.endedAt) === day ? minutesOfDay(entry.endedAt) : DAY;
    return { s, e: e || DAY };
}

/** It starts and ends on `day` (or ends at the midnight after it), so it can be dragged. */
export function wholeOn(entry: Timed, day: string): boolean {
    return (dayKey(entry.startedAt) === day && dayKey(entry.endedAt) === day) || minutesOfDay(entry.endedAt) === 0;
}

/** The UTC instant of minute `m` of `day`, as the API wants it. */
export const isoAt = (day: string, m: number) => companyTimeToUtc(day, m).toISOString();

/** Moves as the API's list. */
export function movesFor(day: string, moves: Moves): EntryMove[] {
    return Object.entries(moves).map(([id, sp]) => ({ id: +id, startedAt: isoAt(day, sp.s), endedAt: isoAt(day, sp.e) }));
}

/** The visible part of a day: the base hours, stretched to whatever was logged. */
export function rangeFor(spans: Span[], base: [number, number]): [number, number] {
    let [lo, hi] = base;
    for (const sp of spans) {
        lo = Math.min(lo, Math.floor(sp.s / 60) * 60);
        hi = Math.max(hi, Math.ceil(sp.e / 60) * 60);
    }
    return [lo, hi];
}

export type ScheduleDay = Schemas["MyScheduleDayResponse"];

/** The working hours a schedule sets on a day; null on a day off. */
export function workHoursOf(day: ScheduleDay | null | undefined): Span | null {
    return day && day.isWorkingDay && day.startMinute != null && day.endMinute != null ? { s: day.startMinute, e: day.endMinute } : null;
}

const clock = (m: number) => (m % 60 === 0 ? fmtHourLabel(m) : fmtMinutes(m));

/** "9 AM – 5 PM", or "a day off". */
export const hoursText = (wh: Span | null) => (wh ? `${clock(wh.s)} – ${clock(wh.e)}` : "a day off");

/** "1h break", when the day is long enough to have one. */
export const breakText = (day: ScheduleDay | null | undefined) => (day?.paidBreakMinutes ? `${fmtH(day.paidBreakMinutes)} break` : "");

/** "9 AM – 5 PM, 7h with a 1h break". */
export function dayText(day: ScheduleDay | null | undefined): string {
    const wh = workHoursOf(day);
    if (!wh || !day) return "a day off";
    const b = breakText(day);
    return hoursText(wh) + (b ? `, ${fmtH(day.requiredMinutes)} with a ${b}` : "");
}

/** "Now" in company time: today's key and the minute of the day. */
export function companyNow(): { today: string; minute: number } {
    const now = new Date();
    return { today: companyToday(now), minute: minutesOfDay(now) };
}

/**
 * Where a new log starts when nothing says otherwise: right after the day's last entry (the start of the
 * working day on an empty day), an hour long, or up to now.
 */
export function defaultSlot(spans: Span[], dayStart: number, isToday: boolean, nowMin: number): { s: number; d: number } {
    const last = spans.length ? Math.max(...spans.map((sp) => sp.e)) : dayStart;
    const start = Math.max(last, 0);
    const room = isToday ? nowMin - start : 60;
    // rounded down, so a log that runs up to now never ends in the future
    return { s: start, d: room >= 5 ? Math.min(60, Math.floor(room / 5) * 5) : 60 };
}

export type DayEntryLike = Timed & { id: number; project: { title: string } };

type LogCheck = {
    projectId: number | null | undefined;
    day: string;
    startMin: number;
    duration: number;
    /** The day's other entries, with any moves already applied. */
    others: DayEntryLike[];
    moves: Moves;
    ignoreId?: number | null;
    allowFuture: boolean;
    allowOverlap: boolean;
};

/** What stops a log from being saved, said the prototype's way (the API checks it all again). */
export function checkLog(o: LogCheck): string | null {
    const start = companyTimeToUtc(o.day, o.startMin);
    const end = new Date(+start + o.duration * 60_000);
    if (!o.projectId) return "Pick a project.";
    if (o.duration < MIN_ENTRY) return `An entry needs to be at least ${MIN_ENTRY} minutes.`;
    if (end > new Date() && !o.allowFuture) return `That ends in the future - work can only be logged up to ${fmtTime(new Date())} today.`;
    if (o.allowOverlap) return null;
    const clash = o.others
        .filter((e) => e.id !== o.ignoreId)
        .map((e) => (o.moves[e.id] ? { ...e, startedAt: isoAt(o.day, o.moves[e.id].s), endedAt: isoAt(o.day, o.moves[e.id].e) } : e))
        .find((e) => new Date(e.startedAt) < end && new Date(e.endedAt) > start);
    return clash ? `This overlaps with your entry ${fmtRange(clash.startedAt, clash.endedAt)} (${clash.project.title}).` : null;
}

/** An entry as the day track draws it. */
export function trackEntry(e: WorkEntry, day: string): TrackEntry {
    const sp = spanOn(e, day);
    return {
        id: e.id, s: sp.s, e: sp.e, description: e.description, projectTitle: e.project.title,
        range: fmtRange(e.startedAt, e.endedAt), overtime: e.overtimeMinutes, locked: !e.canEdit,
    };
}

/**
 * How to put back the entries a new log moved (its Undo): one save of the first of them, at the time it had,
 * carrying the others back as its moves. Null when nothing moved.
 */
export function restoreOf(list: WorkEntry[], day: string, moved: Moves): { id: number; body: SaveEntryBody } | null {
    const back: Moves = {};
    for (const id of Object.keys(moved)) {
        const e = list.find((x) => x.id === +id);
        if (e) back[+id] = spanOn(e, day);
    }
    const ids = Object.keys(back).map(Number);
    const first = list.find((x) => x.id === ids[0]);
    if (!first) return null;
    const rest = { ...back };
    delete rest[first.id];
    return {
        id: first.id,
        body: { ...entryBody(first, { startedAt: isoAt(day, back[first.id].s), endedAt: isoAt(day, back[first.id].e) }), moves: movesFor(day, rest) },
    };
}
