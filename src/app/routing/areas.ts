import type { Domain, Permissions } from "@/app/permissions/permissions";
import type { IconName } from "@/shared/icons/icons";

export type Area = Domain | "website" | "company";

export const AREAS: Record<Area, { label: string; tagline: string; icon: IconName }> = {
    design: { label: "Design", tagline: "Design and engineering", icon: "palette" },
    execution: { label: "Execution", tagline: "Construction and site delivery", icon: "building" },
    website: { label: "Website", tagline: "Projects, services, locations and contact", icon: "browser" },
    company: { label: "Company", tagline: "Both businesses together", icon: "chartTile" },
};

/** Where the person can go: their visible businesses, the website, and the company area when they hold a company permission. */
export function areasOf(permissions: Permissions): Area[] {
    const areas: Area[] = [...permissions.visibleDomains];
    if (permissions.hasWebsiteArea) areas.push("website");
    if (permissions.hasCompanyArea) areas.push("company");
    return areas;
}

/** More than one area: they start on the launcher and have "All areas" in the sidebar. */
export function hasSeveralAreas(permissions: Permissions): boolean {
    return areasOf(permissions).length > 1;
}
