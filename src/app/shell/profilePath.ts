import { P } from "@/app/permissions/codes";
import type { Permissions } from "@/app/permissions/permissions";
import type { ShellArea } from "./useArea";

/**
 * Where the signed-in person's own profile is: in the website area while there, a super admin's in the company area, an
 * admin's among the people they manage, an employee's in their business. None for an admin who can't see profiles.
 */
export function myProfilePath(p: Permissions, area: ShellArea, userId: number): string | null {
    if (area.kind === "website") return "/website/profile";
    if (area.kind === "company" || p.isSuperAdmin) return "/company/profile";
    if (!p.isAdmin) return `/${area.domain}/profile`;
    return p.has(P.EMPLOYEE_VIEW) ? `/${area.domain}/people/${userId}` : null;
}
