import { useParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import NotAuthorized from "@/app/pages/NotAuthorized";
import NotFound from "@/app/pages/NotFound";
import PresentationPreview from "./PresentationPreview";

/**
 * The preview of what a project's client would get, on its own page (previewPath), outside the staff shell: the Client
 * portal tab's Preview opens it in a new browser tab. It is for those who see the client's files in that tab, whoever
 * chooses them (client_portal:manage) or invites the client (client_access:manage). The API checks again.
 */
export default function PortalPreviewPage() {
    const projectId = Number(useParams().id);
    const permissions = usePermissions();
    const seesFiles = permissions.canSeeDomain("design") && (permissions.has(P.CLIENT_PORTAL_MANAGE) || permissions.has(P.CLIENT_ACCESS_MANAGE));
    if (!seesFiles) return <NotAuthorized />;
    if (!Number.isInteger(projectId) || projectId <= 0) return <NotFound what="project" />;
    return <PresentationPreview projectId={projectId} />;
}
