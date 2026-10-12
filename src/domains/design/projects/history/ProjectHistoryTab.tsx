import { useMemo, useState } from "react";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import DateInput from "@/shared/components/Forms/DateInput";
import Select from "@/shared/components/Forms/Select";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import { Avatars } from "@/shared/components/Identity/People";
import { quarterLabel, quarterOf } from "@/shared/format/periods";
import { addDays, dayKey, daysBetween, fmtDate, fmtDateY, fmtDayDateY, fmtH, fmtMonthY, fmtNumber, partsOf } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useRequirements } from "../../../shared/requirements/requirementsApi";
import type { Project } from "../../../shared/projects/projectsApi";
import { companyNow } from "../../work/day";
import EntryModal from "../EntryModal";
import { useProjectTimeline, useTimelineEntries, type Timeline, type TimelineEntry } from "../projectWorkApi";
import DayStory from "./DayStory";
import { buildHistory, dayEnd, dayStart, daysIn, earliestOf, nearestDays, shiftWindow, statusAt, toEntry, windowFor, type History, type Meeting, type Range } from "./history";
import HistoryCalendar from "./HistoryCalendar";
import { HistoryStatus } from "./HistoryParts";
import ProgressRail from "./ProgressRail";

/** A Design project's Timeline tab: its progress over time (when it has requirements) and its work as a calendar. */
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

function HistoryView({ project, history: h }: { project: Project; history: History }) {
    const permissions = usePermissions();
    const requirements = useRequirements(project.id, permissions.has(P.REQUIREMENT_VIEW));
    const now = h.now;
    const today = dayKey(now);
    const [anchor, setAnchor] = useState(today);
    const [range, setRange] = useState<Range | "custom">("week");
    const [custom, setCustom] = useState({ from: addDays(today, -13), to: today });
    const [person, setPerson] = useState("");
    const [q, setQ] = useState("");
    const [jump, setJump] = useState("");
    const [jumpMsg, setJumpMsg] = useState<{ bad: boolean; text: string } | null>(null);
    const [dayOpen, setDayOpen] = useState<string | null>(null);
    const [entry, setEntry] = useState<number | null>(null);

    const created = earliestOf(h, project.startDate);
    const minKey = addDays(dayKey(created), -7);
    const filter = { person: person ? +person : null, q: q.trim() };
    const customOk = !!custom.from && !!custom.to && custom.from <= custom.to;
    const win = range === "custom" ? (customOk ? custom : { from: today, to: today }) : windowFor(anchor, range);
    const winFrom = dayStart(win.from), winTo = dayEnd(win.to);
    const worked = daysIn(h, win.from, win.to, filter);
    // recorded changes only: the calendar itself shows the work
    const anns = h.annotations.filter((a) => a.source === "recorded" && (a.kind === "status" || a.kind === "progress") && a.at >= winFrom && a.at <= winTo);

    const peopleOpts = [...h.people.values()].sort((a, b) => b.minutes - a.minutes);
    const stNow = statusAt(h, now);
    const completed = project.completedAt ? dayKey(project.completedAt) : null;
    const lastStatus = h.statusTrack.length ? h.statusTrack[h.statusTrack.length - 1].from : now;
    let railTo = stNow.status === "active" || stNow.status === "hold" ? now : Math.max(h.bounds.last ?? now, lastStatus);
    const railFrom = created;
    railTo += Math.max(86_400_000, (railTo - railFrom) * 0.015);
    // progress comes from the requirements: a project without any has no progress to draw
    const tracksProgress = (requirements.data?.total ?? 0) > 0;

    const quarter = quarterOf(win.from);
    const rangeLabel = range === "custom" ? `${fmtDate(win.from)} – ${fmtDateY(win.to)}`
        : range === "day" ? fmtDayDateY(win.from)
            : range === "month" ? fmtMonthY(win.from)
                : range === "quarter" ? quarterLabel(quarter.year, quarter.quarter)
                    : range === "year" ? String(partsOf(win.from).year) : `Week of ${fmtDateY(win.from)}`;

    function goTo() {
        if (!jump) return;
        if (jump > today) { setJumpMsg({ bad: true, text: "That is after today - nothing can have happened yet." }); return; }
        // the date asked for is the one shown: its own day, not the start of its week
        setRange("day");
        setAnchor(jump);
        const before = dayEnd(jump) < dayStart(dayKey(created));
        const any = daysIn(h, jump, jump, null).length > 0;
        setJumpMsg({
            bad: before,
            text: before ? `That is before this project was created (${fmtDateY(created)}).`
                : any ? `Showing ${fmtDayDateY(jump)}.` : `No work was logged on ${fmtDayDateY(jump)} - the nearest work is linked below.`,
        });
    }
    function shift(dir: number) {
        if (range === "custom") {
            const n = daysBetween(custom.from, custom.to) + 1;
            setCustom({ from: addDays(custom.from, dir * n), to: addDays(custom.to, dir * n) });
        } else setAnchor(shiftWindow(anchor, range, dir));
    }
    const canNext = winTo < now, canPrev = winFrom > dayStart(minKey);
    const nearFrom = nearestDays(h, win.from), nearTo = nearestDays(h, win.to);
    const showDay = (key: string) => { if (range === "custom") setRange("week"); setAnchor(key); };

    return (
        <div>
            <KpiStrip items={[
                { key: "status", label: "Status today", value: <HistoryStatus status={stNow.status} />, sub: <span>{stNow.since ? `since ${fmtDateY(stNow.since)}` : ""}</span> },
                {
                    key: "life", label: "Project life", value: `${fmtDate(project.startDate)} – ${completed ? fmtDate(completed) : "today"}`,
                    sub: <span>{daysBetween(project.startDate, completed ?? today) + 1} days{project.client ? ` · ${project.client.displayName}` : " · internal"}</span>,
                },
                {
                    key: "progress", label: "Progress today", value: `${project.progressPct}%`,
                    sub: <span>{h.progressTrack.length ? `${h.progressTrack.length} checkpoint${h.progressTrack.length === 1 ? "" : "s"}` : "no history recorded"}</span>,
                },
                { key: "people", label: "People", value: h.people.size, sub: <Avatars people={peopleOpts.map((p) => ({ id: p.id, name: p.name }))} max={6} link /> },
                { key: "work", label: "Work logged", value: fmtH(h.totalMinutes), sub: <span>{fmtNumber(h.entries.length)} entries on {fmtNumber(h.days.length)} days</span> },
            ]} />

            {tracksProgress && (
                <div className="panel mt">
                    <div className="panel-head">
                        <div className="grow">
                            <div className="panel-title">Progress and status over time</div>
                            <div className="panel-sub">
                                {h.progressTrack.length
                                    ? "Dots are progress checkpoints; the dashed line between them is estimated from the work logged in between. Click anywhere to show that day below."
                                    : "Progress hasn't changed yet - only today's value is known. Click anywhere to show that day below."}
                            </div>
                        </div>
                    </div>
                    <div className="panel-body">
                        <ProgressRail history={h} from={railFrom} to={railTo} at={null} window={{ from: winFrom, to: winTo }} onPick={(t) => showDay(dayKey(t))} />
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
            )}

            <div className="panel mt">
                <div className="panel-head">
                    <div className="grow" style={{ minWidth: 200 }}>
                        <div className="panel-title">Project history</div>
                        <div className="panel-sub">Who worked when, as a calendar. Click a day to see it in detail, or a task to open it.</div>
                    </div>
                </div>
                <div className="panel-body">
                    <div className="filters">
                        <Segmented value={range} onChange={(r) => { setRange(r); setJumpMsg(null); }} aria-label="Range"
                            options={[
                                { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" },
                                { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }, { value: "custom", label: "Custom" },
                            ]} />
                        {range === "custom" ? (
                            <div className="row" style={{ gap: 4 }}>
                                <DateInput className="input mono" style={{ width: 140 }} aria-label="From" value={custom.from} min={minKey} max={custom.to || today}
                                    onChange={(v) => setCustom({ ...custom, from: v })} />
                                <span className="muted">to</span>
                                <DateInput className="input mono" style={{ width: 140 }} aria-label="To" value={custom.to} min={custom.from || minKey} max={today}
                                    onChange={(v) => setCustom({ ...custom, to: v })} />
                            </div>
                        ) : (
                            <div className="row" style={{ gap: 4 }}>
                                <DateInput className="input mono" style={{ width: 150 }} aria-label="Go to a date" value={jump} min={minKey} max={today}
                                    onChange={(v) => { setJump(v); if (jumpMsg) setJumpMsg(null); }} />
                                <button className="btn btn-sm" disabled={!jump} onClick={goTo}>Go</button>
                            </div>
                        )}
                        <div className="row" style={{ gap: 4 }}>
                            <button className="icon-btn" aria-label="Previous" disabled={!canPrev} onClick={() => shift(-1)}><Icon name="chevronLeft" /></button>
                            <b style={{ fontSize: "12.5px", minWidth: 150, textAlign: "center" }}>{rangeLabel}</b>
                            <button className="icon-btn" aria-label="Next" disabled={!canNext} onClick={() => shift(1)}><Icon name="chevronRight" /></button>
                        </div>
                        {range !== "custom" && <button className="btn btn-sm" disabled={win.from <= today && win.to >= today} onClick={() => setAnchor(today)}>Today</button>}
                        <Select className="select sm" style={{ width: 170 }} aria-label="Person" value={person} onChange={setPerson}
                            options={[{ value: "", label: "Everyone" }, ...peopleOpts.map((p) => ({ value: String(p.id), label: p.name }))]} />
                        <SearchInput width={190} value={q} onChange={setQ} placeholder="Search tasks" />
                    </div>

                    {jumpMsg && <div className={jumpMsg.bad ? "hint err" : "hint"} style={{ margin: "-4px 0 10px" }}>{jumpMsg.text}</div>}
                    {range === "custom" && !customOk && <div className="hint err" style={{ margin: "-4px 0 10px" }}>Pick a start date on or before the end date.</div>}
                    {!worked.length && (
                        <div className="hc-empty">
                            <span className="muted">
                                {h.entries.length
                                    ? `No work logged in this ${range === "custom" ? "range" : range}${filter.person != null || filter.q ? " matching these filters" : ""}.`
                                    : "No work has been logged on this project yet."}
                            </span>
                            {nearFrom.prev && <button className="btn btn-sm" onClick={() => showDay(nearFrom.prev!.key)}><Icon name="chevronLeft" />{fmtDate(nearFrom.prev.key)}</button>}
                            {nearTo.next && <button className="btn btn-sm" onClick={() => showDay(nearTo.next!.key)}>{fmtDate(nearTo.next.key)}<Icon name="chevronRight" /></button>}
                            {(person || q) && <button className="btn btn-sm" onClick={() => { setPerson(""); setQ(""); }}>Clear filters</button>}
                        </div>
                    )}
                    <HistoryCalendar history={h} from={win.from} to={win.to} filter={filter} anns={anns} onOpenDay={setDayOpen} onEntry={setEntry} />
                </div>
            </div>
            {dayOpen && <DayStory history={h} projectTitle={project.title} dayKey={dayOpen} onEntry={setEntry} onClose={() => setDayOpen(null)} />}
            {entry != null && <EntryModal entryId={entry} onClose={() => setEntry(null)} />}
        </div>
    );
}
