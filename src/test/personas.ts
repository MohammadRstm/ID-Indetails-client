import type { CurrentUser } from "@/api/types";
import { P, type PermissionCode } from "@/app/permissions/codes";

/*
 * The five kinds of people, with exactly the permissions the API gives each role by default
 * (PermissionCatalog + EffectivePermissions.RoleDefaults). Tests render pages as each of them.
 */

const ALL = Object.values(P) as PermissionCode[];

/** Company-layer codes: super admins only, unless granted. */
const COMPANY_ONLY: PermissionCode[] = [
    P.COMPANY_VIEW, P.OVERHEAD_MANAGE, P.SALARY_VIEW, P.COMPANY_SETTINGS_MANAGE, P.WORKING_TIME_MANAGE,
    P.SCHEDULE_MANAGE, P.HOURS_EXCUSE, P.EMPLOYEE_INVITE_SUPER_ADMIN, P.PERMISSION_MANAGE, P.EXCHANGE_RATE_MANAGE,
];
const EXECUTION_ONLY: PermissionCode[] = [
    P.PROJECT_PRICING_MANAGE, P.STATEMENT_CREATE, P.STATEMENT_SEND, P.MATERIAL_CREATE, P.MATERIAL_MANAGE,
    P.LABOUR_REPORT_CREATE, P.LABOUR_REPORT_MANAGE,
];
const DESIGN_ONLY: PermissionCode[] = [P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN, P.WORK_ENTRY_VIEW_ALL, P.WORK_ENTRY_COMMENT];

const without = (codes: PermissionCode[], ...remove: PermissionCode[][]) => codes.filter((c) => !remove.flat().includes(c));

export type PersonaName = "superAdmin" | "designAdmin" | "executionAdmin" | "designEmployee" | "executionEmployee";

function user(id: number, first: string, role: string, domain: string | null, permissions: PermissionCode[], position: string | null): CurrentUser {
    return {
        id,
        email: `${first.toLowerCase()}@hourline.test`,
        firstName: first,
        lastName: "Test",
        role,
        domain,
        team: null,
        position,
        photoFileId: null,
        mustChangePassword: false,
        permissions: [...permissions].sort(),
        isJoker: false,
        visibleDomains: domain ? [domain] : ["design", "execution"],
    };
}

export const personas: Record<PersonaName, CurrentUser> = {
    superAdmin: user(1, "Rana", "super_admin", null, ALL, "Managing director"),
    designAdmin: user(2, "Nadia", "admin", "design", without(ALL, COMPANY_ONLY, EXECUTION_ONLY), "Design director"),
    executionAdmin: user(3, "Karim", "admin", "execution", without(ALL, COMPANY_ONLY, DESIGN_ONLY), "Operations manager"),
    designEmployee: user(4, "Sarah", "employee", "design",
        [P.PROJECT_VIEW, P.REQUIREMENT_VIEW, P.REQUIREMENT_COMPLETE_OWN, P.MEETING_CREATE, P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN], "Interior designer"),
    executionEmployee: user(5, "Tarek", "employee", "execution",
        [P.PROJECT_VIEW, P.REQUIREMENT_VIEW, P.REQUIREMENT_COMPLETE_OWN, P.MEETING_CREATE, P.MATERIAL_CREATE, P.LABOUR_REPORT_CREATE], "Site engineer"),
};

/** A persona with some permissions granted or revoked, as a personal override would. */
export function withPermissions(base: CurrentUser, change: { grant?: PermissionCode[]; revoke?: PermissionCode[]; visibleDomains?: string[] }): CurrentUser {
    const held = new Set(base.permissions);
    change.grant?.forEach((c) => held.add(c));
    change.revoke?.forEach((c) => held.delete(c));
    return {
        ...base,
        permissions: [...held].sort(),
        isJoker: true,
        visibleDomains: change.visibleDomains ?? base.visibleDomains,
    };
}
