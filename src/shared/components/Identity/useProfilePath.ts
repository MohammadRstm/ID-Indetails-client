import { useLocation } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";

/**
 * Where a person's name or picture leads: their profile, for an admin looking at someone in the domain they
 * are in. Employees can't open each other's profiles, so for them it's null and the name stays plain.
 */
export function useProfilePath(personId: number | null | undefined): string | null {
    const permissions = usePermissions();
    const [first] = useLocation().pathname.split("/").filter(Boolean);
    if (personId == null || !permissions.isAdmin || !permissions.has(P.EMPLOYEE_VIEW)) return null;
    if (first !== "design" && first !== "execution") return null;
    return `/${first}/people/${personId}`;
}
