import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
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
import { toast } from "@/shared/components/Feedback/toast";
import { Avatars, PersonAvatar } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { fmtDate, fmtDateY, fmtH, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import EntryRow from "./EntryRow";
import { openLogWork } from "./logWorkStore";
import { useDeleteEntry, useMyProjects, useMyProjectWork, useRestoreEntry, type WorkEntry } from "./workApi";
import { loadFailed } from "@/api/queryState";

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
    return <span className="row" style={{ gap: 6 }}>Team <Avatars people={mine.contributors} max={5} /></span>;
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
                        <Columns height={150} labelEvery={2} format={(v) => `${Math.round(v)}h`}
                            data={w.weekly.map((x) => ({ label: fmtDate(x.weekStart), tip: `Week of ${fmtDateY(x.weekStart)}`, value: x.minutes / 60 }))} />
                    )}
                </Figure>

                {!seesAll && (
                    <Panel title="Team activity" sub="What your teammates have been working on." bodyStyle={{ paddingTop: 2 }}
                        foot={<span className="muted">Teammates' hours stay private - only admins see per-person totals.</span>}>
                        {!w ? <SkeletonLines lines={3} /> : w.team.length ? w.team.map((t, i) => (
                            <div key={`${t.personId}-${t.startedAt}-${i}`} className="mini-row" style={{ alignItems: "flex-start" }}>
                                <PersonAvatar person={{ id: t.personId, name: t.personName }} size={26} />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: "12.5px" }}><b>{t.personName.split(" ")[0]}</b> · {relDay(t.startedAt)}</div>
                                    <div className="muted clamp2" style={{ fontSize: "11.5px" }}>{t.description}</div>
                                </div>
                            </div>
                        )) : <p className="muted">No one else has logged work here yet.</p>}
                    </Panel>
                )}
            </div>
        </div>
    );
}

/** "Your recent work": the person's latest entries here, each editable while the edit window lasts. */
function RecentWork({ projectId, entries, total, canLog }: { projectId: number; entries?: WorkEntry[]; total: number; canLog: boolean }) {
    const navigate = useNavigate();
    const myWork = canOpen(usePermissions(), "design", "my-work");
    const remove = useDeleteEntry();
    const restore = useRestoreEntry();

    function del(e: WorkEntry) {
        remove.mutate(e.id, {
            onSuccess: () => toast({ text: "Entry deleted", icon: "trash", actionLabel: "Undo", action: () => restore.mutate(e.id) }),
            onError: (err) => toast({ text: "That entry wasn't deleted", sub: errorMessage(err), icon: "alert" }),
        });
    }

    return (
        <Panel title="Your recent work" sub="Every entry keeps the exact start and end time you recorded." bodyStyle={{ paddingTop: 2 }}
            tools={canLog && <button className="btn btn-sm" onClick={() => openLogWork({ projectId })}><Icon name="plus" />Log work</button>}
            foot={total > 12 && myWork && <button className="btn btn-sm btn-quiet" onClick={() => navigate(`/design/my-work?project=${projectId}`)}>See all {total} entries in My work</button>}>
            {!entries ? <SkeletonLines lines={4} /> : entries.slice(0, 12).map((e) => (
                <EntryRow key={e.id} entry={e} showProject={false} showCreated canAttach
                    right={e.canEdit && canLog ? (
                        <MenuButton icon="dots" label="Entry actions" width={170}>
                            {(close) => (
                                <div>
                                    <button className="pop-item" onClick={() => { close(); openLogWork({ edit: e }); }}><Icon name="edit" />Edit entry</button>
                                    <button className="pop-item" onClick={() => { close(); del(e); }}><Icon name="trash" />Delete</button>
                                </div>
                            )}
                        </MenuButton>
                    ) : null} />
            ))}
            {entries && entries.length === 0 && (
                <Empty art="time" title="You haven't logged work here yet" text="Record what you did and the exact hours you spent - it takes about ten seconds."
                    action={canLog && <button className="btn btn-primary" onClick={() => openLogWork({ projectId })}>Log work</button>} />
            )}
        </Panel>
    );
}
