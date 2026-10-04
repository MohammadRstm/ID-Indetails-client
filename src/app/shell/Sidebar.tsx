import { useState } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { accessLabel } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { hasSeveralAreas } from "@/app/routing/areas";
import { companyNav, domainNav, type NavItem } from "@/app/routing/routeTable";
import { fullName, useCurrentUser, useSession } from "@/app/session/useSession";
import Avatar from "@/shared/components/Identity/Avatar";
import Logo from "@/shared/components/Identity/Logo";
import Popover from "@/shared/components/Overlays/Popover";
import Icon from "@/shared/icons/Icon";
import { openLogWork } from "@/domains/design/work/logWorkStore";
import { cx } from "@/shared/utils/cx";
import { myProfilePath } from "./profilePath";
import ReportBugModal from "./ReportBugModal";
import { useCompanySettings, useNavCounts } from "./shellQueries";
import type { ShellArea } from "./useArea";

export default function Sidebar({ area }: { area: ShellArea }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const user = useCurrentUser();
    const { signOut } = useSession();
    const [reporting, setReporting] = useState(false);
    const company = useCompanySettings();
    const domain = area.kind === "domain" ? area.domain : null;
    const counts = useNavCounts(domain, permissions);

    const base = domain ? `/${domain}` : "/company";
    const items = domain ? domainNav(permissions, domain) : companyNav(permissions);
    const main = items.filter((item) => item.section !== "workspace");
    const workspace = items.filter((item) => item.section === "workspace");
    const me = { name: fullName(user), photoFileId: user.photoFileId, online: true };
    const label = accessLabel(permissions, user.position);

    // whoever logs Design work does it from anywhere
    const canLog = domain === "design" && permissions.hasAll(P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN);
    const peopleItem = items.find((item) => item.key === "people");
    const profilePath = myProfilePath(permissions, area, user.id);
    const settingsItem = workspace.find((item) => item.key === "settings");

    const countOf = (item: NavItem) => (item.count ? counts[item.count] : undefined);
    const renderItem = (item: NavItem) => {
        const count = countOf(item);
        return (
            <button
                key={item.key}
                className={cx("nav-item", area.section === item.key && "on")}
                onClick={() => navigate(`${base}/${item.path}`)}
            >
                <Icon name={item.icon} />
                <span className="nav-label">{item.label}</span>
                {count != null && <span className="nav-count">{count}</span>}
            </button>
        );
    };

    return (
        <aside className="side">
            <div className="side-head">
                <Logo />
                <div className="logo-text">
                    <div className="logo-name">ID InDetails</div>
                    <div className="logo-sub">{company.data?.name ?? ""}</div>
                </div>
            </div>

            {canLog && (
                <div className="side-cta">
                    <button className="btn btn-primary btn-block" onClick={() => openLogWork()}>
                        <Icon name="plus" />
                        <span className="side-cta-label">Log work</span>
                    </button>
                </div>
            )}

            <nav className="nav">
                {main.map(renderItem)}
                {workspace.length > 0 && (
                    <div>
                        <div className="nav-sec">Workspace</div>
                        {workspace.map(renderItem)}
                    </div>
                )}
                {hasSeveralAreas(permissions) && (
                    <div>
                        <div className="nav-sec">Company</div>
                        <button className="nav-item" onClick={() => navigate("/company")}>
                            <Icon name="grid" />
                            <span className="nav-label">All areas</span>
                        </button>
                    </div>
                )}
            </nav>

            <div className="side-foot">
                <Popover
                    align="left"
                    width={250}
                    hostClass="grow"
                    trigger={(_, toggle) => (
                        <button className="side-user" onClick={toggle}>
                            <Avatar person={me} size={30} presence />
                            <div className="side-user-txt grow" style={{ minWidth: 0 }}>
                                <div className="side-user-name trunc">{me.name}</div>
                                <div className="side-user-role trunc">{label}</div>
                            </div>
                        </button>
                    )}
                >
                    {(close) => (
                        <div>
                            <div className="pop-head">
                                <Avatar person={me} size={34} presence />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 650 }} className="trunc">{me.name}</div>
                                    <div className="muted trunc" style={{ fontSize: "11.5px" }}>{user.email}</div>
                                </div>
                            </div>
                            {peopleItem && (
                                <button className="pop-item" onClick={() => { close(); navigate(`${base}/people`); }}>
                                    <Icon name="user" />Browse employees
                                </button>
                            )}
                            {profilePath && (
                                <button className="pop-item" onClick={() => { close(); navigate(profilePath); }}>
                                    <Icon name="user" />My profile
                                </button>
                            )}
                            {settingsItem && (
                                <button className="pop-item" onClick={() => { close(); navigate(`${base}/settings`); }}>
                                    <Icon name="settings" />Settings
                                </button>
                            )}
                            <button className="pop-item" onClick={() => { close(); setReporting(true); }}>
                                <Icon name="flag" />Report a bug
                            </button>
                            <div className="pop-sep" />
                            <button className="pop-item" onClick={() => { close(); signOut(); }}>
                                <Icon name="logout" />Sign out
                            </button>
                        </div>
                    )}
                </Popover>
            </div>
            {reporting && <ReportBugModal onClose={() => setReporting(false)} />}
        </aside>
    );
}
