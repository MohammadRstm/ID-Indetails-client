import type { Domain } from "@/app/permissions/permissions";
import { useDomain } from "@/app/routing/domainContext";
import DesignOverview from "../../design/projects/DesignOverview";
import ProjectHistoryTab from "../../design/projects/history/ProjectHistoryTab";
import ExecutionOverview from "../../execution/projects/ExecutionOverview";
import ProjectPage, { type ProjectPanels } from "./ProjectPage";

/** Each domain's Overview and Timeline tabs. Execution sites have no work timeline: nobody logs hours on them. */
const PANELS: Record<Domain, ProjectPanels> = {
    design: { overview: (project) => <DesignOverview project={project} />, timeline: (project) => <ProjectHistoryTab project={project} /> },
    execution: { overview: (project) => <ExecutionOverview project={project} /> },
};

/** A project page with its domain's panels. */
export default function ProjectRoute() {
    return <ProjectPage panels={PANELS[useDomain()]} />;
}
