import { useNavigate } from "react-router";
import { openContact } from "@/app/contact/contact";
import { P } from "@/app/permissions/codes";
import { accessLabel } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { companyNav, domainNav, websiteNav } from "@/app/routing/routeTable";
import { fullName, useCurrentUser, useSession } from "@/app/session/useSession";
import ThemeToggle from "@/shared/components/Buttons/ThemeToggle";
import Avatar from "@/shared/components/Identity/Avatar";
import Popover from "@/shared/components/Overlays/Popover";
import NotificationBell from "@/domains/shared/notifications/NotificationBell";
import NotificationChime from "@/domains/shared/notifications/NotificationChime";
import TimerControl from "@/domains/design/work/TimerControl";
import { useIsPhone } from "@/shared/hooks/useIsPhone";
import Icon from "@/shared/icons/Icon";
import { toggleTheme, useTheme } from "@/shared/theme";
import { contactPath } from "./contactPath";
import MessagesButton from "./MessagesButton";
import { myAdvancesPath, myProfilePath } from "./profilePath";
import InstallMenuItem from "@/app/pwa/InstallMenuItem";
import PushMenuItem from "@/app/pwa/PushMenuItem";
import { useArrivalChime } from "@/domains/shared/messages/messageSounds";
import { useUnreadBadges } from "./shellQueries";
import { areaBase, type ShellArea } from "./useArea";

type TopBarProps = { area: ShellArea; onMenu: () => void; onSearch: () => void; /** Whether a wider screen shows the sidebar. */ sideShown?: boolean };

/** What a phone's header calls the page: the sidebar item being read, or the area's name where there is none. */
function pageName(area: ShellArea, items: { key: string; label: string }[]): string {
    const item = items.find((i) => i.key === area.section);
    return item?.label ?? AREAS[area.kind === "domain" ? area.domain : area.kind].label;
}

export default function TopBar({ area, onMenu, onSearch, sideShown = true }: TopBarProps) {
    const navigate = useNavigate();
    const phone = useIsPhone();
    const dark = useTheme() === "dark";
    const permissions = usePermissions();
    const user = useCurrentUser();
    const { signOut } = useSession();
    const badges = useUnreadBadges();
    // a message arriving anywhere chimes once, wherever the person is in the app
    useArrivalChime(badges.messages?.unread);
    const base = areaBase(area);
    const me = { name: fullName(user), photoFileId: user.photoFileId, online: true };
    const profilePath = myProfilePath(permissions, area, user.id);
    const items = area.kind === "domain" ? domainNav(permissions, area.domain) : area.kind === "website" ? websiteNav(permissions) : companyNav(permissions);
    // Settings → Contact where the person has Settings, otherwise the Contact window
    const contact = () => {
        const path = contactPath(permissions, area);
        if (path) navigate(path);
        else openContact();
    };

    return (
        <header className="top">
            <button className="icon-btn hamburger" onClick={onMenu} aria-label="Menu" title={sideShown ? "Fold the sidebar to its icons" : "Open the sidebar"}>
                <Icon name="menu" />
            </button>
            {phone ? (
                // Search, Messages and the bell are in the bottom bar
                <span className="top-title trunc">{pageName(area, items)}</span>
            ) : (
                <button className="top-search" onClick={onSearch}>
                    <Icon name="search" />
                    <span>{area.kind === "website" ? "Search…" : permissions.isAdmin ? "Search projects, people…" : "Search projects…"}</span>
                    <span className="kbd">⌘K</span>
                </button>
            )}

            <div className="top-actions">
                {/* whoever logs Design work may time it */}
                {area.kind === "domain" && area.domain === "design" && permissions.hasAll(P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN) && <TimerControl />}

                {/* a phone keeps New project on the Projects page and the overviews, where it already is */}
                {!phone && area.kind === "domain" && permissions.has(P.PROJECT_CREATE) && (
                    <button className="btn btn-sm" onClick={() => navigate(`/${area.domain}/projects?new=1`)} aria-label="New project">
                        <Icon name="plus" /><span className="top-label">New project</span>
                    </button>
                )}

                {/* on a phone Help and the theme are in the account menu, and Messages and the bell in the bottom bar */}
                {!phone && (
                    <>
                        <button className="icon-btn top-help" onClick={() => navigate(`${base}/help`)} aria-label="Help" title="Help">
                            <Icon name="help" />
                        </button>

                        <ThemeToggle />

                        <MessagesButton messagesPath={`${base}/messages`} />

                        <NotificationBell allPath={`${base}/notifications`} />
                    </>
                )}
                {/* the bell played the sound for a new notification: the header still does */}
                {phone && <NotificationChime />}

                <Popover
                    align="right"
                    width={230}
                    trigger={(open, toggle) => (
                        <button className={open ? "icon-btn me-btn on" : "icon-btn me-btn"} onClick={toggle} aria-label="Account">
                            <Avatar person={me} size={phone ? 36 : 26} presence />
                        </button>
                    )}
                >
                    {(close) => (
                        <div>
                            <div className="pop-head">
                                <Avatar person={me} size={32} presence />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 650 }} className="trunc">{me.name}</div>
                                    <div className="muted trunc" style={{ fontSize: "11.5px" }}>{accessLabel(permissions, user.position)}</div>
                                </div>
                            </div>
                            {profilePath && (
                                <button className="pop-item" onClick={() => { close(); navigate(profilePath); }}>
                                    <Icon name="user" />My profile
                                </button>
                            )}
                            <button className="pop-item" onClick={() => { close(); navigate(myAdvancesPath(permissions, area)); }}>
                                <Icon name="card" />Salary advances
                            </button>
                            {!phone && (
                                <button className="pop-item" onClick={() => { close(); navigate(`${base}/notifications`); }}>
                                    <Icon name="bell" />Notifications {badges.notifications > 0 && <span className="chk num">{badges.notifications}</span>}
                                </button>
                            )}
                            <button className="pop-item" onClick={() => { close(); navigate(`${base}/help`); }}>
                                <Icon name="help" />Help
                            </button>
                            {phone && (
                                <button className="pop-item" onClick={() => { close(); toggleTheme(); }}>
                                    <Icon name={dark ? "sun" : "moon"} />{dark ? "Light mode" : "Dark mode"}
                                </button>
                            )}
                            <button className="pop-item" onClick={() => { close(); contact(); }}>
                                <Icon name="mail" />Contact the developer
                            </button>
                            <PushMenuItem close={close} />
                            <InstallMenuItem close={close} />
                            <div className="pop-sep" />
                            <button className="pop-item" onClick={() => { close(); signOut(); }}>
                                <Icon name="logout" />Sign out
                            </button>
                        </div>
                    )}
                </Popover>
            </div>
        </header>
    );
}
