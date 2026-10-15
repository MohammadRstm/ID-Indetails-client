import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { toApiError } from "@/api/errors";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Icon from "@/shared/icons/Icon";
import PortalTopBar from "../PortalTopBar";
import PresentationHero from "../presentation/PresentationHero";
import PresentationSkeleton from "../presentation/PresentationSkeleton";
import PresentationView from "../presentation/PresentationView";
import { getPortalLink, usePortalPresentation } from "../projectsApi";

/** A project the client has been given: what its team has published, in the same page the team previews. */
export default function PortalProjectPage() {
    const projectId = Number(useParams().projectId);

    return (
        <div className="portal pp-page">
            <PortalTopBar />
            <main className="pp-wrap">
                {Number.isInteger(projectId) && projectId > 0 ? <ProjectBody projectId={projectId} /> : <Unavailable />}
            </main>
        </div>
    );
}

function ProjectBody({ projectId }: { projectId: number }) {
    const query = usePortalPresentation(projectId);
    const presentation = query.data;

    // anything the client may not see answers 404, the same every time
    if (query.isError && toApiError(query.error).status === 404) return <Unavailable />;

    if (presentation) {
        return (
            <Page>
                {presentation.isPublished ? (
                    <PresentationView
                        presentation={presentation}
                        getLink={(itemId, inline) => getPortalLink(projectId, itemId, inline)}
                        onLinkExpired={() => void query.refetch()}
                    />
                ) : (
                    <>
                        <PresentationHero presentation={presentation} onBroken={() => {}} />
                        <div className="panel mt">
                            <Empty art="projects" title="Nothing shared yet" text="Your project team hasn't shared anything here yet." />
                        </div>
                    </>
                )}
            </Page>
        );
    }

    if (query.isError) return <Page><LoadError error={query.error} what="this project" retry={() => void query.refetch()} /></Page>;
    return <Page><PresentationSkeleton /></Page>;
}

/** The way back to the client's projects, then the page. */
function Page({ children }: { children: ReactNode }) {
    return (
        <>
            <Link className="pp-back" to="/portal"><Icon name="chevronLeft" />All projects</Link>
            {children}
        </>
    );
}

function Unavailable() {
    return (
        <div className="panel mt">
            <Empty art="search" title="This project isn't available" text="If you think you should see it, ask your project contact."
                action={<Link className="btn btn-sm" to="/portal">Back to your projects</Link>} />
        </div>
    );
}
