import type { Permissions } from "@/app/permissions/permissions";
import { areasOf } from "@/app/routing/areas";
import { homePath } from "@/app/routing/home";
import { domainNav, websiteNav } from "@/app/routing/routeTable";
import type { IconName } from "@/shared/icons/icons";
import { areaBase, type ShellArea } from "./useArea";

/** One tab of the phone's bottom bar. A tab without a path opens the search. */
export type BarTab = {
    key: "home" | "search" | "page" | "alerts" | "chat";
    label: string;
    icon: IconName;
    path: string | null;
    /** The sidebar section the tab belongs to, to light it up on that page. */
    section: string | null;
};

/**
 * The page a person's bar keeps one tap away besides Home: an admin's Projects (the website's Analytics), an employee's
 * My work, site staff's My sites. People who reach several areas start on the launcher and have no such tab.
 */
function pageTab(p: Permissions): BarTab | null {
    const areas = areasOf(p);
    if (areas.length !== 1) return null;
    const [only] = areas;
    if (only === "company") return null;
    const items = only === "website" ? websiteNav(p) : domainNav(p, only);
    const key = only === "website" ? "analytics" : p.isAdmin ? "projects" : only === "design" ? "my-work" : "sites";
    // only a page this person may open has a nav item, so a tab never leads to "no access"
    const item = items.find((i) => i.key === key);
    return item ? { key: "page", label: item.label, icon: item.icon, path: `/${only}/${item.path}`, section: item.key } : null;
}

/** The bar's tabs for this person on this page: Home, Search, their page (if any), Alerts and Chat. */
export function barTabs(p: Permissions, area: ShellArea): BarTab[] {
    const home = homePath(p);
    if (home === "/no-access") return [];
    const base = areaBase(area);
    const page = pageTab(p);
    return [
        { key: "home", label: "Home", icon: "home", path: home, section: null },
        { key: "search", label: "Search", icon: "search", path: null, section: null },
        // Home already is this page for someone whose first page is it
        ...(page && page.path !== home ? [page] : []),
        { key: "alerts", label: "Alerts", icon: "bell", path: `${base}/notifications`, section: "notifications" },
        { key: "chat", label: "Chat", icon: "chat", path: `${base}/messages`, section: "messages" },
    ];
}

/** Whether Home is the page being read: the launcher itself, or the person's first page and what opens from it. */
export function onHome(home: string, pathname: string): boolean {
    return pathname === home || (home !== "/company" && pathname.startsWith(`${home}/`));
}
