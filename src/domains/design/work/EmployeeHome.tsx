import { useState } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { Delta } from "@/shared/components/Charts/Bars";
import { Bar, ProjectTile } from "@/shared/components/Data/Bits";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton, { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import { SearchInput } from "@/shared/components/Forms/Filters";
import { Avatars } from "@/shared/components/Identity/People";
import { tip } from "@/shared/components/Overlays/tip";
import { addDays, DAYS, dayKey, daysBetween, fmtDate, fmtDayDate, fmtDayDateY, fmtDur, fmtH, monthKey, partsOf, relTime, startOfWeek } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { companyNow, workHoursOf } from "./day";
import { openLogWork } from "./logWorkStore";
import OvertimePanel from "./OvertimePanel";
import TodayPanel from "./TodayPanel";
import { useDomainSettings, useMyProjects, useMySchedule, useMyWorkSummary, type MyProject } from "./workApi";

type LastWorked = "any" | "week" | "month" | "older" | "never";

const firstName = (name: string) => name.split(" ")[0];

/** A Design employee's home: their week, today, overtime, and the projects they log against (the prototype's P.EmpProjects). */
export default function EmployeeHome() {
    const me = useCurrentUser();
    const permissions = usePermissions();
    const { today, minute: nowMin } = companyNow();
    const summary = useMyWorkSummary();
    const projects = useMyProjects();
    const schedule = useMySchedule(today);
    const settings = useDomainSettings("design").data;
    const canLog = permissions.has(P.WORK_ENTRY_CREATE);
    const [fq, setFq] = useState("");
    const [fClient, setFClient] = useState("");
    const [fLast, setFLast] = useState<LastWorked>("any");

    const hour = Math.floor(nowMin / 60);
    const workHours = workHoursOf(schedule.data?.day);
    const overtimeNow = schedule.data != null && (!workHours || nowMin >= workHours.e);
    const s = summary.data;

    const all = projects.data ?? [];
    const allActive = all.filter((p) => p.status === "active");
    const allHeld = all.filter((p) => p.status === "hold");
    const filtering = !!(fq.trim() || fClient || fLast !== "any");
    const weekStart = startOfWeek(today), monthStart = `${monthKey(today)}-01`, monthAgo = addDays(today, -30);
    function keep(p: MyProject) {
        const q = fq.trim().toLowerCase();
        if (q && !p.title.toLowerCase().includes(q) && !(p.clientName ?? "").toLowerCase().includes(q)) return false;
        if (fClient === "internal" ? !!p.clientName : fClient && p.clientName !== fClient) return false;
        const last = p.myLastStartedAt ? dayKey(p.myLastStartedAt) : null;
        if (fLast === "week" && !(last && last >= weekStart)) return false;
        if (fLast === "month" && !(last && last >= monthStart)) return false;
        if (fLast === "older" && !(last && last < monthAgo)) return false;
        if (fLast === "never" && last) return false;
        return true;
    }
    // the API lists what they worked on most recently first, then the rest newest first
    const active = allActive.filter(keep);
    const held = allHeld.filter(keep);
    const clientNames = [...new Set([...allActive, ...allHeld].map((p) => p.clientName).filter((n): n is string => !!n))];
    const hasInternal = [...allActive, ...allHeld].some((p) => !p.clientName);
    const clear = () => { setFq(""); setFClient(""); setFLast("any"); };

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {me.firstName}</h1>
                    <div className="page-sub">{fmtDayDateY(today)} · {projects.data ? `${allActive.length} active projects` : "…"}</div>
                </div>
                {canLog && (
                    <div className="page-actions">
                        {overtimeNow && <button className="btn btn-lg" onClick={() => openLogWork({ overtime: true })}><Icon name="clock" />Log overtime</button>}
                        <button className="btn btn-primary btn-lg" onClick={() => openLogWork()}><Icon name="plus" />Log work</button>
                    </div>
                )}
            </div>

            <WeekPanel summary={s} error={summary.error} retry={() => summary.refetch()} today={today} />

            {settings?.logReminder && workHours && nowMin >= 15 * 60 && s && !s.todayMinutes && canLog && (
                <div className="banner attn mt"><Icon name="bell" />
                    <div className="grow"><b>Nothing logged today yet.</b> Add what you worked on before you finish - it takes a few seconds on the timeline below.</div>
                </div>
            )}
            {canLog && <TodayPanel />}
            {permissions.has(P.WORK_ENTRY_VIEW_OWN) && <OvertimePanel />}

            <div className="row wrap" style={{ gap: 10, margin: "22px 0 10px", alignItems: "baseline" }}>
                <h2 className="page-title" style={{ fontSize: 15 }}>Active projects</h2>
                <span className="muted" style={{ fontSize: 12 }}>most recently worked on first</span>
            </div>
            <div className="filters">
                <SearchInput width={230} value={fq} onChange={setFq} placeholder="Search projects or clients" />
                <Select className="select sm" style={{ width: 190 }} aria-label="Client" value={fClient} onChange={setFClient} options={[
                    { value: "", label: "All clients" },
                    ...clientNames.map((n) => ({ value: n, label: n })),
                    ...(hasInternal ? [{ value: "internal", label: "Internal (no client)" }] : []),
                ]} />
                <Select className="select sm" style={{ width: 190 }} aria-label="Last worked" value={fLast} onChange={setFLast} options={[
                    { value: "any", label: "Last worked: any time" },
                    { value: "week", label: "Worked on this week" },
                    { value: "month", label: "Worked on this month" },
                    { value: "older", label: "Not in over a month" },
                    { value: "never", label: "Never worked on" },
                ]} />
                {filtering && <button className="btn btn-sm btn-quiet" onClick={clear}><Icon name="x" />Clear</button>}
                {filtering && <span className="muted" style={{ fontSize: 12 }}>{active.length + held.length} of {allActive.length + allHeld.length} projects</span>}
            </div>

            {projects.isError ? <div className="panel"><div className="panel-body"><LoadError error={projects.error} retry={() => projects.refetch()} what="your projects" /></div></div>
                : !projects.data ? (
                    <div className="grid g-3">{[0, 1, 2].map((i) => <div key={i} className="pcard"><SkeletonLines lines={5} /></div>)}</div>
                ) : (
                    <>
                        <div className="grid g-3">{active.map((p) => <ProjectCard key={p.id} project={p} today={today} canLog={canLog} />)}</div>
                        {active.length === 0 && (
                            <div className="panel">
                                {filtering
                                    ? <Empty art="search" title="No active projects match" text="Try another search or clear the filters." action={<button className="btn" onClick={clear}>Clear filters</button>} />
                                    : <Empty art="projects" title="No active projects" text="When an admin creates a project it appears here and you can start logging work against it." />}
                            </div>
                        )}
                        {held.length > 0 && (
                            <div>
                                <h2 className="page-title" style={{ fontSize: 15, margin: "22px 0 4px" }}>Paused</h2>
                                <p className="page-sub" style={{ marginBottom: 10 }}>Still visible so you know where they stand - but no new work can be logged.</p>
                                <div className="grid g-3">{held.map((p) => <ProjectCard key={p.id} project={p} today={today} canLog={canLog} paused />)}</div>
                            </div>
                        )}
                    </>
                )}
        </div>
    );
}

type Summary = ReturnType<typeof useMyWorkSummary>["data"];

/** "Your week so far": the total, against last week, and a bar a day. */
function WeekPanel({ summary: s, error, retry, today }: { summary: Summary; error: unknown; retry: () => void; today: string }) {
    const navigate = useNavigate();
    const maxDay = Math.max(60, ...(s?.week ?? []).map((d) => d.minutes));
    return (
        <div className="panel">
            <div className="panel-body">
                {error ? <LoadError error={error} retry={retry} what="your week" /> : (
                    <div className="row wrap" style={{ gap: 22, alignItems: "flex-end" }}>
                        <div>
                            <div className="u">Your week so far</div>
                            {s ? <div className="hero-val" style={{ fontSize: 34 }}>{fmtH(s.thisWeekMinutes)}</div> : <Skeleton width={110} height={34} style={{ margin: "6px 0" }} />}
                            {s && <Delta value={s.thisWeekMinutes} prev={s.lastWeekMinutes} label="vs last week" />}
                        </div>
                        <div className="grow" style={{ minWidth: 260 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 84 }}>
                                {(s?.week ?? []).map((d) => {
                                    const isToday = d.day === today, future = d.day > today;
                                    const h = d.minutes ? Math.max(4, (d.minutes / maxDay) * 64) : 2;
                                    return (
                                        <div key={d.day} className="grow" style={{ textAlign: "center" }}
                                            onMouseMove={(e) => tip.show(e, [{ big: fmtDayDate(d.day) }, { k: "Logged", v: d.minutes ? fmtDur(d.minutes) : "nothing yet" }])}
                                            onMouseLeave={tip.hide}>
                                            <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 3 }}>{d.minutes ? (d.minutes / 60).toFixed(1) : ""}</div>
                                            <div style={{
                                                height: h, borderRadius: "3px 3px 0 0",
                                                background: future ? "var(--surface-3)" : isToday ? "var(--accent)" : d.minutes ? "var(--chart)" : "var(--surface-3)",
                                            }} />
                                            <div style={{ fontSize: "10.5px", marginTop: 4, color: isToday ? "var(--accent-ink)" : "var(--ink-3)", fontWeight: isToday ? 700 : 400 }}>
                                                {DAYS[partsOf(d.day).weekday]}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div className="u">Logged today</div>
                            <div className="mono" style={{ fontSize: 18, fontWeight: 650 }}>{s ? fmtH(s.todayMinutes) : "…"}</div>
                            <button className="btn btn-sm mt-s" onClick={() => navigate("/design/my-work")}>Open My work</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** One project the person logs against. */
function ProjectCard({ project: p, today, canLog, paused }: { project: MyProject; today: string; canLog: boolean; paused?: boolean }) {
    const navigate = useNavigate();
    const isNew = daysBetween(dayKey(p.createdAt), today) < 2;
    const last = p.lastActivity;
    return (
        <div className="pcard" onClick={() => navigate(`/design/projects/${p.id}`)}>
            <div className="row start" style={{ gap: 11 }}>
                <ProjectTile icon={p.icon} tint={p.tint} size="lg" />
                <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
                        <span className="pcard-title trunc">{p.title}</span>
                        {isNew && <span className="badge badge-new">New</span>}
                    </div>
                    {p.clientName && <div className="muted trunc" style={{ fontSize: "11.5px", marginTop: 2 }}>for {p.clientName}</div>}
                    <div className="muted clamp2" style={{ fontSize: "11.5px", marginTop: 2 }}>{p.description}</div>
                </div>
                <StatusBadge status={p.status} />
            </div>
            <div>
                <div className="spread" style={{ marginBottom: 4 }}>
                    <span className="u">Project progress</span>
                    <span className="muted" style={{ fontSize: "11.5px" }}>Started {fmtDate(p.startDate)}</span>
                </div>
                <Bar value={p.progressPct} tone={paused ? "warn" : ""} />
            </div>
            <div className="pcard-mine">
                <div className="grow">
                    <div className="u">Your hours</div>
                    <div className="mono" style={{ fontWeight: 650, fontSize: 14 }}>{p.myMinutes ? fmtH(p.myMinutes) : "-"}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{p.myLastStartedAt ? `you last worked here ${relTime(p.myLastStartedAt)}` : "you haven't logged here yet"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div className="u">Team</div>
                    <Avatars people={p.contributors} max={4} />
                </div>
            </div>
            <div className="spread">
                <span className="muted trunc" style={{ fontSize: "11.5px" }}>
                    {last ? `${firstName(last.personName)} logged work · ${relTime(last.startedAt)}` : "No work logged yet"}
                </span>
                {!p.acceptsWork
                    ? <span className="badge badge-hold"><Icon name="lock" />Logging paused</span>
                    : canLog && (
                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); openLogWork({ projectId: p.id }); }}>
                            <Icon name="plus" />Log work
                        </button>
                    )}
            </div>
        </div>
    );
}
