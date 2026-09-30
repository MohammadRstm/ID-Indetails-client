import { Link, useParams, useSearchParams } from "react-router";
import { isStatus } from "@/api/errors";
import { MissingRecord } from "@/app/pages/NotFound";
import { Bar, ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Tabs from "@/shared/components/Data/Tabs";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton, { SkeletonKpis } from "@/shared/components/Feedback/Skeleton";
import { Avatars } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { ProjectMeetingsTab } from "../../shared/meetings/Meetings";
import { useProjectMeetings } from "../../shared/meetings/meetingsApi";
import { useProject, type Project } from "../../shared/projects/projectsApi";
import { RequirementsPanel } from "../../shared/requirements/Requirements";
import LabourPanel from "../labour/LabourPanel";
import { useLabourWeeks } from "../labour/labourApi";
import MaterialsPanel from "../materials/MaterialsPanel";
import { useMaterials } from "../materials/materialsApi";

/**
 * A site as an Execution employee sees it (the Execution side of the prototype's P.EmpProject): nobody logs
 * hours here, so the page is built around what they record, materials and weekly labour.
 */
export default function SiteProjectPage() {
    const { id } = useParams();
    const projectId = Number(id);
    const valid = Number.isInteger(projectId) && projectId > 0;
    const project = useProject(projectId);
    if (!valid || isStatus(project.error, 404)) return <MissingRecord title="Project not found" to="/execution/projects" back="Back to projects" />;
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
    return <SiteView project={project.data} />;
}

function SiteView({ project }: { project: Project }) {
    const [params, setParams] = useSearchParams();
    const meetings = useProjectMeetings(project.id);
    const materials = useMaterials(project.id);
    const weeks = useLabourWeeks(project.id);
    const tab = params.get("tab") === "meetings" ? "meetings" : "overview";
    const closed = project.status === "completed" || project.status === "archived";
    const people = project.team?.people ?? [];

    function switchTab(k: string) {
        if (k === "overview") params.delete("tab");
        else params.set("tab", k);
        setParams(params);
    }

    return (
        <div className="page">
            <div className="crumbs">
                <Link to="/execution/projects">Projects</Link>
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
                            <span className="row" style={{ gap: 6 }}>Team <Avatars people={people} max={5} /></span>
                        </div>
                    </div>
                </div>
            </div>

            {project.status === "hold" && (
                <div className="banner hold" style={{ marginBottom: 14 }}>
                    <Icon name="pause" /><div className="grow"><b>This project is on hold.</b> Materials can still be recorded; nothing new is scheduled until it resumes.</div>
                </div>
            )}
            {closed && (
                <div className="banner done" style={{ marginBottom: 14 }}>
                    <Icon name="checkCircle" /><div className="grow"><b>Closed{project.completedAt ? ` ${fmtDateY(project.completedAt)}` : ""}.</b> No new materials can be added.</div>
                </div>
            )}

            <Tabs value={tab} onChange={switchTab} items={[
                { key: "overview", label: "Overview" },
                { key: "meetings", label: "Meetings", count: meetings.data?.length },
            ]} />

            {tab === "meetings" ? <ProjectMeetingsTab project={project} /> : (
                <div>
                    <KpiStrip loading={materials.isPending || weeks.isPending} items={[
                        { key: "progress", label: "Progress", value: `${project.progressPct}%`, sub: <div style={{ width: 88 }}><Bar value={project.progressPct} hideValue /></div> },
                        { key: "materials", label: "Material cost so far", value: money.short(materials.data?.all.cost ?? 0), sub: <span>{materials.data?.all.count ?? 0} items logged</span> },
                        { key: "labour", label: "Ground labour so far", value: money.short(weeks.data?.total ?? 0), sub: <span>{weeks.data?.reportedWeeks ?? 0} weeks reported</span> },
                        { key: "team", label: "Team on this project", value: project.team?.count ?? 0 },
                    ]} />
                    <div className="mt"><RequirementsPanel project={project} /></div>
                    <MaterialsPanel project={project} />
                    <LabourPanel project={project} />
                </div>
            )}
        </div>
    );
}
