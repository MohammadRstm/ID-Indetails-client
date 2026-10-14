import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Icon from "@/shared/icons/Icon";
import ChatPanel from "../discussion/ChatPanel";
import { clientDiscussion } from "../discussion/clientDiscussion";
import CommentThreadPanel from "../discussion/CommentThreadPanel";
import CommentThreadsList from "../discussion/CommentThreadsList";
import DiscussionDrawer from "../discussion/DiscussionDrawer";
import { useDiscussionSummary } from "../discussion/discussionApi";
import SummaryGate from "../discussion/SummaryGate";
import PortalTopBar from "../PortalTopBar";
import PresentationHero from "../presentation/PresentationHero";
import PresentationSkeleton from "../presentation/PresentationSkeleton";
import PresentationView from "../presentation/PresentationView";
import { isMedia, type PresentationComments } from "../presentation/presentationTypes";
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

/** Which of the page's discussion views is open. It lives in the link: ?chat=1, ?comments=1, ?item={id} (one file's comments). */
type View = { chat?: true; comments?: true; item?: number };

function ProjectBody({ projectId }: { projectId: number }) {
    const query = usePortalPresentation(projectId);
    const discussion = useDiscussionSummary(clientDiscussion, projectId);
    const [params, setParams] = useSearchParams();
    const presentation = query.data;
    const summary = discussion.data;

    const itemParam = Number(params.get("item"));
    const openItemId = Number.isInteger(itemParam) && itemParam > 0 ? itemParam : null;

    // Opening a view is a step in the history (Back closes it); closing one, or moving between files, replaces the step.
    function show(view: View, replace = false) {
        const next = new URLSearchParams(params);
        next.delete("chat");
        next.delete("comments");
        next.delete("item");
        if (view.chat) next.set("chat", "1");
        if (view.comments) next.set("comments", "1");
        if (view.item != null) next.set("item", String(view.item));
        setParams(next, { replace });
    }

    // anything the client may not see answers 404, the same every time
    if (query.isError && toApiError(query.error).status === 404) return <Unavailable />;

    if (presentation) {
        const openItem = openItemId == null ? undefined : presentation.sections.flatMap((s) => s.items).find((i) => i.id === openItemId);
        // A picture or a video opens in the lightbox with its comments beside it (it waits for the summary); any other file in the drawer.
        const inLightbox = presentation.isPublished && openItem != null && isMedia(openItem) && !loadFailed(discussion);
        const open: "chat" | "list" | "thread" | null = openItemId != null ? (inLightbox ? null : "thread")
            : params.get("comments") === "1" ? "list" : params.get("chat") === "1" ? "chat" : null;
        const close = () => show({}, true);

        const comments: PresentationComments | undefined = summary && {
            threads: summary.threads,
            openItemId,
            onOpen: (itemId) => show(itemId == null ? {} : { item: itemId }, itemId == null || openItemId != null),
            renderThread: (item) => (
                <CommentThreadPanel discussion={clientDiscussion} projectId={projectId} itemId={item.id} summary={summary}
                    fallback={{ title: item.title, fileName: item.name }} hideTitle />
            ),
        };

        return (
            <Page actions={(
                <>
                    <button type="button" className="btn btn-sm" onClick={() => show({ chat: true })}>
                        <Icon name="chat" />Messages<Unread count={summary?.unreadMessages ?? 0} />
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => show({ comments: true })}>
                        <Icon name="file" />Comments<Unread count={summary?.unreadComments ?? 0} />
                    </button>
                </>
            )}>
                {presentation.isPublished ? (
                    <PresentationView
                        presentation={presentation}
                        getLink={(itemId, inline) => getPortalLink(projectId, itemId, inline)}
                        onLinkExpired={() => void query.refetch()}
                        comments={comments}
                    />
                ) : (
                    <>
                        <PresentationHero presentation={presentation} onBroken={() => {}} />
                        <div className="panel mt">
                            <Empty art="projects" title="Nothing shared yet" text="Your project team hasn't shared anything here yet." />
                        </div>
                    </>
                )}
                {open === "chat" && (
                    <DiscussionDrawer title="Messages" onClose={close}>
                        <SummaryGate discussion={clientDiscussion} projectId={projectId}>
                            {(s) => <ChatPanel discussion={clientDiscussion} projectId={projectId} summary={s} />}
                        </SummaryGate>
                    </DiscussionDrawer>
                )}
                {open === "list" && (
                    <DiscussionDrawer title="Comments" onClose={close}>
                        <SummaryGate discussion={clientDiscussion} projectId={projectId}>
                            {(s) => <CommentThreadsList threads={s.threads} onOpen={(itemId) => show({ item: itemId })} />}
                        </SummaryGate>
                    </DiscussionDrawer>
                )}
                {open === "thread" && openItemId != null && (
                    <DiscussionDrawer title="Comments" onClose={close} onBack={{ label: "All comments", go: () => show({ comments: true }, true) }}>
                        <SummaryGate discussion={clientDiscussion} projectId={projectId}>
                            {(s) => (
                                <CommentThreadPanel discussion={clientDiscussion} projectId={projectId} itemId={openItemId} summary={s}
                                    fallback={openItem && { title: openItem.title, fileName: openItem.name }} />
                            )}
                        </SummaryGate>
                    </DiscussionDrawer>
                )}
            </Page>
        );
    }

    if (query.isError) return <Page><LoadError error={query.error} what="this project" retry={() => void query.refetch()} /></Page>;
    return <Page><PresentationSkeleton /></Page>;
}

/** How many are new, on a button. */
function Unread({ count }: { count: number }) {
    if (count <= 0) return null;
    return <> <span className="dp-badge">{count}<span className="sr"> unread</span></span></>;
}

/** The way back to the client's projects and, on the right, the buttons that open the project's messages and comments; then the page. */
function Page({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
    return (
        <>
            <div className="pp-topline">
                <Link className="pp-back" to="/portal"><Icon name="chevronLeft" />All projects</Link>
                {actions && <div className="pp-topline-actions">{actions}</div>}
            </div>
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
