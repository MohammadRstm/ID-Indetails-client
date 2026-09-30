import type { Domain, Permissions } from "@/app/permissions/permissions";
import { areasOf } from "./areas";
import { companyNav, domainNav } from "./routeTable";

/** Where a domain starts for this person: its first sidebar item (overview for admins, projects for employees). */
export function domainHome(p: Permissions, domain: Domain): string {
    const first = domainNav(p, domain).find((item) => item.section !== "workspace");
    return first ? `/${domain}/${first.path}` : "/no-access";
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
    return domainHome(p, areas[0]);
}
