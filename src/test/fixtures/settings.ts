import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import { billing } from "./billing";
import adminsJson from "./settings/admins.json";
import catalogJson from "./settings/catalog.json";
import companyJson from "./settings/company.json";
import domainRulesJson from "./settings/domainRules.json";
import nadiaPermissionsJson from "./settings/nadiaPermissions.json";
import superAdminsJson from "./settings/superAdmins.json";
import teamsJson from "./settings/teams.json";
import workingTimeJson from "./settings/workingTime.json";

/*
 * The company's settings as Rana (super admin) reads them, captured from the seeded development API on
 * 30 September 2026: one working-time version since 2000 (Mon–Fri, 9 to 5, a 1h break, overtime ×1),
 * Design's rules, both domains' teams, the two admins and Nadia's permissions (her role's defaults).
 */

export const settings = {
    company: companyJson as unknown as Schemas["CompanySettingsResponse"],
    workingTime: workingTimeJson as unknown as Schemas["WorkingTimeResponse"],
    domainRules: domainRulesJson as unknown as Schemas["DomainSettingsResponse"],
    teams: teamsJson as unknown as Schemas["TeamResponse"][],
    catalog: catalogJson as unknown as Schemas["PermissionDefinitionResponse"][],
    admins: adminsJson as unknown as Schemas["EmployeeSummaryResponse"][],
    superAdmins: superAdminsJson as unknown as Schemas["EmployeeSummaryResponse"][],
    nadiaPermissions: nadiaPermissionsJson as unknown as Schemas["UserPermissionsResponse"],
};

const paged = <T,>(items: T[]) => ({ items, page: 1, pageSize: 100, totalCount: items.length });

export const settingsHandlers = [
    http.get("/api/company/settings", () => HttpResponse.json(settings.company)),
    http.get("/api/company/working-time", () => HttpResponse.json(settings.workingTime)),
    http.get("/api/domain-settings/:domain", () => HttpResponse.json(settings.domainRules)),
    http.get("/api/billing-settings/:domain", () => HttpResponse.json(billing.settings)),
    http.get("/api/exchange-rates", () => HttpResponse.json(billing.rates)),
    http.get("/api/teams", () => HttpResponse.json(settings.teams)),
    http.get("/api/permissions", () => HttpResponse.json(settings.catalog)),
    http.get("/api/users/:id/permissions", () => HttpResponse.json(settings.nadiaPermissions)),
    http.get("/api/employees", ({ request }) => {
        const role = new URL(request.url).searchParams.get("role");
        return HttpResponse.json(paged(role === "super_admin" ? settings.superAdmins : role === "admin" ? settings.admins : []));
    }),
];
