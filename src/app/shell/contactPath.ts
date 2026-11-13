import type { Permissions } from "@/app/permissions/permissions";
import { canOpen, companyRoutes, websiteRoutes } from "@/app/routing/routeTable";
import { areaBase, type ShellArea } from "./useArea";

/**
 * Settings → Contact in the area the person is in. Null where they have no Settings there (the company area without
 * its overview): the Contact window opens instead.
 */
export function contactPath(p: Permissions, area: ShellArea): string | null {
    const settings = "settings?section=contact";
    if (area.kind === "domain") return canOpen(p, area.domain, "settings") ? `/${area.domain}/${settings}` : null;
    const routes = area.kind === "website" ? websiteRoutes : companyRoutes;
    return routes.find((r) => r.path === "settings")?.access(p) ? `${areaBase(area)}/${settings}` : null;
}
