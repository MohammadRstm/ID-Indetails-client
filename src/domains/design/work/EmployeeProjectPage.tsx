import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { errorMessage, isStatus } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { MissingRecord } from "@/app/pages/NotFound";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { Bar, ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Panel from "@/shared/components/Data/Panel";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Tabs from "@/shared/components/Data/Tabs";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton, { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { Avatars, PersonAvatar } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { fmtDate, fmtDateY, fmtH, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ProjectMeetingsTab } from "../../shared/meetings/Meetings";
import { useProjectMeetings } from "../../shared/meetings/meetingsApi";
import { useProject, type Project } from "../../shared/projects/projectsApi";
import { RequirementsPanel } from "../../shared/requirements/Requirements";
import EntryRow from "./EntryRow";
import { openLogWork } from "./logWorkStore";
import { useDeleteEntry, useMyProjects, useMyProjectWork, useRestoreEntry, type WorkEntry } from "./workApi";

/** A project as a Design employee sees it (the prototype's P.EmpProject): their own work on it, and the team's. */
export default function EmployeeProjectPage() {
    const { id } = useParams();
    const projectId = Number(id);
    const valid = Number.isInteger(projectId) && projectId > 0;
    const project = useProject(projectId);
    if (!valid || isStatus(project.error, 404)) return <MissingRecord title="Project not found" to="/design/projects" back="Back to projects" />;
    if (project.isError) return <div className="page"><LoadError error={project.error} retry={() => project.refetch()} what="the project" /></div>;
    if (!project.data) {
        return (
            <div className="page" aria-busy="true">
                <div className="crumbs"><Skeleton width={160} height={10} /></div>
                <div className="page-head"><div className="row start" style={{ gap: 13 }}><Skeleton width={44} height={44} style={{ borderRadius: 12 }} />
                    <div><Skeleton width={260} height={20} /><Skeleton width={360} height={11} style={{ marginTop: 10 }} /></div></div></div>
                <SkeletonKpis count={4} />
            </div>
        );
    }
    return <ProjectView project={project.data} />;
}

function ProjectView({ project }: { project: Project }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const work = useMyProjectWork(project.id);
    const mine = useMyProjects().data?.find((p) => p.id === project.id);
    const meetings = useProjectMeetings(project.id);
    const tab = params.get("tab") === "meetings" ? "meetings" : "overview";
    const w = work.data;
    const canLog = !!w?.acceptsWork && permissions.has(P.WORK_ENTRY_CREATE);

    function switchTab(k: string) {
        if (k === "overview") params.delete("tab");
        else params.set("tab", k);
        setParams(params);
    }

    return (
        <div className="page">
            <div className="crumbs">
                <Link to="/design/projects">Projects</Link>
                <Icon name="chevronRight" /><span>{project.title}</span>
            </div>

            <div className="page-head">
                <div className="row start" style={{ gap: 13, minWidth: 0 }}>
                    <ProjectTile icon={project.icon} tint={project.tint} size="lg" />
                    <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                            <h1 className="page-title">{project.title}</h1>
                            <StatusBadge status={project.status} />
                        </div>
                        {project.description && <div className="page-sub" style={{ maxWidth: "70ch" }}>{project.description}</div>}
                        <div className="row wrap mt-s" style={{ gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
                            {project.client && <span>Client <b className="sec">{project.client.displayName}</b></span>}
                            <span>Started <b className="sec">{fmtDateY(project.startDate)}</b></span>
                            {project.targetDate && !project.completedAt && <span>Target <b className="sec">{fmtDateY(project.targetDate)}</b></span>}
                            <span className="row" style={{ gap: 6 }}>Team <Avatars people={mine?.contributors ?? []} max={5} /></span>
                        </div>
                    </div>
                </div>
                <div className="page-actions">
                    {!w || !permissions.has(P.WORK_ENTRY_CREATE) ? null : w.acceptsWork
                        ? <button className="btn btn-primary btn-lg" onClick={() => openLogWork({ projectId: project.id })}><Icon name="plus" />Log work</button>
                        : <span className="badge badge-hold"><Icon name="lock" />Logging closed</span>}
                </div>
            </div>

            {w && !w.acceptsWork && (
                <div className={cx("banner", project.status === "hold" ? "hold" : "done")} style={{ marginBottom: 14 }}>
                    <Icon name={project.status === "hold" ? "pause" : "checkCircle"} />
                    <div className="grow">
                        {project.status === "hold"
                            ? <span><b>This project is on hold.</b> You can still see it, but new work entries are paused until it resumes.</span>
                            : <span><b>This project was completed{project.completedAt ? ` on ${fmtDateY(project.completedAt)}` : ""}.</b> New work can't be logged - your {fmtH(w.myMinutes)} stay in My work.</span>}
                    </div>
                </div>
            )}

            <Tabs value={tab} onChange={switchTab} items={[
                { key: "overview", label: "Overview" },
                { key: "meetings", label: "Meetings", count: meetings.data?.length },
            ]} />

            {tab === "meetings" ? <ProjectMeetingsTab project={project} /> : (
                <div className="grid g-8-4">
                    <div className="stack">
                        {work.isError ? <div className="panel"><div className="panel-body"><LoadError error={work.error} retry={() => work.refetch()} what="your work here" /></div></div> : (
                            <KpiStrip loading={!w} items={[
                                { key: "mine", label: "Your hours here", value: fmtH(w?.myMinutes ?? 0), sub: <span>{w?.myEntries ?? 0} entries</span> },
                                { key: "week", label: "Your hours this week", value: fmtH(w?.myThisWeekMinutes ?? 0) },
                                { key: "progress", label: "Project progress", value: `${project.progressPct}%`, sub: <div style={{ width: 80 }}><Bar value={project.progressPct} hideValue /></div> },
                                { key: "team", label: "Team on this project", value: w?.contributorCount ?? 0, sub: <span>{fmtH(w?.totalMinutes ?? 0)} logged in total</span> },
                            ]} />
                        )}

                        <RequirementsPanel project={project} />

                        <RecentWork projectId={project.id} entries={w?.recent} total={w?.myEntries ?? 0} canLog={canLog} />
                    </div>

                    <div className="stack">
                        <Figure title="Your hours per week" sub="On this project.">
                            {!w ? <SkeletonLines lines={4} /> : (
                                <Columns height={150} labelEvery={2} format={(v) => `${Math.round(v)}h`}
                                    data={w.weekly.map((x) => ({ label: fmtDate(x.weekStart), tip: `Week of ${fmtDateY(x.weekStart)}`, value: x.minutes / 60 }))} />
                            )}
                        </Figure>

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
                    </div>
                </div>
            )}
        </div>
    );
}

/** "Your recent work": the person's latest entries here, each editable while the edit window lasts. */
function RecentWork({ projectId, entries, total, canLog }: { projectId: number; entries?: WorkEntry[]; total: number; canLog: boolean }) {
    const navigate = useNavigate();
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
            foot={total > 12 && <button className="btn btn-sm btn-quiet" onClick={() => navigate(`/design/my-work?project=${projectId}`)}>See all {total} entries in My work</button>}>
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
