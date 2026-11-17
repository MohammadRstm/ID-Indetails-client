import { useState } from "react";
import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Delta } from "@/shared/components/Charts/Bars";
import DayRuler from "@/shared/components/Charts/DayRuler";
import { CalendarHeat } from "@/shared/components/Charts/Heat";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import { tip } from "@/shared/components/Overlays/tip";
import useDebounce from "@/shared/hooks/useDebounce";
import { quarterLabel, quarterOf, quarterStart } from "@/shared/format/periods";
import { addDays, DAYS, dayKey, fmtDate, fmtDateY, fmtDayDateY, fmtDur, fmtDurShort, fmtH, fmtNumber, fmtRange, fmtTime, formatSettings, minutesOfDay, monthKey, partsOf, relDay, startOfWeek } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { companyNow } from "./day";
import EntryActions from "./EntryActions";
import { useDeleteWithUndo } from "./useDeleteWithUndo";
import EntryRow from "./EntryRow";
import { openLogWork } from "./logWorkStore";
import { useMyEntries, useMyProjects, useMyWorkSummary, type WorkEntry } from "./workApi";
import { loadFailed } from "@/api/queryState";

type Period = "week" | "month" | "quarter" | "all";

/** Everything a Design employee has logged, and how it adds up (the prototype's DesignMyWork). */
export default function MyWorkPage() {
    const permissions = usePermissions();
    const [params] = useSearchParams();
    const { today } = companyNow();
    const q = quarterOf(today);
    const [projectId, setProjectId] = useState(params.get("project") ?? "all");
    const [period, setPeriod] = useState<Period>("quarter");
    const [search, setSearch] = useState("");
    const [view, setView] = useState<"list" | "week">("list");
    const [weekAnchor, setWeekAnchor] = useState(startOfWeek(today));
    const text = useDebounce({ value: search.trim(), debounceTimeMs: 250 });
    const canLog = permissions.has(P.WORK_ENTRY_CREATE);
    const del = useDeleteWithUndo();

    const ranges: Record<Period, { label: string; from?: string }> = {
        week: { label: "This week", from: startOfWeek(today) },
        month: { label: "This month", from: `${monthKey(today)}-01` },
        quarter: { label: quarterLabel(q.year, q.quarter), from: quarterStart(q.year, q.quarter) },
        all: { label: "All time" },
    };
    const range = ranges[period];
    const filter = { from: range.from, to: today, projectId: projectId === "all" ? undefined : +projectId, search: text || undefined };
    // the totals are all-time
    const all = useMyWorkSummary();
    const entries = useMyEntries({ ...filter, page: 1, pageSize: 100 });
    const active = useMyProjects().data?.filter((p) => p.status === "active").length;
    const s = all.data;

    const groups = groupByDay(entries.data?.items ?? []);
    const daily = new Map((s?.daily ?? []).map((d) => [d.day, d]));
    const since = addDays(today, -180);
    const activeDays = (s?.daily ?? []).filter((d) => d.day > since && d.minutes > 0).length;

    return (
        <div className="page">
            <PageHead title="My work" sub="Everything you have logged, and how it adds up."
                actions={canLog && <button className="btn btn-primary" onClick={() => openLogWork()}><Icon name="plus" />Log work</button>} />

            {loadFailed(all) ? <div className="panel"><div className="panel-body"><LoadError error={all.error} retry={() => all.refetch()} what="your totals" /></div></div> : (
                <KpiStrip loading={!s} items={[
                    { key: "week", label: "This week", value: fmtH(s?.thisWeekMinutes ?? 0), sub: <span>{fmtDate(startOfWeek(today))} – {fmtDate(today)}</span> },
                    { key: "month", label: "This month", value: fmtH(s?.thisMonthMinutes ?? 0) },
                    {
                        key: "quarter", label: ranges.quarter.label, value: fmtH(s?.thisQuarterMinutes ?? 0),
                        delta: s && <Delta value={s.thisQuarterMinutes} prev={s.lastQuarterSameSpanMinutes} label="vs last quarter" />,
                    },
                    {
                        key: "overtime", label: "Overtime", value: <span className={s?.totalOvertimeMinutes ? "ot-text" : undefined}>{fmtH(s?.totalOvertimeMinutes ?? 0)}</span>,
                        sub: <span>all time</span>,
                    },
                    { key: "entries", label: "Work entries", value: fmtNumber(s?.entryCount ?? 0), sub: <span>avg {s?.entryCount ? fmtDur(s.totalMinutes / s.entryCount) : "-"}</span> },
                    { key: "projects", label: "Projects", value: s?.projectCount ?? 0, sub: <span>{active ?? 0} active right now</span> },
                ]} />
            )}

            <div className="panel mt">
                <div className="panel-head">
                    <div><div className="panel-title">Your activity</div><div className="panel-sub">Every day you logged work over the last six months{canLog ? ". Click a day to see or add its logs" : ""}.</div></div>
                </div>
                <div className="panel-body">
                    {/* larger days, centered in the panel, each opening Log work on its day; on a narrow screen it scrolls sideways */}
                    {!s ? <SkeletonLines lines={4} /> : (
                        <div style={{ width: "max-content", maxWidth: "100%", margin: "0 auto" }}>
                            <CalendarHeat weeks={27} cell={24} value={(k) => daily.get(k)?.minutes ?? 0} color={(k) => daily.get(k)?.tint}
                                note={`${activeDays} active days in the last six months`}
                                onClick={canLog ? (day) => openLogWork({ date: day, fixedDay: true }) : undefined} />
                        </div>
                    )}
                </div>
            </div>

            <div className="filters mt">
                <Segmented value={period} onChange={setPeriod} aria-label="Period"
                    options={(Object.keys(ranges) as Period[]).map((k) => ({ value: k, label: ranges[k].label }))} />
                <Select className="select sm" style={{ width: 195 }} aria-label="Project" value={projectId} onChange={setProjectId} options={[
                    { value: "all", label: "All projects" },
                    ...(s?.byProject ?? []).map((p) => ({ value: String(p.projectId), label: p.title })),
                ]} />
                <SearchInput width={210} value={search} onChange={setSearch} placeholder="Search your work" />
                <div className="grow" />
                <Segmented value={view} onChange={setView} aria-label="View" options={[{ value: "list", label: "List" }, { value: "week", label: "Week" }]} />
            </div>

            {view === "list" ? (
                <div className="panel">
                    <div className="panel-body" style={{ paddingTop: 4 }}>
                        {loadFailed(entries) ? <LoadError error={entries.error} retry={() => entries.refetch()} what="your entries" />
                            : !entries.data ? <SkeletonLines lines={6} />
                                : groups.slice(0, 20).map((g) => (
                                    <div key={g.key} className="day-group">
                                        <div className="day-head">
                                            <h4>{relDay(g.key)}</h4>
                                            <span className="muted" style={{ fontSize: "11.5px" }}>{fmtDayDateY(g.key)}</span>
                                            <span className="day-total mono">{fmtDur(g.minutes)}</span>
                                        </div>
                                        <DayRuler blocks={g.items.map((e) => ({ start: e.startedAt, end: e.endedAt, color: e.project.tint ?? undefined }))} scale={false} />
                                        <div style={{ marginTop: 6 }}>
                                            {g.items.map((e) => <EntryRow key={e.id} entry={e} canAttach right={canLog ? <EntryActions entry={e} onDelete={del} /> : null} />)}
                                        </div>
                                    </div>
                                ))}
                        {entries.data && groups.length === 0 && (
                            <Empty art="time" title="Nothing logged in this range" text="Change the filters above, or log the work you did."
                                action={canLog && <button className="btn btn-primary" onClick={() => openLogWork()}>Log work</button>} />
                        )}
                    </div>
                    {groups.length > 20 && (
                        <div className="panel-foot"><span className="muted">Showing the 20 most recent days · {entries.data?.totalCount} entries in range</span></div>
                    )}
                </div>
            ) : <WeekCalendar anchor={weekAnchor} setAnchor={setWeekAnchor} today={today} />}
        </div>
    );
}

type DayGroup = { key: string; items: WorkEntry[]; minutes: number };

/** Entries (newest first) grouped by the day they started. */
function groupByDay(entries: WorkEntry[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const e of entries) {
        const k = dayKey(e.startedAt);
        let g = groups[groups.length - 1];
        if (!g || g.key !== k) groups.push((g = { key: k, items: [], minutes: 0 }));
        g.items.push(e);
        g.minutes += e.minutes;
    }
    return groups;
}

const DAY_START = 7, DAY_END = 21, ROW = 34;

/** One person's week, blocks where the work happened (the prototype's WeekCalendar). */
function WeekCalendar({ anchor, setAnchor, today }: { anchor: string; setAnchor: (k: string) => void; today: string }) {
    const ws = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    const list = useMyEntries({ from: ws, to: addDays(ws, 6), page: 1, pageSize: 100 });
    const entries = list.data?.items ?? [];
    const total = entries.reduce((sum, e) => sum + e.minutes, 0);
    const height = (DAY_END - DAY_START) * ROW;
    const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
    const { minute: nowMin } = companyNow();
    const use24 = formatSettings().use24HourTime;

    return (
        <div className="panel">
            <div className="panel-head">
                <div><div className="panel-title">Week of {fmtDateY(ws)}</div>
                    <div className="panel-sub">{fmtDur(total)} logged · blocks sit where the work actually happened.</div></div>
                <div className="panel-tools">
                    <button className="icon-btn" onClick={() => setAnchor(addDays(ws, -7))} aria-label="Previous week"><Icon name="chevronLeft" /></button>
                    <button className="btn btn-sm" onClick={() => setAnchor(startOfWeek(today))}>This week</button>
                    <button className="icon-btn" onClick={() => setAnchor(addDays(ws, 7))} aria-label="Next week"><Icon name="chevronRight" /></button>
                </div>
            </div>
            <div className="panel-body" style={{ overflowX: "auto" }}>
                {loadFailed(list) ? <LoadError error={list.error} retry={() => list.refetch()} what="the week" /> : (
                    <div style={{ minWidth: 660 }}>
                        <div style={{ display: "flex", marginLeft: 46 }}>
                            {days.map((d) => {
                                const mins = entries.filter((e) => dayKey(e.startedAt) === d).reduce((sum, e) => sum + e.minutes, 0);
                                const p = partsOf(d);
                                return (
                                    <div key={d} className="grow" style={{ padding: "0 4px 6px", textAlign: "center" }}>
                                        <div style={{ fontSize: 11, color: d === today ? "var(--now)" : "var(--ink-3)", fontWeight: d === today ? 700 : 500 }}>{DAYS[p.weekday]} {p.day}</div>
                                        <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>{mins ? fmtDurShort(mins) : "-"}</div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: "flex", position: "relative" }}>
                            <div style={{ width: 46, flex: "none", position: "relative", height }}>
                                {hours.map((h, i) => (
                                    <div key={h} className="mono" style={{ position: "absolute", top: i * ROW - 6, right: 8, fontSize: "9.5px", color: "var(--ink-3)" }}>
                                        {use24 ? `${String(h).padStart(2, "0")}:00` : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`}
                                    </div>
                                ))}
                            </div>
                            <div className="grow" style={{ position: "relative", height, borderTop: "1px solid var(--line)" }}>
                                {hours.map((h, i) => <div key={h} style={{ position: "absolute", top: i * ROW, left: 0, right: 0, height: 1, background: "var(--grid)" }} />)}
                                <div style={{ display: "flex", height: "100%" }}>
                                    {days.map((d, di) => {
                                        const weekday = partsOf(d).weekday;
                                        return (
                                            <div key={d} className="grow" style={{ position: "relative", borderLeft: di ? "1px solid var(--line)" : 0, background: weekday === 0 || weekday === 6 ? "var(--surface-2)" : "transparent" }}>
                                                {entries.filter((e) => dayKey(e.startedAt) === d).map((e) => {
                                                    const tint = e.project.tint ?? "var(--accent)";
                                                    const top = (minutesOfDay(e.startedAt) / 60 - DAY_START) * ROW;
                                                    return (
                                                        <div key={e.id} style={{
                                                            position: "absolute", top: Math.max(0, top), left: 3, right: 3, height: Math.max(16, (e.minutes / 60) * ROW),
                                                            background: `color-mix(in srgb, ${tint} 13%, transparent)`, borderLeft: `2.5px solid ${tint}`, borderRadius: 4, padding: "3px 5px", overflow: "hidden", cursor: "default",
                                                        }}
                                                            onMouseMove={(ev) => tip.show(ev, [{ big: e.project.title }, { k: "Time", v: fmtRange(e.startedAt, e.endedAt) }, { k: "Duration", v: fmtDur(e.minutes) }, e.description])}
                                                            onMouseLeave={tip.hide}>
                                                            <div className="mono" style={{ fontSize: "9.5px", color: "var(--ink-2)" }}>{fmtTime(e.startedAt)} · {fmtDurShort(e.minutes)}</div>
                                                            <div style={{ fontSize: "10.5px", lineHeight: 1.25, color: "var(--ink)" }} className="clamp2">{e.description}</div>
                                                        </div>
                                                    );
                                                })}
                                                {d === today && (
                                                    <div style={{ position: "absolute", left: 0, right: 0, height: "1.5px", background: "var(--now)", top: (nowMin / 60 - DAY_START) * ROW }} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
