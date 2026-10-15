import { useSearchParams } from "react-router";
import { Segmented } from "@/shared/components/Forms/Filters";
import type { Project } from "../../../shared/projects/projectsApi";
import { PORTAL_SECTIONS, SECTION_LABEL, type PortalSection } from "./contentApi";
import PortalSectionView from "./PortalSectionView";

/**
 * A Design project's Project files tab, for everyone who sees the project: all its files, one section each, kept in
 * the link (?part=model). Anyone uploads; a file's uploader or a project_files:manage holder changes it; managers set
 * the order; client_portal:manage holders choose the client's files.
 */
export default function ProjectFilesTab({ project }: { project: Project }) {
    const [params, setParams] = useSearchParams();
    const part: PortalSection = PORTAL_SECTIONS.find((s) => s === params.get("part")) ?? PORTAL_SECTIONS[0];

    function choose(next: PortalSection) {
        const link = new URLSearchParams(params);
        if (next === PORTAL_SECTIONS[0]) link.delete("part");
        else link.set("part", next);
        setParams(link, { replace: true });
    }

    return (
        <>
            <div className="pc-parts">
                <Segmented value={part} onChange={choose} aria-label="Project files"
                    options={PORTAL_SECTIONS.map((s) => ({ value: s, label: SECTION_LABEL[s] }))} />
            </div>
            <PortalSectionView key={part} project={project} section={part} mode="files" />
        </>
    );
}
