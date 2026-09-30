import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import billingJson from "./executionMoney/billing.json";
import clientOverviewJson from "./executionMoney/clientOverview.json";
import clientsJson from "./executionMoney/clients.json";
import costsJson from "./executionMoney/costs.json";
import dashboardJson from "./executionMoney/dashboard.json";
import monthlyJson from "./executionMoney/monthly.json";
import projectsJson from "./executionMoney/projects.json";
import summaryJson from "./executionMoney/summary.json";

/*
 * Execution's money for 2026 to 30 September, captured from the seeded development API as Karim: three
 * sites, whose cost is materials and ground labour; nobody logs hours on them.
 */

export const executionMoney = {
    summary: summaryJson as unknown as Schemas["FinanceSummaryResponse"],
    monthly: monthlyJson as unknown as Schemas["FinanceMonthResponse"][],
    projects: projectsJson as unknown as Schemas["FinanceProjectsResponse"],
    clients: clientsJson as unknown as Schemas["FinanceClientResponse"][],
    billing: billingJson as unknown as Schemas["FinanceBillingResponse"],
    costs: costsJson as unknown as Schemas["FinanceCostsResponse"],
    dashboard: dashboardJson as unknown as Schemas["DashboardResponse"],
    clientOverview: clientOverviewJson as unknown as Schemas["ClientOverviewResponse"],
};

export const executionMoneyHandlers = [
    http.get("/api/finance/execution/summary", () => HttpResponse.json(executionMoney.summary)),
    http.get("/api/finance/execution/monthly", () => HttpResponse.json(executionMoney.monthly)),
    http.get("/api/finance/execution/projects", () => HttpResponse.json(executionMoney.projects)),
    http.get("/api/finance/execution/clients", () => HttpResponse.json(executionMoney.clients)),
    http.get("/api/finance/execution/billing", () => HttpResponse.json(executionMoney.billing)),
    http.get("/api/finance/execution/costs", () => HttpResponse.json(executionMoney.costs)),
    http.get("/api/dashboard/execution", () => HttpResponse.json(executionMoney.dashboard)),
    http.get("/api/clients/overview", () => HttpResponse.json(executionMoney.clientOverview)),
    http.get("/api/invoices", () => HttpResponse.json({ items: [], page: 1, pageSize: 1, totalCount: 1 })),
    http.get("/api/me/board-layouts/:key", ({ params }) => HttpResponse.json({ key: params.key, order: null, savedAt: null })),
];
