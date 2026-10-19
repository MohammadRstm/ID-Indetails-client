import type { CurrentUser } from "@/api/types";
import { P, type PermissionCode } from "./codes";

/** The two businesses: they have projects, clients and money. */
export type Domain = "design" | "execution";
export type Role = "super_admin" | "admin" | "employee";

export const DOMAINS: Domain[] = ["design", "execution"];

/** Permissions that only the company layer uses. Holding any of them opens the company area. */
const COMPANY_CODES: PermissionCode[] = [
    P.COMPANY_VIEW,
    P.OVERHEAD_MANAGE,
    P.SALARY_VIEW,
    P.SCHEDULE_MANAGE,
];

/**
 * What the signed-in person may see and do, from GET /api/auth/me. The API checks all of it again on every
 * request; this only decides what the client shows.
 */
export type Permissions = {
    role: Role;
    /** Their own domain; null for super admins. */
    homeDomain: Domain | null;
    /** The businesses they may enter: their own, plus any a domain-limited grant opens. */
    visibleDomains: Domain[];
    /** They may enter the Website area: website staff, super admins, or anyone given a website permission. */
    hasWebsiteArea: boolean;
    /** Website staff: the website is their home, and they belong to no business. */
    isWebsiteStaff: boolean;
    has(code: PermissionCode): boolean;
    hasAny(...codes: PermissionCode[]): boolean;
    hasAll(...codes: PermissionCode[]): boolean;
    canSeeDomain(domain: string | null | undefined): domain is Domain;
    /** Admins and super admins get the admin workspace; employees the employee one. */
    isAdmin: boolean;
    isSuperAdmin: boolean;
    /** They hold at least one company-layer permission. */
    hasCompanyArea: boolean;
};

export function permissionsOf(user: Pick<CurrentUser, "role" | "domain" | "visibleDomains" | "permissions">): Permissions {
    const held = new Set(user.permissions);
    const visible = DOMAINS.filter((d) => user.visibleDomains.includes(d));
    const role = (["super_admin", "admin", "employee"].includes(user.role) ? user.role : "employee") as Role;
    const has = (code: PermissionCode) => held.has(code);

    return {
        role,
        homeDomain: user.domain === "design" || user.domain === "execution" ? user.domain : null,
        visibleDomains: visible,
        has,
        hasAny: (...codes) => codes.some(has),
        hasAll: (...codes) => codes.every(has),
        canSeeDomain: (domain): domain is Domain => visible.includes(domain as Domain),
        hasWebsiteArea: user.visibleDomains.includes("website"),
        isWebsiteStaff: user.domain === "website",
        isAdmin: role !== "employee",
        isSuperAdmin: role === "super_admin",
        hasCompanyArea: COMPANY_CODES.some(has),
    };
}

/** The label under a person's name in the sidebar: their access level, or an employee's position. */
export function accessLabel(permissions: Permissions, position: string | null | undefined): string {
    if (permissions.isSuperAdmin) return "Super admin";
    if (permissions.isWebsiteStaff) return "Website admin";
    if (permissions.isAdmin) return "Admin";
    return position || "Employee";
}
