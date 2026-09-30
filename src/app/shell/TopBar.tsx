import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { accessLabel } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { fullName, useCurrentUser, useSession } from "@/app/session/useSession";
import ThemeToggle from "@/shared/components/Buttons/ThemeToggle";
import Avatar from "@/shared/components/Identity/Avatar";
import Popover from "@/shared/components/Overlays/Popover";
import NotificationBell from "@/domains/shared/notifications/NotificationBell";
import TimerControl from "@/domains/design/work/TimerControl";
import Icon from "@/shared/icons/Icon";
import { useUnreadBadges } from "./shellQueries";
import type { ShellArea } from "./useArea";

type TopBarProps = { area: ShellArea; onMenu: () => void; onSearch: () => void };

export default function TopBar({ area, onMenu, onSearch }: TopBarProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const user = useCurrentUser();
    const { signOut } = useSession();
    const badges = useUnreadBadges();
    const base = area.kind === "domain" ? `/${area.domain}` : "/company";
    const me = { name: fullName(user), photoFileId: user.photoFileId, online: true };
    const unreadMessages = badges.messages?.unread ?? 0;

    return (
        <header className="top">
            <button className="icon-btn hamburger" onClick={onMenu} aria-label="Menu"><Icon name="menu" /></button>
            <button className="top-search" onClick={onSearch}>
                <Icon name="search" />
                <span>{permissions.isAdmin ? "Search projects, people…" : "Search projects…"}</span>
                <span className="kbd">⌘K</span>
            </button>

            <div className="top-actions">
                {/* Design employees log work; the timer is one way to do it */}
                {area.kind === "domain" && area.domain === "design" && !permissions.isAdmin && permissions.has(P.WORK_ENTRY_CREATE) && <TimerControl />}

                {area.kind === "domain" && permissions.isAdmin && permissions.has(P.PROJECT_CREATE) && (
                    <button className="btn btn-sm" onClick={() => navigate(`/${area.domain}/projects?new=1`)}>
                        <Icon name="plus" />New project
                    </button>
                )}

                <ThemeToggle />

                <button className="icon-btn" onClick={() => navigate(`${base}/messages`)} aria-label="Messages">
                    <Icon name="chat" />
                    {unreadMessages > 0 && (
                        <span className="msg-badge">{badges.messages?.mention ? "@" : unreadMessages > 9 ? "9+" : unreadMessages}</span>
                    )}
                </button>

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
                            {!permissions.isAdmin && area.kind === "domain" && (
                                <button className="pop-item" onClick={() => { close(); navigate(`${base}/profile`); }}>
                                    <Icon name="user" />My profile
                                </button>
                            )}
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
