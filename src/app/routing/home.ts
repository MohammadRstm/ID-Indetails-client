import type { Domain, Permissions } from "@/app/permissions/permissions";
import { areasOf } from "./areas";
import { companyNav, domainNav, websiteNav } from "./routeTable";

/** Where a domain starts for this person: its first sidebar item (overview for admins, projects for employees). */
export function domainHome(p: Permissions, domain: Domain): string {
    const first = domainNav(p, domain).find((item) => item.section !== "workspace");
    return first ? `/${domain}/${first.path}` : "/no-access";
}

/** Where the website area starts for this person: its first sidebar item. */
export function websiteHome(p: Permissions): string {
    const first = websiteNav(p).find((item) => item.section !== "workspace");
    return first ? `/website/${first.path}` : "/no-access";
}

/** Where someone lands after signing in: the launcher when they can reach several areas, otherwise their only one. */
export function homePath(p: Permissions): string {
    const areas = areasOf(p);
    if (areas.length > 1) return "/company";
    if (areas.length === 0) return "/no-access";
    if (areas[0] === "company") {
        const first = companyNav(p)[0];
        return first ? `/company/${first.path}` : "/no-access";
    }
    if (areas[0] === "website") return websiteHome(p);
    return domainHome(p, areas[0]);
}
