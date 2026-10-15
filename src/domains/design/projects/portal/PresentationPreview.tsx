import { useEffect, useEffectEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import PresentationSkeleton from "@/portal/presentation/PresentationSkeleton";
import PresentationView from "@/portal/presentation/PresentationView";
import type { PortalPresentation } from "@/portal/presentation/presentationTypes";
import { useLayer } from "@/portal/presentation/useLayer";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import { getPreviewLink, usePresentationPreview } from "./previewApi";

const nothingYet = (p: PortalPresentation) => !p.hero && !p.summary && p.sections.every((s) => s.items.length === 0);

/**
 * The project's page as the client would get it from the draft, over the whole app. It is the client's own page
 * (PresentationView), so nothing here can be edited: a banner says it is a draft and closes it.
 */
export default function PresentationPreview({ project, onClose }: { project: Project; onClose: () => void }) {
    const layer = useLayer<HTMLDivElement>();
    const preview = usePresentationPreview(project.id);
    const presentation = preview.data;

    // Escape closes the preview, unless a picture is open over it: that closes first
    const onKey = useEffectEvent((e: KeyboardEvent) => {
        if (e.key !== "Escape" || document.querySelector(".pp-lightbox")) return;
        e.stopPropagation();
        onClose();
    });
    useEffect(() => {
        const listener = (e: KeyboardEvent) => onKey(e);
        window.addEventListener("keydown", listener, true);
        return () => window.removeEventListener("keydown", listener, true);
    }, []);

    let body: ReactNode;
    if (presentation) {
        body = nothingYet(presentation) ? (
            <div className="panel mt">
                <Empty art="projects" title="Nothing to preview yet"
                    text="Add files to Presentation, 3D or Drawings, and your draft appears here as clients will see it." />
            </div>
        ) : (
            <PresentationView
                presentation={presentation}
                getLink={(itemId, inline) => getPreviewLink(project.id, itemId, inline)}
                onLinkExpired={() => void preview.refetch()}
            />
        );
    } else if (preview.isError) {
        body = <LoadError error={preview.error} what="the preview" retry={() => void preview.refetch()} />;
    } else {
        body = <PresentationSkeleton />;
    }

    return createPortal(
        <div ref={layer} className="pp-preview" role="dialog" aria-modal="true" aria-label={`Draft preview of ${project.title}`} tabIndex={-1}>
            <div className="pp-preview-banner">
                <Icon name="eye" />
                <p>Preview of your draft. Clients won't see these changes until you publish.</p>
                <button type="button" className="btn btn-sm" onClick={onClose}>Close preview</button>
            </div>
            <div className="pp-preview-scroll">
                <div className="pp-wrap">{body}</div>
            </div>
        </div>,
        document.body,
    );
}
