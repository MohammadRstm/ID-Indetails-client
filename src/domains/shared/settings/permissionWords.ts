import { P, type PermissionCode } from "@/app/permissions/codes";

/*
 * How permissions are named to people: grouped by the part of the app they open, under a few headings, so whoever
 * gives them sees "Money & billing" rather than eight codes. A group can be ticked as a whole or opened to tick its
 * permissions one by one. Every permission belongs to exactly one group (settings.test.tsx checks it).
 */

export type PermissionGroup = { title: string; codes: PermissionCode[] };
export type PermissionSection = { title: string; groups: PermissionGroup[] };

export const PERMISSION_SECTIONS: PermissionSection[] = [
    {
        title: "Projects",
        groups: [
            { title: "Projects", codes: [P.PROJECT_VIEW, P.PROJECT_CREATE, P.PROJECT_EDIT, P.PROJECT_CHANGE_STATUS, P.PROJECT_FILES_MANAGE] },
            { title: "Requirements & meetings", codes: [P.REQUIREMENT_VIEW, P.REQUIREMENT_MANAGE, P.REQUIREMENT_COMPLETE_OWN, P.MEETING_CREATE, P.MEETING_MANAGE] },
            { title: "Clients", codes: [P.CLIENT_VIEW, P.CLIENT_CREATE, P.CLIENT_MANAGE] },
            { title: "Client portal", codes: [P.CLIENT_ACCESS_MANAGE, P.CLIENT_PORTAL_MANAGE] },
        ],
    },
    {
        title: "Work",
        groups: [
            { title: "Own hours", codes: [P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN] },
            { title: "Team's hours", codes: [P.WORK_ENTRY_VIEW_ALL, P.WORK_ENTRY_COMMENT] },
            { title: "Site work", codes: [P.MATERIAL_CREATE, P.MATERIAL_MANAGE, P.LABOUR_REPORT_CREATE, P.LABOUR_REPORT_MANAGE] },
        ],
    },
    {
        title: "Money",
        groups: [
            {
                title: "Money & billing",
                codes: [P.FINANCIAL_VIEW, P.INVOICE_CREATE, P.INVOICE_SEND, P.INVOICE_VOID, P.PAYMENT_RECORD, P.PAYMENT_VOID, P.EXPENSE_MANAGE, P.BILLING_SETTINGS_MANAGE],
            },
            { title: "Site pricing & statements", codes: [P.PROJECT_PRICING_MANAGE, P.STATEMENT_CREATE, P.STATEMENT_SEND] },
        ],
    },
    {
        title: "People",
        groups: [
            { title: "People & teams", codes: [P.EMPLOYEE_VIEW, P.EMPLOYEE_MANAGE, P.EMPLOYEE_INVITE, P.EMPLOYEE_PAY_MANAGE, P.TEAM_MANAGE] },
            { title: "Access & security", codes: [P.PERMISSION_MANAGE, P.EMPLOYEE_CHANGE_EMAIL, P.SESSION_MANAGE, P.EMPLOYEE_INVITE_SUPER_ADMIN] },
        ],
    },
    {
        title: "Business",
        groups: [
            { title: "Activity & reports", codes: [P.ACTIVITY_VIEW, P.REPORT_VIEW] },
            { title: "Business settings", codes: [P.DOMAIN_SETTINGS_MANAGE] },
        ],
    },
    {
        title: "Company",
        groups: [
            { title: "Company overview & expenses", codes: [P.COMPANY_VIEW, P.OVERHEAD_MANAGE, P.OVERHEAD_CATEGORY_MANAGE] },
            { title: "Payroll & schedules", codes: [P.SALARY_VIEW, P.HOURS_EXCUSE, P.SCHEDULE_MANAGE, P.WORKING_TIME_MANAGE] },
            { title: "Company settings & rates", codes: [P.COMPANY_SETTINGS_MANAGE, P.EXCHANGE_RATE_MANAGE] },
        ],
    },
    {
        title: "Services",
        groups: [
            { title: "Proton", codes: [P.PROTON_USE, P.PROTON_BUDGET_MANAGE] },
            { title: "Website", codes: [P.WEBSITE_VIEW, P.WEBSITE_MANAGE, P.WEBSITE_ANALYTICS_VIEW] },
        ],
    },
];

/** Logging one's own hours: employees only, so it isn't offered for admins (the API drops it for them). */
export const OWN_WORK: string[] = [P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN];

export const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin", employee: "Employee" };

export type Grouped<T> = { title: string; groups: { title: string; items: T[] }[] };

/**
 * The given permissions in their sections and groups, in the order above; empty groups and sections are left out. A
 * permission no group knows yet (a new one the client hasn't caught up with) goes under "Other".
 */
export function grouped<T extends { code: string }>(list: T[]): Grouped<T>[] {
    const byCode = new Map(list.map((p) => [p.code, p]));
    const sections = PERMISSION_SECTIONS.map((section) => ({
        title: section.title,
        groups: section.groups
            .map((group) => ({ title: group.title, items: group.codes.flatMap((code) => byCode.get(code) ?? []) }))
            .filter((group) => group.items.length > 0),
    }));
    const known = new Set<string>(PERMISSION_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.codes)));
    const other = list.filter((p) => !known.has(p.code));
    if (other.length) sections.push({ title: "Other", groups: [{ title: "Other", items: other }] });
    return sections.filter((section) => section.groups.length > 0);
}
