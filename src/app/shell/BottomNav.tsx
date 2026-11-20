import { useLocation, useNavigate } from "react-router";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useProton } from "@/domains/shared/proton/protonStore";
import { useIsPhone } from "@/shared/hooks/useIsPhone";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { barTabs, onHome, type BarTab } from "./bottomNavTabs";
import { useBottomNavHeld, useTypingInField } from "./bottomNavState";
import { useUnreadBadges } from "./shellQueries";
import type { ShellArea } from "./useArea";

/** What the badge on a tab says: a count up to 9, then "9+"; the chat's says "@" when someone mentioned the person. */
function badgeText(count: number, mention: boolean): string | null {
    if (count <= 0) return null;
    return mention ? "@" : count > 9 ? "9+" : String(count);
}

/**
 * The phone's bottom bar: Home, Search, one more page for most people, Alerts and Chat (Instagram's way). It shows on
 * phones only, and steps aside while a text field has the keyboard up, inside an open chat and on Proton's own page.
 * It also leaves room under the page (the spacer), so a page's last row is never hidden behind it.
 */
export default function BottomNav({ area, onSearch }: { area: ShellArea; onSearch: () => void }) {
    const phone = useIsPhone();
    const permissions = usePermissions();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const badges = useUnreadBadges();
    const typing = useTypingInField();
    const held = useBottomNavHeld();
    const onProtonPage = useProton().onPage;

    const tabs = barTabs(permissions, area);
    if (!phone || tabs.length === 0 || typing || held || onProtonPage) return null;

    const home = tabs[0].path!;
    const unread = badges.messages?.unread ?? 0;
    const badge = (tab: BarTab) => tab.key === "chat" ? badgeText(unread, !!badges.messages?.mention)
        : tab.key === "alerts" ? badgeText(badges.notifications, false) : null;
    const isOn = (tab: BarTab) => tab.key === "home" ? onHome(home, pathname) : tab.section != null && tab.section === area.section;

    return (
        <>
            <div className="bottom-nav-spacer" aria-hidden="true" />
            <nav className="bottom-nav" aria-label="Quick links">
                {tabs.map((tab) => {
                    const count = badge(tab);
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            className={cx("bn-tab", isOn(tab) && "on")}
                            aria-current={isOn(tab) ? "page" : undefined}
                            onClick={() => (tab.path ? navigate(tab.path) : onSearch())}
                        >
                            <span className="bn-ic">
                                <Icon name={tab.icon} />
                                {count && <span className="msg-badge" aria-hidden="true">{count}</span>}
                            </span>
                            <span className="bn-label">{tab.label}</span>
                            {count && <span className="sr">{count === "@" ? "unread, you were mentioned" : `${count} unread`}</span>}
                        </button>
                    );
                })}
            </nav>
        </>
    );
}
