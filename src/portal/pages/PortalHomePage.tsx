import { Link } from "react-router";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import { useBranding } from "@/shared/components/Identity/useBranding";
import Icon from "@/shared/icons/Icon";
import PortalTopBar from "../PortalTopBar";
import { accountName, usePortalSession } from "../portalSession";

/** The signed-in client's start page: who they are and the projects shared with them, each leading to its page. */
export default function PortalHomePage() {
    const { account } = usePortalSession();
    const branding = useBranding();
    if (!account) return null;
    const name = accountName(account);

    return (
        <div className="portal">
            <PortalTopBar />

            <main className="portal-main">
                <h1 className="page-title">Welcome, {account.firstName || name}</h1>
                <p className="page-sub">Your projects with {branding.data?.name || "us"}.</p>

                {account.projects.length === 0 ? (
                    <div className="panel mt">
                        <Empty art="projects" title="No project is shared with you right now"
                            text="When your project team invites you to a project, it appears here." />
                    </div>
                ) : (
                    <div className="portal-projects mt">
                        {account.projects.map((project) => (
                            <Link key={project.id} to={`/portal/projects/${project.id}`} className="panel portal-project">
                                <div className="panel-body">
                                    <div className="spread" style={{ gap: 10, alignItems: "flex-start" }}>
                                        <h2 className="portal-project-title">{project.title}</h2>
                                        <StatusBadge status={project.status} />
                                    </div>
                                    <span className="portal-project-open">View project<Icon name="arrowRight" /></span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
