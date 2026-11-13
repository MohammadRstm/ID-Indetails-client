import { useNavigate } from "react-router";
import { openContact } from "@/app/contact/contact";
import { P } from "@/app/permissions/codes";
import { accessLabel } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { fullName, useCurrentUser, useSession } from "@/app/session/useSession";
import ThemeToggle from "@/shared/components/Buttons/ThemeToggle";
import Avatar from "@/shared/components/Identity/Avatar";
import Popover from "@/shared/components/Overlays/Popover";
import MessagesDropdown from "@/domains/shared/messages/MessagesDropdown";
import NotificationBell from "@/domains/shared/notifications/NotificationBell";
import TimerControl from "@/domains/design/work/TimerControl";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { contactPath } from "./contactPath";
import { myProfilePath } from "./profilePath";
import InstallMenuItem from "@/app/pwa/InstallMenuItem";
import PushMenuItem from "@/app/pwa/PushMenuItem";
import { useArrivalChime } from "@/domains/shared/messages/messageSounds";
import { useUnreadBadges } from "./shellQueries";
import { areaBase, type ShellArea } from "./useArea";

type TopBarProps = { area: ShellArea; onMenu: () => void; onSearch: () => void; /** Whether a wider screen shows the sidebar. */ sideShown?: boolean };

export default function TopBar({ area, onMenu, onSearch, sideShown = true }: TopBarProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const user = useCurrentUser();
    const { signOut } = useSession();
    const badges = useUnreadBadges();
    // a message arriving anywhere chimes once, wherever the person is in the app
    useArrivalChime(badges.messages?.unread);
    const base = areaBase(area);
    const me = { name: fullName(user), photoFileId: user.photoFileId, online: true };
    const unreadMessages = badges.messages?.unread ?? 0;
    const profilePath = myProfilePath(permissions, area, user.id);
    // Settings → Contact where the person has Settings, otherwise the Contact window
    const contact = () => {
        const path = contactPath(permissions, area);
        if (path) navigate(path);
        else openContact();
    };

    return (
        <header className="top">
            <button className="icon-btn hamburger" onClick={onMenu} aria-label="Menu" title={sideShown ? "Hide the sidebar" : "Show the sidebar"}>
                <Icon name="menu" />
            </button>
            <button className="top-search" onClick={onSearch}>
                <Icon name="search" />
                <span>{area.kind === "website" ? "Search…" : permissions.isAdmin ? "Search projects, people…" : "Search projects…"}</span>
                <span className="kbd">⌘K</span>
            </button>

            <div className="top-actions">
                {/* whoever logs Design work may time it */}
                {area.kind === "domain" && area.domain === "design" && permissions.hasAll(P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN) && <TimerControl />}

                {area.kind === "domain" && permissions.has(P.PROJECT_CREATE) && (
                    <button className="btn btn-sm" onClick={() => navigate(`/${area.domain}/projects?new=1`)} aria-label="New project">
                        <Icon name="plus" /><span className="top-label">New project</span>
                    </button>
                )}

                <button className="icon-btn top-help" onClick={() => navigate(`${base}/help`)} aria-label="Help" title="Help">
                    <Icon name="help" />
                </button>

                <ThemeToggle />

                <Popover
                    align="right"
                    trigger={(open, toggle) => (
                        <button className={cx("icon-btn", open && "on")} onClick={toggle} aria-label="Messages">
                            <Icon name="chat" />
                            {unreadMessages > 0 && (
                                <span className="msg-badge">{badges.messages?.mention ? "@" : unreadMessages > 9 ? "9+" : unreadMessages}</span>
                            )}
                        </button>
                    )}
                >
                    {(close) => <MessagesDropdown messagesPath={`${base}/messages`} close={close} />}
                </Popover>

                <NotificationBell allPath={`${base}/notifications`} />

                <Popover
                    align="right"
                    width={230}
                    trigger={(open, toggle) => (
                        <button className={open ? "icon-btn me-btn on" : "icon-btn me-btn"} onClick={toggle} aria-label="Account">
                            <Avatar person={me} size={26} presence />
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
                            <button className="pop-item" onClick={() => { close(); navigate(`${base}/notifications`); }}>
                                <Icon name="bell" />Notifications {badges.notifications > 0 && <span className="chk num">{badges.notifications}</span>}
                            </button>
                            {profilePath && (
                                <button className="pop-item" onClick={() => { close(); navigate(profilePath); }}>
                                    <Icon name="user" />My profile
                                </button>
                            )}
                            <button className="pop-item" onClick={() => { close(); navigate(`${base}/help`); }}>
                                <Icon name="help" />Help
                            </button>
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
