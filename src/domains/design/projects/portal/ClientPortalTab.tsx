import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Segmented } from "@/shared/components/Forms/Filters";
import type { Project } from "../../../shared/projects/projectsApi";
import ClientAccessPanel from "./ClientAccessPanel";
import { PORTAL_SECTIONS, SECTION_LABEL, type PortalSection } from "./contentApi";
import PortalSectionView from "./PortalSectionView";
import PresentationPreview from "./PresentationPreview";
import PublishBar from "./PublishBar";

type Part = PortalSection | "access";

/**
 * A Design client project's Client portal tab: the files being prepared for the client, one section each
 * (client_portal:manage), with where publishing stands above them, and who of the client's contacts can follow the
 * project (client_access:manage). The part shown is kept in the link (?part=model), and starts on the first one the
 * person may see. So is the preview of what clients would get (?preview=1), which a reload keeps open.
 */
export default function ClientPortalTab({ project }: { project: Project }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const parts: Part[] = [
        ...(permissions.has(P.CLIENT_PORTAL_MANAGE) ? PORTAL_SECTIONS : []),
        ...(permissions.has(P.CLIENT_ACCESS_MANAGE) ? ["access" as const] : []),
    ];
    const requested = params.get("part");
    // a part the person may not open falls back to their first one, even when the link asks for it
    const part = parts.find((p) => p === requested) ?? parts[0];
    // the preview is of the files: only for someone who manages them, whatever the link asks for
    const previewing = permissions.has(P.CLIENT_PORTAL_MANAGE) && params.get("preview") === "1";

    function choose(next: Part) {
        const link = new URLSearchParams(params);
        if (next === parts[0]) link.delete("part");
        else link.set("part", next);
        setParams(link, { replace: true });
    }

    function preview(open: boolean) {
        const link = new URLSearchParams(params);
        if (open) link.set("preview", "1");
        else link.delete("preview");
        setParams(link, { replace: true });
    }

    if (!part) return null;
    return (
        <>
            {part !== "access" && <PublishBar projectId={project.id} onPreview={() => preview(true)} />}
            {parts.length > 1 && (
                <div className="pc-parts">
                    <Segmented value={part} onChange={choose} aria-label="Client portal"
                        options={parts.map((p) => ({ value: p, label: p === "access" ? "Client access" : SECTION_LABEL[p] }))} />
                </div>
            )}
            {part === "access" ? <ClientAccessPanel project={project} /> : <PortalSectionView key={part} project={project} section={part} />}
            {previewing && <PresentationPreview project={project} onClose={() => preview(false)} />}
        </>
    );
}
