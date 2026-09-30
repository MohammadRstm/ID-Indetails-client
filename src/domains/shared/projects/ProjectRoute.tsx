import type { Domain } from "@/app/permissions/permissions";
import { useDomain } from "@/app/routing/domainContext";
import Empty from "@/shared/components/Feedback/Empty";
import DesignOverview from "../../design/projects/DesignOverview";
import ProjectHistoryTab from "../../design/projects/history/ProjectHistoryTab";
import ProjectPage, { type ProjectPanels } from "./ProjectPage";

/** Stands in for a domain's overview until its phase of docs/build-plan.md lands. */
const onItsWay = () => (
    <div className="panel mt">
        <Empty art="projects" title="On its way" text="The project overview is still being built." />
    </div>
);

/** Each domain's Overview and Timeline tabs. Execution's arrive in phase 6. */
const PANELS: Record<Domain, ProjectPanels> = {
    design: { overview: (project) => <DesignOverview project={project} />, timeline: (project) => <ProjectHistoryTab project={project} /> },
    execution: { overview: onItsWay },
};

/** A project page with its domain's panels. */
export default function ProjectRoute() {
    return <ProjectPage panels={PANELS[useDomain()]} />;
}
