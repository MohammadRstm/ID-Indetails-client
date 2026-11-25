import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS, hasSeveralAreas } from "@/app/routing/areas";
import { domainHome, homePath, websiteHome } from "@/app/routing/home";
import { companyNav } from "@/app/routing/routeTable";
import { fullName, useCurrentUser, useSession } from "@/app/session/useSession";
import Avatar from "@/shared/components/Identity/Avatar";
import Logo from "@/shared/components/Identity/Logo";
import { COMPANY_MARK, COMPANY_MARK_BOX } from "@/shared/components/Identity/companyMark";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import NotificationBell from "@/domains/shared/notifications/NotificationBell";
import NotificationChime from "@/domains/shared/notifications/NotificationChime";
import { companyToday } from "@/shared/format/time";
import { useIsPhone } from "@/shared/hooks/useIsPhone";
import Icon from "@/shared/icons/Icon";
import BottomNav from "./BottomNav";
import MessagesButton from "./MessagesButton";
import { myProfilePath } from "./profilePath";
import SearchPalette from "./SearchPalette";
import { useCompanySettings } from "./shellQueries";
import { useArea } from "./useArea";
import { loadFailed } from "@/api/queryState";

type Overview = Schemas["CompanyOverviewResponse"];

/**
 * Where someone who can reach several areas starts: pick Design, Execution or the company overview, or one of the
 * services (the website, and social media to come). Each card shows only to whoever may open it. Above them are the
 * person's own picture (opening their profile), name and email, and beside the logo Messages, the bell and Settings.
 * Behind it all, the company's mark and name, large and faintly green.
 */
export default function CompanyLauncher() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const companyPages = companyNav(permissions);
    const user = useCurrentUser();
    const { signOut } = useSession();
    const company = useCompanySettings();
    const area = useArea();
    const phone = useIsPhone();
    const [searching, setSearching] = useState(false);
    const today = companyToday();
    const overview = useQuery({
        queryKey: ["company", "overview", `${today.slice(0, 7)}-01`, today],
        queryFn: async () => (await http.get<Overview>("/company/overview", { params: { from: `${today.slice(0, 7)}-01`, to: today } })).data,
        enabled: permissions.has(P.COMPANY_VIEW),
    });

    if (!hasSeveralAreas(permissions)) return <Navigate to={homePath(permissions)} replace />;

    const both = permissions.visibleDomains.length === 2;
    const profile = myProfilePath(permissions, area, user.id);
    // the company's Settings for whoever sees the company, otherwise their first business's (the theme is in both)
    const settings = permissions.has(P.COMPANY_VIEW) ? "/company/settings" : `/${permissions.visibleDomains[0] ?? "design"}/settings`;
    const picture = <Avatar person={{ name: fullName(user), photoFileId: user.photoFileId }} size={44} />;
    return (
        <>
        <div className="launcher">
            <Backdrop />
            <div className="launcher-inner">
                <div className="row" style={{ gap: 11, marginBottom: 26 }}>
                    <Logo size={32} />
                    <div>
                        <div className="logo-name" style={{ fontSize: 15 }}>ID InDetails</div>
                        <div className="logo-sub">{company.data?.name ?? ""}</div>
                    </div>
                    <span className="grow" />
                    {/* a phone has Chat and Alerts in the bottom bar; the bell's sound stays */}
                    {phone ? <NotificationChime /> : (
                        <>
                            <MessagesButton messagesPath="/company/messages" />
                            <NotificationBell allPath="/company/notifications" />
                        </>
                    )}
                    <button className="icon-btn" onClick={() => navigate(settings)} aria-label="Settings" title="Settings">
                        <Icon name="settings" />
                    </button>
                </div>

                <div className="launch-me">
                    {profile
                        ? <button type="button" className="launch-me-pic" onClick={() => navigate(profile)} aria-label="Open your profile" title="Open your profile">{picture}</button>
                        : picture}
                    <div style={{ minWidth: 0 }}>
                        <div className="launch-me-name trunc">{fullName(user)}</div>
                        <div className="muted trunc" style={{ fontSize: 12.5 }}>{user.email}</div>
                    </div>
                </div>

                <h1 className="launch-h">What would you like to manage?</h1>
                {both && <p className="muted" style={{ marginTop: 5 }}>You can see both businesses.</p>}

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
        <BottomNav area={area} onSearch={() => setSearching(true)} />
        {searching && <SearchPalette area={area} onClose={() => setSearching(false)} />}
        </>
    );
}

/**
 * The company's mark and name behind the launcher, as on its logo, tinted with the accent green, and half of the mark
 * coming in from each side (up on the left, down on the right), fading out towards the middle as on the PDFs a client
 * receives. Decoration only.
 */
function Backdrop() {
    const mark = (className: string) => <svg viewBox={COMPANY_MARK_BOX} className={className}><path d={COMPANY_MARK} /></svg>;
    return (
        <div className="launch-backdrop" aria-hidden="true">
            <div className="launch-backdrop-center">
                {mark("launch-backdrop-mark")}
                <div className="launch-backdrop-name">ID-INDETAILS</div>
            </div>
            {mark("launch-ring left")}
            {mark("launch-ring right")}
        </div>
    );
}
