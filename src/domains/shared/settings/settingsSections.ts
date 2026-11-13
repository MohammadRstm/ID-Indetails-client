import { P, type PermissionCode } from "@/app/permissions/codes";
import type { Permissions } from "@/app/permissions/permissions";

export type SettingsSection = "general" | "time" | "finance" | "projects" | "notifications" | "teams" | "labels" | "admins" | "data" | "contact";

/** What lets someone change each section: it shows only to them. The first one's appearance, and Contact, are everyone's. */
const MANAGED_BY: Record<SettingsSection, PermissionCode[] | null> = {
    general: null,
    time: [P.DOMAIN_SETTINGS_MANAGE, P.WORKING_TIME_MANAGE],
    finance: [P.BILLING_SETTINGS_MANAGE, P.EXCHANGE_RATE_MANAGE, P.COMPANY_SETTINGS_MANAGE, P.WORKING_TIME_MANAGE],
    projects: [P.DOMAIN_SETTINGS_MANAGE],
    notifications: [P.DOMAIN_SETTINGS_MANAGE],
    teams: [P.TEAM_MANAGE],
    labels: [P.COMPANY_SETTINGS_MANAGE],
    admins: [P.EMPLOYEE_INVITE, P.EMPLOYEE_INVITE_SUPER_ADMIN, P.PERMISSION_MANAGE],
    data: [P.WORK_ENTRY_VIEW_ALL],
    contact: null,
};

/** Whether this person has the section in their Settings (the page and search both ask). */
export function seesSettingsSection(p: Permissions, section: SettingsSection): boolean {
    const codes = MANAGED_BY[section];
    return codes == null || p.hasAny(...codes);
}
