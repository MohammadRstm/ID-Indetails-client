import { useSearchParams } from "react-router";
import { Segmented } from "@/shared/components/Forms/Filters";
import type { Project } from "../../../shared/projects/projectsApi";
import { PORTAL_SECTIONS, SECTION_LABEL, type PortalSection } from "./contentApi";
import FileComments from "./FileComments";
import { useProjectFiles } from "./filesApi";
import PortalSectionView from "./PortalSectionView";

const idOf = (value: string | null) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * A Design project's Project files tab, for everyone who sees the project: all its files, one section each, kept in
 * the link (?part=model). Anyone uploads; a file's uploader or a project_files:manage holder changes it; managers set
 * the order; client_portal:manage holders choose the client's files. A file's comments open in a panel beside them
 * (?comments={itemId}); a link that names only the file opens the section it is in.
 */
export default function ProjectFilesTab({ project }: { project: Project }) {
    const [params, setParams] = useSearchParams();
    const files = useProjectFiles(project.id);
    const commentsOn = idOf(params.get("comments"));
    const requested = PORTAL_SECTIONS.find((s) => s === params.get("part"));
    const holder = files.data?.items.find((item) => item.id === commentsOn)?.section;
    const part: PortalSection = requested ?? holder ?? PORTAL_SECTIONS[0];

    function choose(next: PortalSection) {
        const link = new URLSearchParams(params);
        if (next === PORTAL_SECTIONS[0]) link.delete("part");
        else link.set("part", next);
        link.delete("comments");
        setParams(link, { replace: true });
    }

    function openComments(itemId: number) {
        const link = new URLSearchParams(params);
        link.set("comments", String(itemId));
        setParams(link);
    }

    function closeComments() {
        const link = new URLSearchParams(params);
        link.delete("comments");
        // the section stays the one the file is in, which the link may only have known from the file
        if (part !== PORTAL_SECTIONS[0]) link.set("part", part);
        setParams(link, { replace: true });
    }

    return (
        <>
            <div className="pc-parts">
                <Segmented value={part} onChange={choose} aria-label="Project files"
                    options={PORTAL_SECTIONS.map((s) => ({ value: s, label: SECTION_LABEL[s] }))} />
            </div>
            <PortalSectionView key={part} project={project} section={part} mode="files" onComments={openComments} />
            {commentsOn != null && <FileComments projectId={project.id} itemId={commentsOn} onClose={closeComments} />}
        </>
    );
}
