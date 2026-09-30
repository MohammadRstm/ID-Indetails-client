import { useLocation } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";

/**
 * Where a person's name or picture leads: their profile, for an admin looking at someone in the domain they
 * are in, or, from the company area, in the person's own domain. Employees can't open each other's
 * profiles, so for them it's null and the name stays plain.
 */
export function useProfilePath(personId: number | null | undefined, personDomain?: string | null): string | null {
    const permissions = usePermissions();
    const [first] = useLocation().pathname.split("/").filter(Boolean);
    if (personId == null || !permissions.isAdmin || !permissions.has(P.EMPLOYEE_VIEW)) return null;
    const domain = first === "company" ? personDomain : first;
    if (domain !== "design" && domain !== "execution") return null;
    if (!permissions.canSeeDomain(domain)) return null;
    return `/${domain}/people/${personId}`;
}
