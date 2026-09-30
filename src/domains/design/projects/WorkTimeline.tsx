import { useRef, useState } from "react";
import DayRuler from "@/shared/components/Charts/DayRuler";
import { heatLevel, useWidth } from "@/shared/components/Charts/core";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import { tip, type TipLine } from "@/shared/components/Overlays/tip";
import { quarterLabel, quarterOf, quarterStart, quarterEnd } from "@/shared/format/periods";
import { addDays, addMonths, DAYS, dayKey, daysBetween, fmtDate, fmtDateY, fmtDayDate, fmtDur, fmtDurShort, fmtH, fmtMonthY, fmtTime, MONTHS, monthKey, partsOf, startOfWeek } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { companyNow } from "../work/day";
import { useProjectTimeline, useTimelineEntries, type TimelineEntry } from "./projectWorkApi";
import { clickable } from "@/shared/utils/clickable";

type Scale = "project" | "quarter" | "month" | "week";

const DAY_SCALE: [number, number, number, number] = [1.5, 3.5, 6, 8];   // hours per person per day → heat level
const WEEK_SCALE: [number, number, number, number] = [4, 12, 22, 32];   // hours per person per week
const QUIET_DAYS = 4;                                                          // days without work that make a quiet stretch

type Unit = { start: string; days: string[]; weekend: boolean };

function rangeFor(scale: Scale, anchor: string, start: string, end: string): { from: string; to: string } {
    if (scale === "project") return { from: start, to: end };
    if (scale === "quarter") {
        const q = quarterOf(anchor);
        return { from: quarterStart(q.year, q.quarter), to: quarterEnd(q.year, q.quarter) };
    }
    if (scale === "month") return { from: `${monthKey(anchor)}-01`, to: addDays(`${addMonths(monthKey(anchor), 1)}-01`, -1) };
    const ws = startOfWeek(anchor);
    return { from: ws, to: addDays(ws, 6) };
}

function rangeLabel(scale: Scale, anchor: string, start: string, completed: string | null): string {
    if (scale === "project") return `${fmtDate(start)} → ${completed ? fmtDateY(completed) : "today"}`;
    if (scale === "quarter") { const q = quarterOf(anchor); return quarterLabel(q.year, q.quarter); }
    if (scale === "month") return fmtMonthY(anchor);
    const ws = startOfWeek(anchor), we = addDays(ws, 6);
    return `${fmtDate(ws)} – ${fmtDate(we)}, ${partsOf(we).year}`;
}

function shift(scale: Scale, anchor: string, dir: number): string {
    if (scale === "quarter") return `${addMonths(monthKey(anchor), 3 * dir)}-01`;
    if (scale === "month") return `${addMonths(monthKey(anchor), dir)}-01`;
    return addDays(anchor, 7 * dir);
}

/** Runs of worked units on a row; in days, two quiet days still count as one run. */
function streaksFor(cells: number[], dayBuckets: boolean): { a: number; b: number }[] {
    const out: { a: number; b: number }[] = [];
    const gapAllow = dayBuckets ? 2 : 0;
    let cur: { a: number; b: number } | null = null;
    cells.forEach((m, i) => {
        if (m <= 0) return;
        if (cur && i - cur.b <= gapAllow + 1) cur.b = i;
        else {
            if (cur) out.push(cur);
            cur = { a: i, b: i };
        }
    });
    if (cur) out.push(cur);
    return out;
}

type WorkTimelineProps = { project: Project; onPerson: (id: number) => void; onEntry: (id: number) => void };

/**
 * Who worked on the project, when and for how long, zooming from the whole project to a week (the
 * prototype's HL.Timeline). A week shows the entries themselves.
 */
export default function WorkTimeline({ project, onPerson, onEntry }: WorkTimelineProps) {
    const { today } = companyNow();
    const completed = project.completedAt ? dayKey(project.completedAt) : null;
    const end = completed ?? today;
    const [scale, setScale] = useState<Scale>("quarter");
    const [anchor, setAnchor] = useState(today);
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const width = useWidth(trackRef, 760);
    const timeline = useProjectTimeline(project.id);

    const { from, to } = rangeFor(scale, anchor, project.startDate, end);
    const entries = useTimelineEntries(project.id, from, to);
    const nDays = Math.max(1, daysBetween(from, to) + 1);
    const pxPerDay = width / nDays;
    const dayBuckets = scale === "week" || pxPerDay >= 5;

    const units: Unit[] = [];
    if (dayBuckets) {
        for (let k = from; k <= to; k = addDays(k, 1)) {
            const w = partsOf(k).weekday;
            units.push({ start: k, days: [k], weekend: w === 0 || w === 6 });
        }
    } else {
        for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) units.push({ start: w, days: Array.from({ length: 7 }, (_, i) => addDays(w, i)), weekend: false });
    }
    const unitW = 100 / Math.max(1, units.length);

    // minutes by day, and by person and day, from the project's history
    const dayMinutes = new Map<string, number>();
    const personDay = new Map<string, number>();
    const people = new Map<number, { id: number; name: string; total: number }>();
    for (const d of timeline.data?.days ?? []) {
        dayMinutes.set(d.day, d.minutes);
        for (const p of d.people) {
            personDay.set(`${p.userId}|${d.day}`, p.minutes);
            const x = people.get(p.userId) ?? { id: p.userId, name: p.name, total: 0 };
            x.total += p.minutes;
            people.set(p.userId, x);
        }
    }
    const rows = [...people.values()].map((p) => {
        const cells = units.map((u) => u.days.reduce((sum, k) => sum + (personDay.get(`${p.id}|${k}`) ?? 0), 0));
        return { ...p, cells, minutes: cells.reduce((a, b) => a + b, 0) };
    }).sort((a, b) => b.minutes - a.minutes || b.total - a.total);
    const q = search.trim().toLowerCase();
    const visible = rows.filter((x) => (!q || x.name.toLowerCase().includes(q)) && (showAll || x.minutes > 0 || q));
    const hiddenCount = rows.length - visible.length;

    const pulse = units.map((u) => u.days.reduce((sum, k) => sum + (dayMinutes.get(k) ?? 0), 0));
    const pulseMax = Math.max(1, ...pulse);
    const quiet: { a: number; b: number }[] = [];
    if (dayBuckets) {
        let run: { a: number; b: number } | null = null;
        units.forEach((u, i) => {
            const inside = u.start >= project.startDate && u.start <= end;
            if (inside && pulse[i] === 0) {
                if (!run) run = { a: i, b: i };
                else run.b = i;
            } else {
                if (run && run.b - run.a + 1 >= QUIET_DAYS) quiet.push(run);
                run = null;
            }
        });
        if (run && (run as { a: number; b: number }).b - (run as { a: number; b: number }).a + 1 >= QUIET_DAYS) quiet.push(run);
    }

    // the entries behind each person's day, longest first
    const byPersonDay = new Map<string, TimelineEntry[]>();
    for (const e of entries.data ?? []) {
        const k = `${e.userId}|${dayKey(e.startedAt)}`;
        byPersonDay.set(k, [...(byPersonDay.get(k) ?? []), e]);
    }
    const entriesOf = (userId: number, u: Unit) => u.days.flatMap((k) => byPersonDay.get(`${userId}|${k}`) ?? []);

    const markerLeft = (k: string) => Math.min(100, Math.max(0, (daysBetween(from, k) / nDays) * 100));
    const target = project.targetDate;
    const showStart = project.startDate >= from && project.startDate <= to;
    const showTarget = !!target && target >= from && target <= to;
    const showEnd = !!completed && completed >= from && completed <= to;
    const showNow = today >= from && today <= to;
    const legendScale = dayBuckets ? DAY_SCALE : WEEK_SCALE;

    function pickScale(s: Scale) {
        setScale(s);
        if (s === "project") return;
        let a = anchor;
        if (a > today) a = today;
        if (completed && a > completed) a = completed;
        if (a < project.startDate) a = project.startDate;
        setAnchor(a);
    }
    const zoomToDay = (k: string) => { setScale("week"); setAnchor(k); };

    return (
        <div className="panel tl">
            <div className="panel-head">
                <div className="grow" style={{ minWidth: 200 }}>
                    <div className="panel-title">Work timeline</div>
                    <div className="panel-sub">Who worked on this project, when, and for how long. {dayBuckets ? "One column per day" : "One column per week"} · click any block to open that week.</div>
                </div>
                <div className="panel-tools tl-toolbar">
                    <SearchInput width={150} value={search} onChange={setSearch} placeholder="Find person" />
                    <Segmented value={scale} onChange={pickScale} aria-label="Scale"
                        options={[{ value: "project", label: "All" }, { value: "quarter", label: "Quarter" }, { value: "month", label: "Month" }, { value: "week", label: "Week" }]} />
                    <div className="tl-nav">
                        <button className="icon-btn" disabled={scale === "project"} onClick={() => setAnchor(shift(scale, anchor, -1))} aria-label="Previous"><Icon name="chevronLeft" /></button>
                        <span className="tl-range">{rangeLabel(scale, anchor, project.startDate, completed)}</span>
                        <button className="icon-btn" disabled={scale === "project"} onClick={() => setAnchor(shift(scale, anchor, 1))} aria-label="Next"><Icon name="chevronRight" /></button>
                    </div>
                    <button className="btn btn-sm" onClick={() => setAnchor(today)} disabled={scale === "project"}>Today</button>
                </div>
            </div>

            <div className="tl-scroll">
                <div className="tl-inner">
                    <div className="tl-head-row">
                        <div className="tl-name-col">
                            <div className="u" style={{ paddingBottom: 4 }}>Hours / day</div>
                            <div className="mono" style={{ fontSize: "10.5px", color: "var(--ink-3)" }}>peak {fmtH(pulseMax)}</div>
                        </div>
                        <div className="tl-track" ref={trackRef}>
                            <div className="tl-pulse" style={{ height: 42, position: "relative" }}>
                                {units.map((u, i) => {
                                    const h = pulse[i] > 0 ? Math.max(2, (pulse[i] / pulseMax) * 36) : 0;
                                    return (
                                        <div key={u.start} style={{ position: "absolute", left: `${i * unitW}%`, width: `${unitW}%`, bottom: 0, height: 42, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
                                            onMouseMove={(e) => tip.show(e, [{ big: dayBuckets ? fmtDayDate(u.start) : `Week of ${fmtDate(u.start)}` }, { k: "Team total", v: pulse[i] ? fmtH(pulse[i]) : "no work" }])}
                                            onMouseLeave={tip.hide}>
                                            {h > 0 && <div style={{ width: "calc(100% - 2px)", maxWidth: 16, height: h, background: "var(--chart)", borderRadius: "2px 2px 0 0", opacity: 0.85 }} />}
                                        </div>
                                    );
                                })}
                                {showNow && <div className="tl-now" style={{ left: `${markerLeft(today)}%` }} />}
                            </div>
                            <div className="tl-ticks">
                                {scale === "week"
                                    ? units.map((u, i) => <div key={u.start} className="tl-tick" style={{ left: `${i * unitW + unitW / 2}%` }}>{`${DAYS[partsOf(u.start).weekday]} ${partsOf(u.start).day}`}</div>)
                                    : units.map((u, i) => {
                                        const p = partsOf(u.start);
                                        const monthStart = p.day <= (dayBuckets ? 1 : 7);
                                        if (i !== 0 && !monthStart) return null;
                                        const label = i === 0 && !monthStart ? `${MONTHS[p.month]} ${p.day}` : MONTHS[p.month];
                                        return <div key={u.start} className={cx("tl-tick", i === 0 && "start")} style={{ left: `${i * unitW + (i === 0 ? 0 : unitW / 2)}%` }}>{label}</div>;
                                    })}
                                {showStart && <div className="tl-flag plain" style={{ left: `${markerLeft(project.startDate)}%` }}>Start</div>}
                                {showEnd && <div className="tl-flag plain" style={{ left: `${markerLeft(completed!)}%` }}>Done</div>}
                                {showTarget && <div className="tl-flag plain" style={{ left: `${markerLeft(target!)}%` }}>Target</div>}
                                {showNow && <div className="tl-flag now" style={{ left: `calc(${markerLeft(today)}% + 3px)` }}>Now</div>}
                            </div>
                        </div>
                    </div>

                    <div className="tl-rows">
                        {timeline.isError ? <div style={{ padding: 16 }}><LoadError error={timeline.error} retry={() => timeline.refetch()} what="the timeline" /></div>
                            : !timeline.data ? <div style={{ padding: 16 }}><SkeletonLines lines={4} /></div>
                                : visible.length === 0 && (
                                    <div className="empty" style={{ padding: 26 }}>
                                        <h4>No work logged in this range</h4>
                                        <p>Try a wider time scale, or move to another {scale === "week" ? "week" : scale}.</p>
                                    </div>
                                )}
                        {visible.map((row) => (
                            <div key={row.id} className={cx("tl-row", row.minutes === 0 && "dim")}>
                                <div className="tl-name" {...clickable(() => onPerson(row.id), "button")} title={`Open ${row.name}'s contribution`}>
                                    <PersonAvatar person={{ id: row.id, name: row.name }} size={22} />
                                    <div style={{ minWidth: 0 }}>
                                        <div className="tl-name-txt trunc"><PersonName person={{ id: row.id, name: row.name }} /></div>
                                        <div className="tl-name-sub mono">{row.minutes ? fmtH(row.minutes) : "-"}</div>
                                    </div>
                                </div>
                                <div className="tl-lane">
                                    {scale === "week" ? (
                                        <div className="tl-week">
                                            {units.map((u) => {
                                                const list = entriesOf(row.id, u);
                                                const total = list.reduce((sum, e) => sum + e.minutes, 0);
                                                return (
                                                    <div key={u.start} className={cx("tl-wcell", u.weekend && "we")}>
                                                        {list.length > 0 && <DayRuler blocks={list.map((e) => ({ start: e.startedAt, end: e.endedAt }))} scale={false} />}
                                                        {list.map((e) => (
                                                            <div key={e.id} className="tl-chip" {...clickable(() => onEntry(e.id), "button")}>
                                                                <div className="tl-chip-time mono">{fmtTime(e.startedAt)} · {fmtDurShort(e.minutes)}</div>
                                                                <div className="tl-chip-desc clamp2">{e.description}</div>
                                                            </div>
                                                        ))}
                                                        {list.length === 0 && <div className="muted" style={{ fontSize: "10.5px" }}>-</div>}
                                                        {total > 0 && <div className="mono muted" style={{ fontSize: 10, marginTop: "auto" }}>{fmtDurShort(total)}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="tl-layer">
                                                {units.map((u, i) => (u.weekend && pxPerDay >= 4 ? <div key={u.start} className="tl-weekend" style={{ left: `${i * unitW}%`, width: `${unitW}%` }} /> : null))}
                                                {quiet.map((s) => <div key={`q${s.a}`} className="tl-quiet" style={{ left: `${s.a * unitW}%`, width: `${(s.b - s.a + 1) * unitW}%` }} />)}
                                                {showNow && <div className="tl-now" style={{ left: `${markerLeft(today)}%` }} />}
                                            </div>
                                            {streaksFor(row.cells, dayBuckets).map((s) => {
                                                const count = s.b - s.a + 1, wPct = count * unitW, pxW = (wPct / 100) * width, segPx = pxW / count;
                                                let best = -1;
                                                for (let i = s.a; i <= s.b; i++) if (row.cells[i] > 0 && (best < 0 || row.cells[i] > row.cells[best])) best = i;
                                                const label = best >= 0 && pxW >= 66 ? [...entriesOf(row.id, units[best])].sort((a, b) => b.minutes - a.minutes)[0]?.description : undefined;
                                                return (
                                                    <div key={s.a}>
                                                        <div className="tl-streak" style={{ left: `${s.a * unitW}%`, width: `${wPct}%` }}>
                                                            {Array.from({ length: count }, (_, j) => s.a + j).map((i) => {
                                                                const mins = row.cells[i];
                                                                const lvl = mins ? heatLevel(mins, legendScale) : 0;
                                                                const u = units[i];
                                                                return (
                                                                    <div key={i} className={cx("tl-seg", `lv${lvl}`, !mins && "h0")} onClick={() => zoomToDay(u.start)}
                                                                        onMouseMove={(e) => {
                                                                            const list = entriesOf(row.id, u);
                                                                            const lines: TipLine[] = [{ big: `${row.name} · ${dayBuckets ? fmtDayDate(u.start) : `week of ${fmtDate(u.start)}`}` }, { k: "Logged", v: mins ? fmtDur(mins) : "no work" }];
                                                                            list.slice(0, 2).forEach((en) => lines.push(`· ${en.description}`));
                                                                            if (list.length > 2) lines.push(`+${list.length - 2} more entries`);
                                                                            tip.show(e, lines);
                                                                        }}
                                                                        onMouseLeave={tip.hide}>
                                                                        {segPx >= 30 && mins > 0 && <div className="tl-seg-val" style={{ color: `var(--on-lv${lvl})` }}>{(mins / 60).toFixed(mins % 60 ? 1 : 0)}</div>}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {label && <div className="tl-slabel" style={{ left: `${s.a * unitW}%`, width: `${wPct}%` }}>{label}</div>}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="panel-foot" style={{ flexWrap: "wrap", gap: 14 }}>
                <div className="tl-legend">
                    <span>Hours per person per {dayBuckets ? "day" : "week"}</span>
                    <span className="row" style={{ gap: 4 }}>
                        <span className="muted">less</span>
                        {[1, 2, 3, 4].map((l) => <i key={l} className={`lv${l}`} />)}
                        <span className="muted">more</span>
                    </span>
                    <span className="row" style={{ gap: 5 }}><i style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }} /> weekend</span>
                    <span className="row" style={{ gap: 5 }}><i style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--line-2) 0 1px, transparent 1px 5px)" }} /> no activity</span>
                    <span className="row" style={{ gap: 5 }}><i style={{ background: "var(--now)", width: 2 }} /> now</span>
                </div>
                <div className="grow" />
                {hiddenCount > 0 && (
                    <button className="btn btn-sm btn-quiet" onClick={() => setShowAll(!showAll)}>
                        {showAll ? "Hide" : "Show"} {hiddenCount} contributor{hiddenCount === 1 ? "" : "s"} with no work in this range
                    </button>
                )}
            </div>
        </div>
    );
}
