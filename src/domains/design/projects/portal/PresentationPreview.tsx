import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import PresentationSkeleton from "@/portal/presentation/PresentationSkeleton";
import PresentationView from "@/portal/presentation/PresentationView";
import type { PortalPresentation } from "@/portal/presentation/presentationTypes";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Icon from "@/shared/icons/Icon";
import { getPreviewLink, usePresentationPreview } from "./previewApi";

const nothingYet = (p: PortalPresentation) => p.heroes.length === 0 && !p.summary && p.sections.every((s) => s.items.length === 0);

/**
 * The project's page as the client would get it from the draft, on a page of its own: the Client portal tab's Preview
 * opens it in a new browser tab, without the staff app around it. It is the client's own page (PresentationView), so
 * nothing here can be edited: a banner says it is a preview, and Close closes the tab.
 */
export default function PresentationPreview({ projectId }: { projectId: number }) {
    const navigate = useNavigate();
    const preview = usePresentationPreview(projectId);
    const presentation = preview.data;

    function close() {
        window.close();
        // a tab the app didn't open itself (the link opened by hand) can't be closed: back to the project's Client portal tab
        if (!window.closed) navigate(`/design/projects/${projectId}?tab=portal`);
    }

    let body: ReactNode;
    if (presentation) {
        body = nothingYet(presentation) ? (
            <div className="panel mt">
                <Empty art="projects" title="Nothing to preview yet"
                    text="Choose files for the client in Project files, and your draft appears here as clients will see it." />
            </div>
        ) : (
            <PresentationView
                presentation={presentation}
                getLink={(itemId, inline) => getPreviewLink(projectId, itemId, inline)}
                onLinkExpired={() => void preview.refetch()}
            />
        );
    } else if (preview.isError) {
        body = <LoadError error={preview.error} what="the preview" retry={() => void preview.refetch()} />;
    } else {
        body = <PresentationSkeleton />;
    }

    return (
        <div className="portal pp-page pp-preview">
            <div className="pp-preview-banner" role="region" aria-label="Preview">
                <Icon name="eye" />
                <p><b>Preview — what the client would see</b> <span className="pp-preview-sub">Clients won't see your draft until you publish.</span></p>
                <button type="button" className="btn btn-sm" onClick={close}><Icon name="x" />Close</button>
            </div>
            <main className="pp-wrap">{body}</main>
        </div>
    );
}
