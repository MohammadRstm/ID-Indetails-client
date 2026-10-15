import { useState } from "react";
import { Link } from "react-router";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import Select, { type SelectOption } from "@/shared/components/Forms/Select";
import { useBranding } from "@/shared/components/Identity/useBranding";
import Icon from "@/shared/icons/Icon";
import { usePortalMe } from "../notifications/notificationsApi";
import type { PortalProject } from "../portalApi";
import PortalTopBar from "../PortalTopBar";
import { accountName, usePortalSession } from "../portalSession";

type Sort = "newest" | "activity" | "published";

const SORTS: SelectOption<Sort>[] = [
    { value: "newest", label: "Newest project" },
    { value: "activity", label: "Latest activity" },
    { value: "published", label: "Last published" },
];

/** The order this browser was last left with. */
const SORT_KEY = "hourline.portal.projectSort";

// Site data may be blocked: the order is then the first one, and isn't kept.
function readSort(): Sort {
    try {
        const kept = localStorage.getItem(SORT_KEY);
        return kept === "activity" || kept === "published" ? kept : "newest";
    } catch {
        return "newest";
    }
}
function keepSort(sort: Sort) {
    try {
        localStorage.setItem(SORT_KEY, sort);
    } catch {
        // not kept: the page still shows it
    }
}

/** A moment to sort by, latest first; none goes last. */
const at = (instant: string | null) => (instant ? Date.parse(instant) : -Infinity);

/** The projects, latest first by the chosen moment; the newer project first when they are level. */
function sorted(projects: PortalProject[], sort: Sort): PortalProject[] {
    const moment = (p: PortalProject) => (sort === "activity" ? at(p.lastActivityAt) : sort === "published" ? at(p.lastPublishedAt) : at(p.startedOn));
    // (-Infinity less -Infinity is NaN, which counts as level)
    return [...projects].sort((a, b) => moment(b) - moment(a) || at(b.startedOn) - at(a.startedOn) || b.id - a.id);
}

/**
 * The signed-in client's start page: who they are and the projects shared with them, each a card with its hero image,
 * its state, what is unread and a red dot when there is something new, leading to its page. The newest project comes
 * first, or the one with the latest activity, or the one published last: the client's choice, kept in this browser.
 */
export default function PortalHomePage() {
    const { account } = usePortalSession();
    const branding = useBranding();
    const me = usePortalMe();
    const [sort, setSort] = useState(readSort);
    if (!account) return null;
    const name = accountName(account);
    // the API's latest answer, with its unread counts; what the sign-in said until it comes
    const projects = sorted(me.data?.projects ?? account.projects, sort);

    function choose(next: Sort) {
        setSort(next);
        keepSort(next);
    }

    return (
        <div className="portal">
            <PortalTopBar />

            <main className="portal-main">
                <h1 className="page-title">Welcome, {account.firstName || name}</h1>
                <p className="page-sub">Your projects with {branding.data?.name || "us"}.</p>

                {projects.length === 0 ? (
                    <div className="panel mt">
                        <Empty art="projects" title="No project is shared with you right now"
                            text="When your project team invites you to a project, it appears here." />
                    </div>
                ) : (
                    <>
                        {projects.length > 1 && (
                            <div className="portal-sort mt">
                                <span className="muted" aria-hidden="true">Sort by</span>
                                <Select value={sort} options={SORTS} onChange={choose} aria-label="Sort projects" className="select sm" style={{ width: 180 }} />
                            </div>
                        )}
                        <div className="portal-projects mt">
                            {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}

function ProjectCard({ project }: { project: PortalProject }) {
    return (
        <Link to={`/portal/projects/${project.id}`} className="panel portal-project">
            <Cover project={project} />
            <div className="panel-body">
                <div className="spread" style={{ gap: 10, alignItems: "flex-start" }}>
                    <h2 className="portal-project-title">{project.title}</h2>
                    <div className="row pn-badges">
                        {project.unread > 0 && (
                            <span className="badge badge-new" title="Messages and comments you haven't read">{project.unread} unread</span>
                        )}
                        <StatusBadge status={project.status} />
                    </div>
                </div>
                <span className="portal-project-open">View project<Icon name="arrowRight" /></span>
            </div>
        </Link>
    );
}

/** The project's first hero image (a calm block without one, or when it won't load), and the red dot of something new. */
function Cover({ project }: { project: PortalProject }) {
    const [failed, setFailed] = useState<string | null>(null);
    const url = project.heroUrl && project.heroUrl !== failed ? project.heroUrl : null;
    return (
        <div className="portal-cover">
            {url ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(url)} />
                : <span className="portal-cover-blank" aria-hidden="true"><Icon name="projects" /></span>}
            {project.hasNews && (
                <span className="portal-news" title="Something new since your last visit"><span className="sr">New since your last visit</span></span>
            )}
        </div>
    );
}
