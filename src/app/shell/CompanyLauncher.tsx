import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS, hasSeveralAreas } from "@/app/routing/areas";
import { domainHome, homePath, websiteHome } from "@/app/routing/home";
import { companyNav } from "@/app/routing/routeTable";
import { fullName, useCurrentUser, useSession } from "@/app/session/useSession";
import ThemeToggle from "@/shared/components/Buttons/ThemeToggle";
import Logo from "@/shared/components/Identity/Logo";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import NotificationBell from "@/domains/shared/notifications/NotificationBell";
import { companyToday } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useCompanySettings } from "./shellQueries";
import { loadFailed } from "@/api/queryState";

type Overview = Schemas["CompanyOverviewResponse"];

/**
 * Where someone who can reach several areas starts: pick Design, Execution or the company overview, or one of the
 * services (the website, and social media to come). Each card shows only to whoever may open it.
 */
export default function CompanyLauncher() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const companyPages = companyNav(permissions);
    const user = useCurrentUser();
    const { signOut } = useSession();
    const company = useCompanySettings();
    const today = companyToday();
    const overview = useQuery({
        queryKey: ["company", "overview", `${today.slice(0, 7)}-01`, today],
        queryFn: async () => (await http.get<Overview>("/company/overview", { params: { from: `${today.slice(0, 7)}-01`, to: today } })).data,
        enabled: permissions.has(P.COMPANY_VIEW),
    });

    if (!hasSeveralAreas(permissions)) return <Navigate to={homePath(permissions)} replace />;

    const both = permissions.visibleDomains.length === 2;
    return (
        <div className="launcher">
            <div className="launcher-inner">
                <div className="row" style={{ gap: 11, marginBottom: 26 }}>
                    <Logo size={32} />
                    <div>
                        <div className="logo-name" style={{ fontSize: 15 }}>ID InDetails</div>
                        <div className="logo-sub">{company.data?.name ?? ""}</div>
                    </div>
                    <span className="grow" />
                    <ThemeToggle />
                    <NotificationBell allPath="/company/notifications" />
                </div>

                <h1 className="launch-h">What would you like to manage?</h1>
                <p className="muted" style={{ marginTop: 5 }}>
                    Signed in as <b className="sec">{fullName(user)}</b>{both ? " · you can see both businesses." : "."}
                </p>

                <div className="launch-grid mt">
                    {permissions.visibleDomains.map((domain) => {
                        const figures = overview.data?.domains.find((d) => d.domain === domain);
                        return (
                            <button key={domain} className="launch-tile" onClick={() => navigate(domainHome(permissions, domain))}>
                                <span className="launch-ic"><Icon name={AREAS[domain].icon} /></span>
                                <span className="launch-body">
                                    <span className="launch-name">{AREAS[domain].label}</span>
                                    <span className="launch-sub">{AREAS[domain].tagline}</span>
                                    {permissions.has(P.COMPANY_VIEW) && (
                                        <span className="launch-meta">
                                            {figures
                                                ? `${figures.activeProjects} project${figures.activeProjects === 1 ? "" : "s"} · ${figures.people} ${figures.people === 1 ? "person" : "people"}`
                                                : <Skeleton width={120} height={10} />}
                                        </span>
                                    )}
                                </span>
                                <Icon name="chevronRight" />
                            </button>
                        );
                    })}
                    {!permissions.has(P.COMPANY_VIEW) && companyPages.length > 0 && (
                        // some company pages without the overview (salaries, schedules or expenses granted alone)
                        <button className="launch-tile wide" onClick={() => navigate(`/company/${companyPages[0].path}`)}>
                            <span className="launch-ic"><Icon name="chartTile" /></span>
                            <span className="launch-body">
                                <span className="launch-name">Company</span>
                                <span className="launch-sub">{companyPages.map((c) => c.label).join(" · ")}</span>
                            </span>
                            <Icon name="chevronRight" />
                        </button>
                    )}
                    {permissions.has(P.COMPANY_VIEW) && (
                        <button className="launch-tile wide" onClick={() => navigate("/company/overview")}>
                            <span className="launch-ic"><Icon name="chartTile" /></span>
                            <span className="launch-body">
                                <span className="launch-name">Company overview</span>
                                <span className="launch-sub">Both businesses together, and what the company keeps</span>
                                <span className="launch-meta">
                                    {overview.data
                                        ? `Net profit this month ${money.short(overview.data.netProfit)}`
                                        : loadFailed(overview) ? "Figures unavailable right now" : <Skeleton width={150} height={10} />}
                                </span>
                            </span>
                            <Icon name="chevronRight" />
                        </button>
                    )}
                </div>

                {(permissions.hasWebsiteArea || permissions.isSuperAdmin) && (
                    <>
                        <h2 className="launch-sec">Services</h2>
                        <div className="launch-grid">
                            {permissions.hasWebsiteArea && (
                                <button className="launch-tile" onClick={() => navigate(websiteHome(permissions))}>
                                    <span className="launch-ic"><Icon name={AREAS.website.icon} /></span>
                                    <span className="launch-body">
                                        <span className="launch-name">{AREAS.website.label}</span>
                                        <span className="launch-sub">{AREAS.website.tagline}</span>
                                    </span>
                                    <Icon name="chevronRight" />
                                </button>
                            )}
                            {permissions.isSuperAdmin && (
                                <div className="launch-tile soon" aria-disabled="true">
                                    <span className="launch-ic"><Icon name="megaphone" /></span>
                                    <span className="launch-body">
                                        <span className="launch-name">Social media</span>
                                        <span className="launch-sub">The company's posts and pages</span>
                                    </span>
                                    <span className="badge">Coming soon</span>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="row spread mt" style={{ marginTop: 22 }}>
                    <p className="hint" style={{ maxWidth: "52ch" }}>
                        Design and Execution are run separately. Inside one, there is no sign the other exists - only
                        this screen joins them up.
                    </p>
                    <button className="btn btn-quiet btn-sm" onClick={() => signOut()}>
                        <Icon name="logout" />Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}
