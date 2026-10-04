/* How permissions are named to people: the area each belongs to (the part of its code before the colon), and roles. */

export const PERMISSION_AREAS: Record<string, string> = {
    project: "Projects", statement: "Statements", requirement: "Requirements", meeting: "Meetings", expense: "Expenses",
    work_entry: "Work entries", material: "Materials", labour_report: "Labour", client: "Clients", financial: "Money",
    invoice: "Invoices", payment: "Payments", billing_settings: "Billing settings", exchange_rate: "Exchange rates",
    employee: "People", session: "People", permission: "Permissions", team: "Teams", activity: "Activity", report: "Reports",
    domain_settings: "Settings", company: "Company", overhead: "Company expenses", overhead_category: "Company expenses", salary: "Salaries",
    company_settings: "Company settings", working_time: "Working time", schedule: "Schedules", hours: "Hours",
};

export const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin", employee: "Employee" };

export const areaOf = (code: string) => code.split(":")[0];

/** Permissions grouped by area, in the order the areas first come; areas sharing a name share a group. */
export function byArea<T extends { code: string }>(list: T[]): [string, T[]][] {
    const groups = new Map<string, T[]>();
    for (const p of list) {
        const area = PERMISSION_AREAS[areaOf(p.code)] ?? areaOf(p.code);
        groups.set(area, [...(groups.get(area) ?? []), p]);
    }
    return [...groups.entries()];
}
