import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDiscussionSummary } from "@/portal/discussion/discussionApi";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Segmented } from "@/shared/components/Forms/Filters";
import type { Project } from "../../../shared/projects/projectsApi";
import ClientAccessPanel from "./ClientAccessPanel";
import { PORTAL_SECTIONS, SECTION_LABEL, type PortalSection } from "./contentApi";
import DiscussionPart from "./DiscussionPart";
import PortalSectionView from "./PortalSectionView";
import PresentationPreview from "./PresentationPreview";
import PublishBar from "./PublishBar";
import { staffDiscussion } from "./staffDiscussion";

type Part = PortalSection | "access" | "discussion";

/**
 * A Design client project's Client portal tab: the files being prepared for the client, one section each
 * (client_portal:manage), with where publishing stands above them, who of the client's contacts can follow the
 * project (client_access:manage), and the Discussion with them, which belongs to whoever takes part in it whatever
 * their permissions (the server says: the summary answers 404 to anyone else). The part shown is kept in the link
 * (?part=model), and starts on the first one the person may see. So is the preview of what clients would get
 * (?preview=1), which a reload keeps open.
 */
export default function ClientPortalTab({ project }: { project: Project }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const discussion = useDiscussionSummary(staffDiscussion, project.id, { retry: false });
    const manages = permissions.has(P.CLIENT_PORTAL_MANAGE);
    const parts: Part[] = [
        ...(manages ? PORTAL_SECTIONS : []),
        ...(permissions.has(P.CLIENT_ACCESS_MANAGE) ? ["access" as const] : []),
        ...(discussion.isSuccess ? ["discussion" as const] : []),
    ];
    const requested = params.get("part");
    // a part the person may not open falls back to their first one, even when the link asks for it
    const part = parts.find((p) => p === requested) ?? parts[0];
    // the preview is of the files: only for someone who manages them, whatever the link asks for
    const previewing = manages && params.get("preview") === "1";
    const unread = (discussion.data?.unreadMessages ?? 0) + (discussion.data?.unreadComments ?? 0);

    function choose(next: Part) {
        const link = new URLSearchParams(params);
        if (next === parts[0]) link.delete("part");
        else link.set("part", next);
        // a file's comments belong to the Discussion
        link.delete("item");
        setParams(link, { replace: true });
    }

    function preview(open: boolean) {
        const link = new URLSearchParams(params);
        if (open) link.set("preview", "1");
        else link.delete("preview");
        setParams(link, { replace: true });
    }

    // a link to the Discussion waits for the answer that says whether this person takes part
    if (requested === "discussion" && discussion.isPending) return <SkeletonLines lines={6} />;
    if (!part) return null;
    return (
        <>
            {PORTAL_SECTIONS.some((s) => s === part) && <PublishBar projectId={project.id} onPreview={() => preview(true)} />}
            {parts.length > 1 && (
                <div className="pc-parts">
                    <Segmented value={part} onChange={choose} aria-label="Client portal"
                        options={parts.map((p) => ({
                            value: p,
                            label: p === "discussion"
                                ? <>Discussion{unread > 0 && <> <span className="dp-badge" aria-hidden="true">{unread}</span><span className="sr"> {unread} unread</span></>}</>
                                : p === "access" ? "Client access" : SECTION_LABEL[p],
                        }))} />
                </div>
            )}
            {part === "access" ? <ClientAccessPanel project={project} />
                : part === "discussion" ? <DiscussionPart project={project} />
                    : <PortalSectionView key={part} project={project} section={part} />}
            {previewing && <PresentationPreview project={project} onClose={() => preview(false)} />}
        </>
    );
}
