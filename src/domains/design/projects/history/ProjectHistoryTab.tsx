import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import DateInput from "@/shared/components/Forms/DateInput";
import Select from "@/shared/components/Forms/Select";
import TimeField from "@/shared/components/Forms/TimeField";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import { Avatars } from "@/shared/components/Identity/People";
import { addDays, dayKey, daysBetween, fmtDate, fmtDateY, fmtDayDateY, fmtH, fmtMonthY, fmtNumber, minutesOfDay, partsOf, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import { companyNow } from "../../work/day";
import EntryModal from "../EntryModal";
import { useProjectTimeline, useTimelineEntries, type Timeline, type TimelineEntry } from "../projectWorkApi";
import DayStory from "./DayStory";
import {
    buildHistory, clamp, dayEnd, dayStart, daysIn, earliestOf, floorMin, hoursOf, initialMoment, middleOf, nearestDays, roundMin, shiftWindow, snapshot, statusAt, toEntry, windowFor,
    type Annotation, type Day as HistoryDay, type Gap, type History, type Meeting, type Range,
} from "./history";
import { Day, EventRow, Gap as GapRow, HistoryStatus } from "./HistoryParts";
import ProgressRail from "./ProgressRail";
import SnapshotView from "./SnapshotView";
import { fmtMoment } from "./words";
import { loadFailed } from "@/api/queryState";

/** A Design project's Timeline tab (the prototype's P.ProjectTimeline): the project at any moment of its life. */
export default function ProjectHistoryTab({ project }: { project: Project }) {
    const { today } = companyNow();
    const [now] = useState(() => Date.now());
    const created = [dayKey(project.createdAt), project.startDate].sort()[0];
    const timeline = useProjectTimeline(project.id);
    const entries = useTimelineEntries(project.id, addDays(created, -7), today);
    const error = [timeline, entries].find(loadFailed)?.error;
    const history = useMemo(
        () => (timeline.data && entries.data ? build(project, timeline.data, entries.data, now) : null),
        [project, timeline.data, entries.data, now],
    );

    if (error) return <div className="panel"><div className="panel-body"><LoadError error={error} retry={() => { timeline.refetch(); entries.refetch(); }} what="the project's history" /></div></div>;
    if (!history) {
        return (
            <div aria-busy="true">
                <SkeletonKpis count={5} />
                <div className="panel mt"><div className="panel-body"><SkeletonLines lines={6} /></div></div>
            </div>
        );
    }
    return <HistoryView project={project} history={history} />;
}

function build(project: Project, t: Timeline, entries: TimelineEntry[], now: number): History {
    const meetings = new Map<number, Meeting>();
    for (const d of t.days) for (const m of d.meetings) meetings.set(m.id, { id: m.id, start: Date.parse(m.startsAt), end: Date.parse(m.endsAt), topic: m.topic });
    const events = t.events.map((e) => ({ kind: e.kind, at: Date.parse(e.occurredAt), actorName: e.actorName, amount: e.amount }));
    return buildHistory(project, entries.map(toEntry), [...meetings.values()], events, now);
}

type Row = { type: "day"; at: number; day: HistoryDay } | { type: "event"; at: number; anns: Annotation[] } | { type: "gap"; at: number; gap: Gap };

function HistoryView({ project, history: h }: { project: Project; history: History }) {
    const navigate = useNavigate();
    const now = h.now;
    const [at, setAt] = useState(() => initialMoment(h));
    const [anchor, setAnchor] = useState(() => dayKey(initialMoment(h)));
    const [range, setRange] = useState<Range>("week");
    const [order, setOrder] = useState<"asc" | "desc">("asc");
    const [person, setPerson] = useState("");
    const [q, setQ] = useState("");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    // each day's task list stays folded until asked for; the chart above it is always shown
    const [tasksOpen, setTasksOpen] = useState<Record<string, boolean>>({});
    const [jump, setJump] = useState("");
    const [jumpMsg, setJumpMsg] = useState<{ bad: boolean; text: string } | null>(null);
    const [dayOpen, setDayOpen] = useState<string | null>(null);
    const [entry, setEntry] = useState<number | null>(null);
    const nameOf = (id: number) => h.people.get(id)?.name ?? "Someone";
    const onPerson = (id: number) => navigate(`/design/people/${id}`);

    const created = earliestOf(h, project.startDate);
    const minKey = addDays(dayKey(created), -7);
    const minT = dayStart(minKey);
    const moment = (T: number) => {
        const t = clamp(roundMin(T), minT, floorMin(now));
        setAt(t);
        setAnchor(dayKey(t));
    };

    const filter = { person: person ? +person : null, q: q.trim() };
    const snap = snapshot(h, at);
    const win = windowFor(anchor, range);
    const winFrom = dayStart(win.from), winTo = dayEnd(win.to);

    // rows for the window: days with work, pauses, and recorded events on days nobody worked
    const days = daysIn(h, win.from, win.to, filter);
    const shownKeys = new Set(days.map((d) => d.key));
    const anns = h.annotations.filter((a) => {
        if (a.kind === "pause" || a.at < winFrom || a.at > winTo) return false;
        if (filter.person != null && (a.kind === "joined" || a.kind === "last_entry") && a.personId !== filter.person) return false;
        if ((filter.person != null || filter.q) && (a.kind.startsWith("discipline") || a.kind.startsWith("peak"))) return false;
        return true;
    });
    const byDay = new Map<string, Annotation[]>(), loose = new Map<string, Annotation[]>();
    for (const a of anns) {
        const k = dayKey(a.at);
        const map = shownKeys.has(k) ? byDay : loose;
        map.set(k, [...(map.get(k) ?? []), a]);
    }
    const rows: Row[] = days.map((d) => ({ type: "day", at: d.date, day: d }));
    for (const list of loose.values()) rows.push({ type: "event", at: list[0].at, anns: list });
    if (filter.person == null && !filter.q) for (const g of h.gaps) if (g.from <= winTo && g.to >= winFrom) rows.push({ type: "gap", at: g.from + 1, gap: g });
    rows.sort((a, b) => a.at - b.at);
    if (order === "desc") rows.reverse();

    // one hour scale for the whole window, so days line up with each other
    let lo = 8, hi = 19;
    for (const d of days) for (const it of d.items) { lo = Math.min(lo, Math.floor(hoursOf(it.s))); hi = Math.max(hi, Math.ceil(hoursOf(it.e) || 24)); }
    if (at >= winFrom && at <= winTo) { lo = Math.min(lo, Math.floor(hoursOf(at))); hi = Math.max(hi, Math.ceil(hoursOf(at) + 0.01)); }
    const step = hi - lo > 10 ? 3 : 2;
    const ticks: number[] = [];
    for (let hr = Math.ceil(lo / step) * step; hr <= hi; hr += step) ticks.push(hr);
    const scale = { lo, hi, ticks };

    const peopleOpts = [...h.people.values()].sort((a, b) => b.minutes - a.minutes);
    const stNow = statusAt(h, now);
    const completed = project.completedAt ? dayKey(project.completedAt) : null;
    const lastStatus = h.statusTrack.length ? h.statusTrack[h.statusTrack.length - 1].from : now;
    let railTo = stNow.status === "active" || stNow.status === "hold" ? now : Math.max(h.bounds.last ?? now, lastStatus);
    const railFrom = created;
    railTo += Math.max(86_400_000, (railTo - railFrom) * 0.015);

    const rangeLabel = range === "day" ? fmtDayDateY(win.from) : range === "month" ? fmtMonthY(win.from)
        : range === "year" ? String(partsOf(win.from).year) : `Week of ${fmtDateY(win.from)}`;

    function goTo() {
        if (!jump) return;
        if (dayStart(jump) > now) { setJumpMsg({ bad: true, text: "That is after today - nothing can have happened yet." }); return; }
        const w = windowFor(jump, range);
        setAnchor(jump);
        const before = dayEnd(w.to) < dayStart(dayKey(created));
        const n = daysIn(h, w.from, w.to, null).length;
        setJumpMsg({
            bad: before,
            text: before ? `That is before this project was created (${fmtDateY(created)}).`
                : n ? `Showing ${n} day${n === 1 ? "" : "s"} with work.` : "No work was logged then - the nearest work is linked below.",
        });
    }
    const canNext = winTo < now, canPrev = winFrom > minT;
    const nearFrom = nearestDays(h, win.from), nearTo = nearestDays(h, win.to);

    return (
        <div>
            <KpiStrip items={[
                { key: "status", label: "Status today", value: <HistoryStatus status={stNow.status} />, sub: <span>{stNow.since ? `since ${fmtDateY(stNow.since)}` : ""}</span> },
                {
                    key: "life", label: "Project life", value: `${fmtDate(project.startDate)} – ${completed ? fmtDate(completed) : "today"}`,
                    sub: <span>{daysBetween(project.startDate, completed ?? dayKey(now)) + 1} days{project.client ? ` · ${project.client.displayName}` : " · internal"}</span>,
                },
                {
                    key: "progress", label: "Progress today", value: `${project.progressPct}%`,
                    sub: <span>{h.progressTrack.length ? `${h.progressTrack.length} checkpoint${h.progressTrack.length === 1 ? "" : "s"}` : "no history recorded"}</span>,
                },
                { key: "people", label: "People", value: h.people.size, sub: <Avatars people={peopleOpts.map((p) => ({ id: p.id, name: p.name }))} max={6} link /> },
                { key: "work", label: "Work logged", value: fmtH(h.totalMinutes), sub: <span>{fmtNumber(h.entries.length)} entries on {fmtNumber(h.days.length)} days</span> },
            ]} />

            <div className="panel mt">
                <div className="panel-head">
                    <div className="grow" style={{ minWidth: 220 }}>
                        <div className="panel-title">The project at a moment</div>
                        <div className="panel-sub">Pick any date and time in the project's life. Everything in this panel describes that moment, not today.</div>
                    </div>
                    <div className="panel-tools">
                        <DateInput className="input mono" style={{ width: 150 }} aria-label="Date" value={dayKey(at)} min={minKey} max={dayKey(now)}
                            onChange={(v) => { if (v) moment(dayStart(v) + minutesOfDay(at) * 60_000); }} />
                        <div style={{ width: 120 }}>
                            <TimeField label="Time" value={minutesOfDay(at)} onChange={(m) => moment(dayStart(dayKey(at)) + (m % 1440) * 60_000)} />
                        </div>
                        <button className="btn btn-sm" onClick={() => moment(now)}><Icon name="clock" />Now</button>
                        {h.entries.length > 0 && (
                            <>
                                <button className="btn btn-sm" onClick={() => moment(middleOf(h.entries[h.entries.length - 1]))}>Latest work</button>
                                <button className="btn btn-sm" onClick={() => moment(middleOf(h.entries[0]))}>First work</button>
                            </>
                        )}
                    </div>
                </div>
                <div className="panel-body">
                    <div className="snap-when">
                        <Icon name="calendar" /><b>{fmtMoment(at)}</b>
                        <span className="muted">{relTime(at)}</span>
                    </div>
                    <SnapshotView snap={snap} history={h} todayPct={project.progressPct} onPick={moment} onEntry={setEntry} onPerson={onPerson} />
                </div>
            </div>

            <div className="panel mt">
                <div className="panel-head">
                    <div className="grow">
                        <div className="panel-title">Progress and status over time</div>
                        <div className="panel-sub">
                            {h.progressTrack.length
                                ? "Dots are progress checkpoints; the dashed line between them is estimated from the work logged in between. Click anywhere to see that moment."
                                : "Progress was never recorded for this project - only today's value is known, so no history is drawn. Click anywhere to see that moment."}
                        </div>
                    </div>
                </div>
                <div className="panel-body">
                    <ProgressRail history={h} from={railFrom} to={railTo} at={at} window={{ from: winFrom, to: winTo }} onPick={moment} />
                    <div className="legend" style={{ marginTop: 4 }}>
                        <span><i style={{ background: "var(--chart)", borderRadius: "50%" }} />Progress checkpoint</span>
                        <span><i style={{ background: "var(--ghost-soft)" }} />Hours logged per week</span>
                        <span><i style={{ background: "var(--ok)" }} />Active</span>
                        <span><i style={{ background: "var(--warn-mark)" }} />On hold</span>
                        <span><i style={{ background: "var(--done)" }} />Completed</span>
                        <span><i style={{ background: "var(--arch)" }} />Archived</span>
                    </div>
                </div>
            </div>

            <div className="panel mt">
                <div className="panel-head">
                    <div className="grow" style={{ minWidth: 200 }}>
                        <div className="panel-title">Project history</div>
                        <div className="panel-sub">What happened, in order. Click any moment in a day to see the project as it was then.</div>
                    </div>
                </div>
                <div className="panel-body">
                    <div className="filters">
                        <Segmented value={range} onChange={(r) => { setRange(r); setJumpMsg(null); }} aria-label="Range"
                            options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
                        <div className="row" style={{ gap: 4 }}>
                            <DateInput className="input mono" style={{ width: 150 }} aria-label="Go to a date" value={jump} min={minKey} max={dayKey(now)}
                                onChange={(v) => { setJump(v); if (jumpMsg) setJumpMsg(null); }} />
                            <button className="btn btn-sm" disabled={!jump} onClick={goTo}>Go</button>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                            <button className="icon-btn" aria-label="Previous" disabled={!canPrev} onClick={() => setAnchor(shiftWindow(anchor, range, -1))}><Icon name="chevronLeft" /></button>
                            <b style={{ fontSize: "12.5px", minWidth: 150, textAlign: "center" }}>{rangeLabel}</b>
                            <button className="icon-btn" aria-label="Next" disabled={!canNext} onClick={() => setAnchor(shiftWindow(anchor, range, 1))}><Icon name="chevronRight" /></button>
                        </div>
                        <Select className="select sm" style={{ width: 170 }} aria-label="Person" value={person} onChange={setPerson}
                            options={[{ value: "", label: "Everyone" }, ...peopleOpts.map((p) => ({ value: String(p.id), label: p.name }))]} />
                        <SearchInput width={190} value={q} onChange={setQ} placeholder="Search tasks" />
                        <div className="grow" />
                        <button className="btn btn-sm" onClick={() => setOrder(order === "asc" ? "desc" : "asc")}>
                            <Icon name="sort" />{order === "asc" ? "Oldest first" : "Newest first"}
                        </button>
                    </div>

                    {jumpMsg && <div className={jumpMsg.bad ? "hint err" : "hint"} style={{ margin: "-4px 0 10px" }}>{jumpMsg.text}</div>}
                    {rows.length ? (
                        <div className="vt">
                            {rows.map((r) => {
                                if (r.type === "gap") return <GapRow key={`g${r.at}`} gap={r.gap} />;
                                if (r.type === "event") return <EventRow key={`ev${r.at}`} at={r.anns[0].at} anns={r.anns} nameOf={nameOf} />;
                                const open = range === "day" || range === "week" || !!expanded[r.day.key] || dayKey(at) === r.day.key;
                                return (
                                    <Day key={r.day.key} day={r.day} history={h} scale={scale} at={at} filter={filter} anns={byDay.get(r.day.key) ?? []}
                                        expanded={open} tasksOpen={!!tasksOpen[r.day.key]}
                                        onToggleTasks={() => setTasksOpen({ ...tasksOpen, [r.day.key]: !tasksOpen[r.day.key] })}
                                        onExpand={() => setExpanded({ ...expanded, [r.day.key]: true })}
                                        onPick={moment} onEntry={setEntry} onPerson={onPerson} onOpenDay={setDayOpen} />
                                );
                            })}
                        </div>
                    ) : (
                        <Empty art="time"
                            title={h.entries.length ? `No work logged in this ${range}${filter.person != null || filter.q ? " matching these filters" : ""}` : "No work has been logged on this project"}
                            text={h.entries.length ? `Move to another ${range}, or jump straight to the nearest work.` : "The history fills in as people log work against it."}
                            action={h.entries.length ? (
                                <div className="row wrap" style={{ gap: 6, justifyContent: "center" }}>
                                    {nearFrom.prev && <button className="btn btn-sm" onClick={() => setAnchor(nearFrom.prev!.key)}><Icon name="chevronLeft" />{fmtDate(nearFrom.prev.key)}</button>}
                                    {nearTo.next && <button className="btn btn-sm" onClick={() => setAnchor(nearTo.next!.key)}>{fmtDate(nearTo.next.key)}<Icon name="chevronRight" /></button>}
                                    {(person || q) && <button className="btn btn-sm" onClick={() => { setPerson(""); setQ(""); }}>Clear filters</button>}
                                </div>
                            ) : undefined} />
                    )}

                    <div className="hint mt">
                        <b>Recorded</b> comes from a status change or progress update saved in the system.
                        <b> Inferred</b> is worked out from work entries - who logged work, when - and never says why.
                    </div>
                </div>
            </div>
            {dayOpen && <DayStory history={h} projectTitle={project.title} dayKey={dayOpen} onEntry={setEntry} onClose={() => setDayOpen(null)} />}
            {entry != null && <EntryModal entryId={entry} onClose={() => setEntry(null)} />}
        </div>
    );
}
