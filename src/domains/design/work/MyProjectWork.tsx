import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { Bar } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Panel from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Avatars, PersonAvatar } from "@/shared/components/Identity/People";
import { chartColors } from "@/shared/format/color";
import { dayKey, fmtDate, fmtDateY, fmtH, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import EntryActions from "./EntryActions";
import { useDeleteWithUndo } from "./useDeleteWithUndo";
import EntryRow from "./EntryRow";
import { openLogWork } from "./logWorkStore";
import { useMyProjects, useMyProjectWork, type WorkEntry } from "./workApi";
import { loadFailed } from "@/api/queryState";
import type { Schemas } from "@/api/types";

/*
 * The person's own work on a Design project (the prototype's P.EmpProject), the parts of the project page that
 * work_entry:view_own opens: their hours here, their recent entries and the team's latest work.
 */

/** "Log work" in the project's head, or "Logging closed" once the project takes no more work. */
export function LogWorkAction({ project }: { project: Project }) {
    const permissions = usePermissions();
    const canLog = permissions.hasAll(P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN);
    const w = useMyProjectWork(project.id, canLog).data;
    if (!canLog || !w) return null;
    if (!w.acceptsWork) return <span className="badge badge-hold"><Icon name="lock" />Logging closed</span>;
    // beside "Mark as done" it gives the primary look away
    return (
        <button className={cx("btn", !permissions.has(P.PROJECT_CHANGE_STATUS) && "btn-primary btn-lg")} onClick={() => openLogWork({ projectId: project.id })}>
            <Icon name="plus" />Log work
        </button>
    );
}

/** "Team [avatars]" in the project's head: who works on it. Those who see everyone's work have the contributors. */
export function MyTeamLine({ project }: { project: Project }) {
    const permissions = usePermissions();
    const shown = permissions.has(P.WORK_ENTRY_VIEW_OWN) && !permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const mine = useMyProjects(shown).data?.find((p) => p.id === project.id);
    if (!shown || !mine?.contributors.length) return null;
    return <Avatars people={mine.contributors} max={5} link />;
}

/**
 * Their hours here, their recent entries and their hours per week. Someone who sees everyone's work gets the
 * project's own figures under it, so for them it shows only once they have logged here.
 */
export function MyProjectWork({ project }: { project: Project }) {
    const permissions = usePermissions();
    const work = useMyProjectWork(project.id);
    const w = work.data;
    const seesAll = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const canLog = !!w?.acceptsWork && permissions.has(P.WORK_ENTRY_CREATE);
    if (seesAll && !loadFailed(work) && !w?.myEntries) return null;

    return (
        <div className={cx("grid g-8-4", seesAll && "mb")}>
            <div className="stack">
                {loadFailed(work) ? <div className="panel"><div className="panel-body"><LoadError error={work.error} retry={() => work.refetch()} what="your work here" /></div></div> : (
                    <KpiStrip loading={!w} items={[
                        { key: "mine", label: "Your hours here", value: fmtH(w?.myMinutes ?? 0), sub: <span>{w?.myEntries ?? 0} entries</span> },
                        { key: "week", label: "Your hours this week", value: fmtH(w?.myThisWeekMinutes ?? 0) },
                        // the project's own figures, below, carry these for those who see everyone's work
                        ...(seesAll ? [] : [
                            { key: "progress", label: "Project progress", value: `${project.progressPct}%`, sub: <div style={{ width: 80 }}><Bar value={project.progressPct} hideValue /></div> },
                            { key: "team", label: "Team on this project", value: w?.contributorCount ?? 0, sub: <span>{fmtH(w?.totalMinutes ?? 0)} logged in total</span> },
                        ]),
                    ]} />
                )}

                <RecentWork projectId={project.id} entries={w?.recent} total={w?.myEntries ?? 0} canLog={canLog} />
            </div>

            <div className="stack">
                <Figure title="Your hours per week" sub="On this project.">
                    {!w ? <SkeletonLines lines={4} /> : (
                        <div style={chartColors(project.tint)}>
                            <Columns height={150} labelEvery={2} format={(v) => `${Math.round(v)}h`}
                                data={w.weekly.map((x) => ({ label: fmtDate(x.weekStart), tip: `Week of ${fmtDateY(x.weekStart)}`, value: x.minutes / 60 }))} />
                        </div>
                    )}
                </Figure>

                {!seesAll && (
                    <Panel title="Team activity" sub="What your teammates have been working on." bodyStyle={{ paddingTop: 2 }}
                        foot={<span className="muted">Teammates' hours stay private - only admins see per-person totals.</span>}>
                        {!w ? <SkeletonLines lines={3} /> : w.team.length ? teamRows(w.team).map((g) => (
                            <div key={g.key} className="mini-row" style={{ alignItems: "flex-start" }}>
                                <PersonAvatar person={{ id: g.personId, name: g.personName }} size={26} />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: "12.5px" }}>
                                        <b>{g.personName.split(" ")[0]}</b> · {g.days === 1 ? relDay(g.to) : <>{fmtDate(g.from)} – {fmtDate(g.to)} <span className="muted">· {g.days} days</span></>}
                                    </div>
                                    {g.tasks.slice(0, SHOWN_TASKS).map((task) => <div key={task} className="muted clamp2" style={{ fontSize: "11.5px" }}>{task}</div>)}
                                    {g.tasks.length > SHOWN_TASKS && <div className="muted" style={{ fontSize: "11.5px" }}>and {g.tasks.length - SHOWN_TASKS} more</div>}
                                </div>
                            </div>
                        )) : <p className="muted">No one else has logged work here yet.</p>}
                    </Panel>
                )}
            </div>
        </div>
    );
}

const SHOWN_TASKS = 3;

const sameTasks = (a: string[], b: string[]) => a.length === b.length && a.every((task, i) => task === b[i]);

type TeamRow = { key: string; personId: number; personName: string; from: string; to: string; days: number; tasks: string[] };

/**
 * The team's latest work, newest first, one row per teammate per day with each different task named once. Days in a
 * row where a teammate did the same tasks fold into one row with the dates ("Nov 6 – Nov 13 · 6 days"), so a week on
 * one drawing reads as one line. Only what they worked on and when, never for how long.
 */
function teamRows(team: Schemas["MyProjectWorkResponse"]["team"]): TeamRow[] {
    const days = new Map<string, TeamRow>();
    for (const t of team) {
        const key = `${t.personId}-${dayKey(t.startedAt)}`;
        const day = days.get(key) ?? { key, personId: t.personId, personName: t.personName, from: t.startedAt, to: t.startedAt, days: 1, tasks: [] };
        if (t.description && !day.tasks.includes(t.description)) day.tasks.push(t.description);
        days.set(key, day);
    }
    const rows: TeamRow[] = [];
    for (const day of days.values()) {
        const prev = rows[rows.length - 1];
        if (prev && prev.personId === day.personId && sameTasks(prev.tasks, day.tasks)) {
            prev.from = day.from;
            prev.days += 1;
        } else rows.push({ ...day });
    }
    return rows;
}

/** "Your recent work": the person's latest entries here, each editable while the edit window lasts. */
function RecentWork({ projectId, entries, total, canLog }: { projectId: number; entries?: WorkEntry[]; total: number; canLog: boolean }) {
    const navigate = useNavigate();
    const myWork = canOpen(usePermissions(), "design", "my-work");
    const del = useDeleteWithUndo();

    return (
        <Panel title="Your recent work" sub="Every entry keeps the exact start and end time you recorded." bodyStyle={{ paddingTop: 2 }}
            tools={canLog && <button className="btn btn-sm" onClick={() => openLogWork({ projectId })}><Icon name="plus" />Log work</button>}
            foot={total > 12 && myWork && <button className="btn btn-sm btn-quiet" onClick={() => navigate(`/design/my-work?project=${projectId}`)}>See all {total} entries in My work</button>}>
            {!entries ? <SkeletonLines lines={4} /> : entries.slice(0, 12).map((e) => (
                <EntryRow key={e.id} entry={e} showProject={false} showCreated canAttach
                    right={canLog ? <EntryActions entry={e} onDelete={del} /> : null} />
            ))}
            {entries && entries.length === 0 && (
                <Empty art="time" title="You haven't logged work here yet" text="Record what you did and the exact hours you spent - it takes about ten seconds."
                    action={canLog && <button className="btn btn-primary" onClick={() => openLogWork({ projectId })}>Log work</button>} />
            )}
        </Panel>
    );
}
