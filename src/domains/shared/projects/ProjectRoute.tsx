import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import DesignOverview from "../../design/projects/DesignOverview";
import ProjectHistoryTab from "../../design/projects/history/ProjectHistoryTab";
import { LogWorkAction, MyProjectWork, MyTeamLine } from "../../design/work/MyProjectWork";
import ExecutionOverview, { SiteTeamLine } from "../../execution/projects/ExecutionOverview";
import ProjectPage, { type ProjectPanels } from "./ProjectPage";
import type { Project } from "./projectsApi";

/** Each domain's parts of a project page. Execution sites have no work timeline: nobody logs hours on them. */
const PANELS: Record<Domain, ProjectPanels> = {
    design: {
        overview: (project) => <DesignProjectOverview project={project} />,
        timeline: (project) => <ProjectHistoryTab project={project} />,
        actions: (project) => <LogWorkAction project={project} />,
        meta: (project) => <MyTeamLine project={project} />,
    },
    execution: { overview: (project) => <ExecutionOverview project={project} />, meta: (project) => <SiteTeamLine project={project} /> },
};

/** A project page with its domain's panels. */
export default function ProjectRoute() {
    return <ProjectPage panels={PANELS[useDomain()]} />;
}

/** A Design project's overview: the person's own work on it first, then what their other permissions show. */
function DesignProjectOverview({ project }: { project: Project }) {
    const own = usePermissions().has(P.WORK_ENTRY_VIEW_OWN);
    return (
        <>
            {own && <MyProjectWork project={project} />}
            <DesignOverview project={project} bareProgress={!own} />
        </>
    );
}
