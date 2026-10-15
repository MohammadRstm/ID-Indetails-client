import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import Logo from "@/shared/components/Identity/Logo";
import { useBranding } from "@/shared/components/Identity/useBranding";
import Icon from "@/shared/icons/Icon";
import { usePortalSession } from "../portalSession";

/**
 * The signed-in client's start page: who they are and the projects shared with them. Each project's presentation, 3D
 * and drawings come in a later phase; for now the list says what is coming.
 */
export default function PortalHomePage() {
    const { account, signOut } = usePortalSession();
    const branding = useBranding();
    if (!account) return null;
    const name = `${account.firstName} ${account.lastName}`.trim() || account.email;

    return (
        <div className="portal">
            <header className="portal-top">
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                    <Logo size={30} />
                    <div style={{ minWidth: 0 }}>
                        <div className="logo-name trunc">{branding.data?.name || "ID InDetails"}</div>
                        <div className="logo-sub">Client portal</div>
                    </div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                    <span className="muted trunc portal-who">{name}</span>
                    <button type="button" className="btn btn-sm" onClick={() => void signOut()}><Icon name="logout" />Sign out</button>
                </div>
            </header>

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
                            <div key={project.id} className="panel portal-project">
                                <div className="panel-body">
                                    <div className="spread" style={{ gap: 10, alignItems: "flex-start" }}>
                                        <h2 className="portal-project-title">{project.title}</h2>
                                        <StatusBadge status={project.status} />
                                    </div>
                                    <p className="muted" style={{ marginTop: 8 }}>
                                        Your project's presentation, 3D renders and drawings will appear here once your project team shares them.
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
