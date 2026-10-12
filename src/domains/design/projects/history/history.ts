import type { Schemas } from "@/api/types";
import { addDays, addMonths, companyTimeToUtc, dayKey, daysBetween, minutesOfDay, monthKey, partsOf, startOfWeek } from "@/shared/format/time";
import { quarterEnd, quarterOf, quarterStart } from "@/shared/format/periods";

/*
 * A project's history (the prototype's 59-timeline-data.js): "what was the state of this project at
 * instant T", rebuilt from records that exist - work entries, status events and progress checkpoints.
 * Nothing here renders or writes.
 *
 * Honesty rules kept from the prototype:
 * - status comes only from recorded events (or, with none, from the project's own dates, marked inferred);
 * - progress comes only from checkpoints; between two it is estimated from the effort logged in between,
 *   and a stretch with no work holds the earlier value;
 * - annotations say what the entries show (whose work began or ended), never why.
 *
 * Instants are epoch milliseconds; days are "yyyy-MM-dd" in company time.
 */

export const GAP_DAYS = 4;
export const MINOR_IDLE_MIN = 5;
export const NEARBY_DAYS = 3;
const MIN = 60_000;

export type Entry = { id: number; userId: number; userName: string; team: string | null; description: string; start: number; end: number; minutes: number };
export type Meeting = { id: number; start: number; end: number; topic: string | null };
export type StatusKey = "active" | "hold" | "completed" | "archived";
export type ProjectEvent = { kind: string; at: number; actorName: string | null; amount: number | null };

export type DayItem = { entry: Entry; s: number; e: number; continued: boolean };
export type Day = {
    key: string;
    date: number;
    weekend: boolean;
    minutes: number;
    items: DayItem[];
    people: number[];
    span: { start: number; end: number };
    peakConcurrency: number;
    meetings: Meeting[];
    index: number;
};
export type Person = { id: number; name: string; role: string | null; minutes: number; count: number; first: Entry; last: Entry };
export type StatusSpan = { from: number; to: number | null; status: StatusKey; source: "event" | "inferred"; kind: string | null; actorName: string | null; again: boolean };
export type Checkpoint = { at: number; value: number; prev: number | null; actorName: string | null; source: "recorded" };
export type Gap = { from: number; to: number; days: number; kind: "hold" | "silent" | "trailing"; afterDay: string; beforeDay: string | null; open?: boolean };
export type Annotation = {
    id: string;
    at: number;
    kind: "status" | "progress" | "meeting" | "joined" | "last_entry" | "discipline_start" | "discipline_end" | "discipline_change" | "pause" | "peak_day" | "peak_overlap";
    source: "recorded" | "derived";
    status?: StatusKey;
    again?: boolean;
    actorName?: string | null;
    value?: number;
    prev?: number | null;
    personId?: number;
    role?: string | null;
    roleFrom?: string;
    roleTo?: string;
    endAt?: number;
    meeting?: Meeting;
    minutes?: number;
    n?: number;
    gapKind?: Gap["kind"];
    days?: number;
    dayKey?: string;
};

export type History = {
    entries: Entry[];
    days: Day[];
    dayIndex: Map<string, Day>;
    people: Map<number, Person>;
    cum: { key: string; cum: number }[];
    totalMinutes: number;
    meetings: Meeting[];
    events: ProjectEvent[];
    bounds: { first: number | null; last: number | null };
    statusTrack: StatusSpan[];
    progressTrack: Checkpoint[];
    gaps: Gap[];
    annotations: Annotation[];
    now: number;
};

/** The start of a company day, as an instant. */
export const dayStart = (key: string) => +companyTimeToUtc(key, 0);
/** The last millisecond of a company day. */
export const dayEnd = (key: string) => dayStart(addDays(key, 1)) - 1;
/** Hours after the company midnight of an instant. */
export const hoursOf = (t: number) => minutesOfDay(t) / 60;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mins = (a: number, b: number) => Math.max(0, (b - a) / MIN);
export const roundMin = (t: number) => Math.round(t / MIN) * MIN;
/** Now, to the minute, never ahead of the clock. */
export const floorMin = (t: number) => Math.floor(t / MIN) * MIN;

const STATUS_OF_KIND: Record<string, StatusKey> = {
    project_created: "active",
    project_hold: "hold",
    project_resumed: "active",
    project_reopened: "active",
    project_completed: "completed",
    project_archived: "archived",
};
export const isStatusKind = (kind: string) => kind in STATUS_OF_KIND;

/** Entries and meetings as the history reads them. */
export function toEntry(e: Schemas["TimelineEntryResponse"]): Entry {
    return { id: e.id, userId: e.userId, userName: e.userName, team: e.teamName, description: e.description, start: Date.parse(e.startedAt), end: Date.parse(e.endedAt), minutes: e.minutes };
}

type ProjectDates = { startDate: string; completedAt: string | null; heldSince: string | null; createdAt: string; status: string };

/** Builds a project's history from its entries, meetings and events. */
export function buildHistory(project: ProjectDates, entriesIn: Entry[], meetingsIn: Meeting[], eventsIn: ProjectEvent[], now: number): History {
    // a total order, so identical start times always come out the same way
    const entries = [...entriesIn].sort((a, b) => a.start - b.start || a.end - b.end || a.userId - b.userId || a.id - b.id);
    const dayIndex = new Map<string, Day>();
    const days: Day[] = [];
    const people = new Map<number, Person>();
    const newDay = (key: string, span: { start: number; end: number }): Day => {
        const w = partsOf(key).weekday;
        const d: Day = { key, date: dayStart(key), weekend: w === 0 || w === 6, minutes: 0, items: [], people: [], span, peakConcurrency: 0, meetings: [], index: 0 };
        dayIndex.set(key, d);
        days.push(d);
        return d;
    };

    for (const e of entries) {
        // an entry that crosses midnight is split at the day boundary
        for (let key = dayKey(e.start); dayStart(key) < e.end || key === dayKey(e.start); key = addDays(key, 1)) {
            const ds = dayStart(key), de = dayStart(addDays(key, 1));
            const s = Math.max(e.start, ds), en = Math.min(e.end, de);
            if (en <= s && !(e.start === e.end && key === dayKey(e.start))) break;
            const day = dayIndex.get(key) ?? newDay(key, { start: s, end: en });
            day.items.push({ entry: e, s, e: en, continued: s !== e.start });
            day.minutes += mins(s, en);
            if (!day.people.includes(e.userId)) day.people.push(e.userId);
            day.span.start = Math.min(day.span.start, s);
            day.span.end = Math.max(day.span.end, en);
            if (en >= e.end) break;
        }
        const p = people.get(e.userId) ?? { id: e.userId, name: e.userName, role: e.team, minutes: 0, count: 0, first: e, last: e };
        p.minutes += e.minutes;
        p.count++;
        if (e.start < p.first.start) p.first = e;
        if (e.start > p.last.start) p.last = e;
        people.set(e.userId, p);
    }
    // every meeting's date gets a day, so it has somewhere to show and doesn't read as a silent gap
    const meetings = [...meetingsIn].sort((a, b) => a.start - b.start);
    for (const m of meetings) {
        const key = dayKey(m.start);
        const day = dayIndex.get(key) ?? newDay(key, { start: m.start, end: m.end });
        day.meetings.push(m);
        day.span.start = Math.min(day.span.start, m.start);
        day.span.end = Math.max(day.span.end, m.end);
    }
    days.sort((a, b) => a.date - b.date);
    days.forEach((d, i) => { d.index = i; d.peakConcurrency = peakOf(d.items); });

    let run = 0;
    const cum = days.map((d) => ({ key: d.key, cum: (run += d.minutes) }));
    const events = [...eventsIn].sort((a, b) => a.at - b.at);

    const h: History = {
        entries, days, dayIndex, people, cum, totalMinutes: run, meetings, events, now,
        bounds: { first: entries.length ? entries[0].start : null, last: entries.length ? Math.max(...entries.map((e) => e.end)) : null },
        statusTrack: [], progressTrack: [], gaps: [], annotations: [],
    };
    h.statusTrack = buildStatusTrack(project, events);
    h.progressTrack = buildProgressTrack(events);
    h.gaps = buildGaps(h);
    h.annotations = buildAnnotations(h);
    return h;
}

function peakOf(items: DayItem[]): number {
    const b: [number, number][] = [];
    for (const it of items) b.push([it.s, 1], [it.e, -1]);
    b.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let cur = 0, peak = 0;
    for (const x of b) { cur += x[1]; peak = Math.max(peak, cur); }
    return peak;
}

/* ============================== status ============================== */

function buildStatusTrack(project: ProjectDates, events: ProjectEvent[]): StatusSpan[] {
    const spans: StatusSpan[] = [];
    const statusEvents = events.filter((e) => isStatusKind(e.kind));
    if (statusEvents.length) {
        for (const e of statusEvents) {
            const prev = spans[spans.length - 1];
            if (prev) prev.to = e.at;
            const status = STATUS_OF_KIND[e.kind];
            spans.push({ from: e.at, to: null, status, source: "event", kind: e.kind, actorName: e.actorName, again: status === "active" && !!prev && prev.status !== "active" });
        }
        return spans;
    }
    // no recorded transitions: reconstruct from the project's own dates, and say so
    const points: { at: number; status: StatusKey }[] = [{ at: Date.parse(project.createdAt) || dayStart(project.startDate), status: "active" }];
    if (project.heldSince && project.status === "hold") points.push({ at: Date.parse(project.heldSince), status: "hold" });
    if (project.completedAt) points.push({ at: Date.parse(project.completedAt), status: project.status === "archived" ? "archived" : "completed" });
    points.sort((a, b) => a.at - b.at).forEach((p) => {
        const prev = spans[spans.length - 1];
        if (prev) prev.to = p.at;
        spans.push({ from: p.at, to: null, status: p.status, source: "inferred", kind: null, actorName: null, again: false });
    });
    return spans;
}

export type StatusAt = { status: StatusKey | "not-created" | "unknown"; since?: number | null; until?: number | null; source: StatusSpan["source"] | null; again?: boolean; actorName?: string | null };

export function statusAt(h: History, T: number): StatusAt {
    const spans = h.statusTrack;
    if (!spans.length) return { status: "unknown", source: null };
    if (T < spans[0].from) return { status: "not-created", since: null, until: spans[0].from, source: spans[0].source };
    let s = spans[0];
    for (const x of spans) if (x.from <= T) s = x;
    return { status: s.status, since: s.from, until: s.to, source: s.source, again: s.again, actorName: s.actorName };
}

/* ============================== progress ============================== */

function buildProgressTrack(events: ProjectEvent[]): Checkpoint[] {
    let prev: number | null = null;
    return events.filter((e) => e.kind === "progress_set" && e.amount != null).map((e) => {
        const c: Checkpoint = { at: e.at, value: e.amount!, prev, actorName: e.actorName, source: "recorded" };
        prev = e.amount;
        return c;
    });
}

/** Minutes logged up to instant T, counting the elapsed part of any entry running at T - the effort axis. */
export function cumAt(h: History, T: number): number {
    const days = h.days;
    let lo = 0, hi = days.length - 1, idx = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (days[mid].date <= T) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (idx < 0) return 0;
    let total = idx > 0 ? h.cum[idx - 1].cum : 0;
    for (const it of days[idx].items) if (it.s < T) total += mins(it.s, Math.min(it.e, T));
    return total;
}

export const effortAt = (h: History, T: number) => (h.totalMinutes > 0 ? cumAt(h, T) / h.totalMinutes : 0);

export type ProgressAt = { value: number | null; basis: "none" | "unknown" | "checkpoint" | "held" | "interpolated"; from?: Checkpoint; to?: Checkpoint | null; next?: Checkpoint };

export function progressAt(h: History, T: number): ProgressAt {
    const pts = h.progressTrack;
    if (!pts.length) return { value: null, basis: "none" };
    if (T < pts[0].at) return { value: null, basis: "unknown", next: pts[0] };
    let i = 0;
    while (i + 1 < pts.length && pts[i + 1].at <= T) i++;
    const a = pts[i], b = pts[i + 1];
    if (a.at === T) return { value: a.value, basis: "checkpoint", from: a, to: b ?? null };
    if (!b) return { value: a.value, basis: "held", from: a, to: null };
    const ca = cumAt(h, a.at), cb = cumAt(h, b.at);
    // no work between the two checkpoints: the project did not move, so neither does the value
    if (cb - ca <= 0) return { value: a.value, basis: "held", from: a, to: b };
    const w = clamp((cumAt(h, T) - ca) / (cb - ca), 0, 1);
    return { value: a.value + w * (b.value - a.value), basis: "interpolated", from: a, to: b };
}

/** The estimated curve at the end of each active day, plus every checkpoint - what the rail draws. */
export function progressCurve(h: History): { at: number; value: number; checkpoint: boolean }[] {
    const pts = h.progressTrack;
    if (!pts.length) return [];
    const out: { at: number; value: number; checkpoint: boolean }[] = [];
    for (const d of h.days) {
        const t = dayEnd(d.key);
        if (t < pts[0].at) continue;
        out.push({ at: t, value: progressAt(h, t).value ?? 0, checkpoint: false });
    }
    for (const p of pts) out.push({ at: p.at, value: p.value, checkpoint: true });
    return out.sort((a, b) => a.at - b.at || (a.checkpoint ? -1 : 1));
}

/* ============================== gaps ============================== */

function buildGaps(h: History): Gap[] {
    const gaps: Gap[] = [];
    const days = h.days;
    for (let i = 1; i < days.length; i++) {
        const empty = daysBetween(days[i - 1].key, days[i].key) - 1;
        if (empty < GAP_DAYS) continue;
        const from = days[i - 1].span.end, to = days[i].span.start;
        gaps.push({ from, to, days: empty, kind: statusAt(h, (from + to) / 2).status === "hold" ? "hold" : "silent", afterDay: days[i - 1].key, beforeDay: days[i].key });
    }
    // after the last work: a pause only while the project is still open - a finished one is simply finished
    const last = days[days.length - 1];
    if (last) {
        const today = dayKey(h.now);
        const trailing = daysBetween(last.key, today) - (last.key === today ? 0 : 1);
        const stNow = statusAt(h, h.now).status;
        if ((stNow === "active" || stNow === "hold") && trailing >= GAP_DAYS) {
            const onHold = statusAt(h, (last.span.end + h.now) / 2).status === "hold";
            gaps.push({ from: last.span.end, to: h.now, days: trailing, kind: onHold ? "hold" : "trailing", afterDay: last.key, beforeDay: null, open: true });
        }
    }
    return gaps;
}

/* ============================== annotations ============================== */

function buildAnnotations(h: History): Annotation[] {
    const anns: Annotation[] = [];
    let seq = 0;
    const add = (a: Omit<Annotation, "id">) => anns.push({ ...a, id: `ann${++seq}` });

    for (const s of h.statusTrack) add({ at: s.from, kind: "status", source: s.source === "event" ? "recorded" : "derived", status: s.status, again: s.again, actorName: s.actorName });
    for (const p of h.progressTrack) add({ at: p.at, kind: "progress", source: "recorded", value: p.value, prev: p.prev, actorName: p.actorName });
    for (const m of h.meetings) add({ at: m.start, kind: "meeting", source: "recorded", meeting: m });

    const lastAt = h.bounds.last, firstAt = h.bounds.first;
    for (const p of h.people.values()) {
        add({ at: p.first.start, kind: "joined", source: "derived", personId: p.id, role: p.role });
        if (lastAt && daysBetween(dayKey(p.last.start), dayKey(lastAt)) >= 14) add({ at: p.last.end, kind: "last_entry", source: "derived", personId: p.id, role: p.role });
    }

    // disciplines (teams): when a kind of work first and last appears. Adjacent ones are paired as a
    // "change" only because they are adjacent in time - the words never claim one caused the other
    const roles = new Map<string, { role: string; first: number; last: number; paired?: boolean }>();
    for (const p of h.people.values()) {
        if (!p.role) continue;
        const r = roles.get(p.role) ?? { role: p.role, first: p.first.start, last: p.last.end };
        r.first = Math.min(r.first, p.first.start);
        r.last = Math.max(r.last, p.last.end);
        roles.set(p.role, r);
    }
    const starts = [...roles.values()].filter((r) => firstAt && daysBetween(dayKey(firstAt), dayKey(r.first)) > 3);
    const ends = [...roles.values()].filter((r) => lastAt && daysBetween(dayKey(r.last), dayKey(lastAt)) >= 14);
    for (const r of ends) {
        const pair = starts.filter((s) => s.first >= r.last && daysBetween(dayKey(r.last), dayKey(s.first)) <= 7 && !s.paired).sort((a, b) => a.first - b.first)[0];
        if (pair) {
            pair.paired = true;
            add({ at: r.last, endAt: pair.first, kind: "discipline_change", source: "derived", roleFrom: r.role, roleTo: pair.role });
        } else add({ at: r.last, kind: "discipline_end", source: "derived", role: r.role });
    }
    for (const s of starts) if (!s.paired) add({ at: s.first, kind: "discipline_start", source: "derived", role: s.role });

    for (const g of h.gaps) add({ at: g.from, endAt: g.to, kind: "pause", source: g.kind === "hold" ? "recorded" : "derived", gapKind: g.kind, days: g.days });

    if (h.days.length > 2) {
        const busiest = h.days.reduce((m, d) => (d.minutes > m.minutes ? d : m), h.days[0]);
        add({ at: busiest.span.start, kind: "peak_day", source: "derived", minutes: busiest.minutes, dayKey: busiest.key });
        const crowded = h.days.reduce((m, d) => (d.peakConcurrency > m.peakConcurrency ? d : m), h.days[0]);
        if (crowded.peakConcurrency >= 3) add({ at: crowded.span.start, kind: "peak_overlap", source: "derived", n: crowded.peakConcurrency, dayKey: crowded.key });
    }
    return anns.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
}

/* ============================== filters ============================== */

export type Filter = { person: number | null; q: string };
export function matches(e: Entry, f: Filter | null): boolean {
    if (!f) return true;
    if (f.person != null && e.userId !== f.person) return false;
    if (f.q && !e.description.toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
}

/* ============================== windows ============================== */

export type Range = "day" | "week" | "month" | "quarter" | "year";

export function windowFor(anchor: string, range: Range): { from: string; to: string } {
    if (range === "day") return { from: anchor, to: anchor };
    if (range === "month") { const m = `${monthKey(anchor)}-01`; return { from: m, to: addDays(`${addMonths(monthKey(anchor), 1)}-01`, -1) }; }
    if (range === "quarter") { const q = quarterOf(anchor); return { from: quarterStart(q.year, q.quarter), to: quarterEnd(q.year, q.quarter) }; }
    if (range === "year") { const y = partsOf(anchor).year; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
    const w = startOfWeek(anchor);
    return { from: w, to: addDays(w, 6) };
}

export function shiftWindow(anchor: string, range: Range, dir: number): string {
    if (range === "day") return addDays(anchor, dir);
    if (range === "month") return `${addMonths(monthKey(anchor), dir)}-01`;
    if (range === "quarter") { const q = quarterOf(anchor); return `${addMonths(monthKey(quarterStart(q.year, q.quarter)), 3 * dir)}-01`; }
    if (range === "year") return `${partsOf(anchor).year + dir}-01-01`;
    return addDays(anchor, 7 * dir);
}

export const daysIn = (h: History, from: string, to: string, filter: Filter | null) =>
    h.days.filter((d) => d.key >= from && d.key <= to && (!filter || (filter.person == null && !filter.q) || d.items.some((it) => matches(it.entry, filter))));

/** The nearest days with work either side of a day - where to jump when a window is empty. */
export function nearestDays(h: History, key: string): { prev: Day | null; next: Day | null } {
    let prev: Day | null = null;
    for (const d of h.days) {
        if (d.key < key) prev = d;
        else if (d.key > key) return { prev, next: d };
    }
    return { prev, next: null };
}

export function earliestOf(h: History, startDate: string): number {
    return Math.min(h.statusTrack[0]?.from ?? Infinity, h.bounds.first ?? Infinity, dayStart(startDate));
}

/* ============================== colours ============================== */

const TEAM_COLORS: Record<string, string> = { Engineering: "#3B82F6", Design: "#A855F7", Platform: "#F97316", Data: "#10B981", Marketing: "#EC4899", Operations: "#EAB308" };
const PALETTE = ["#3B82F6", "#A855F7", "#F97316", "#10B981", "#EC4899", "#EAB308", "#14B8A6", "#6366F1", "#84CC16", "#F43F5E"];

/**
 * One colour per team, the same on every day of the project: the prototype's named ones where they
 * apply, then the palette in the order of the teams' names, so two teams never share one.
 */
export function teamColors(h: History): (team: string) => string {
    const teams = [...new Set([...h.people.values()].map((p) => p.role || "Other"))].sort();
    const free = PALETTE.filter((c) => !teams.some((t) => TEAM_COLORS[t] === c));
    const map = new Map<string, string>();
    let i = 0;
    for (const t of teams) map.set(t, TEAM_COLORS[t] ?? free[i++ % free.length]);
    return (team) => map.get(team) ?? PALETTE[PALETTE.length - 1];
}
