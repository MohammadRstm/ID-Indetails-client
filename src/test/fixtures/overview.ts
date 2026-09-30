import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import attentionJson from "./overview/attention.json";
import billingJson from "./overview/billing.json";
import clientOverviewJson from "./overview/clientOverview.json";
import clientsJson from "./overview/clients.json";
import dashboardJson from "./overview/dashboard.json";
import deadlinesJson from "./overview/deadlines.json";
import monthlyJson from "./overview/monthly.json";
import overviewJson from "./overview/overview.json";
import projectsJson from "./overview/projects.json";
import summaryJson from "./overview/summary.json";
import { people } from "./people";

/*
 * Design's overview for Q3 2026, captured from the seeded development API as Nadia on 30 September:
 * the work over the quarter, the dashboard, the deadlines and every money card's data.
 */

export const overview = {
    overview: overviewJson as unknown as Schemas["OverviewResponse"],
    dashboard: dashboardJson as unknown as Schemas["DashboardResponse"],
    deadlines: deadlinesJson as unknown as Schemas["UpcomingDeadlinesResponse"],
    summary: summaryJson as unknown as Schemas["FinanceSummaryResponse"],
    monthly: monthlyJson as unknown as Schemas["FinanceMonthResponse"][],
    projects: projectsJson as unknown as Schemas["FinanceProjectsResponse"],
    billing: billingJson as unknown as Schemas["FinanceBillingResponse"],
    attention: attentionJson as unknown as Schemas["MoneyAttentionResponse"][],
    clients: clientsJson as unknown as Schemas["FinanceClientResponse"][],
    clientOverview: clientOverviewJson as unknown as Schemas["ClientOverviewResponse"],
};

export const overviewHandlers = [
    http.get("/api/reports/overview", () => HttpResponse.json(overview.overview)),
    http.get("/api/dashboard/design", () => HttpResponse.json(overview.dashboard)),
    http.get("/api/dashboard/design/deadlines", () => HttpResponse.json(overview.deadlines)),
    http.get("/api/finance/design/summary", () => HttpResponse.json(overview.summary)),
    http.get("/api/finance/design/monthly", () => HttpResponse.json(overview.monthly)),
    http.get("/api/finance/design/projects", () => HttpResponse.json(overview.projects)),
    http.get("/api/finance/design/billing", () => HttpResponse.json(overview.billing)),
    http.get("/api/finance/design/attention", () => HttpResponse.json(overview.attention)),
    http.get("/api/finance/design/clients", () => HttpResponse.json(overview.clients)),
    http.get("/api/clients/overview", () => HttpResponse.json(overview.clientOverview)),
    http.get("/api/work/people", () => HttpResponse.json(people.list)),
    http.get("/api/me/board-layouts/:key", ({ params }) => HttpResponse.json({ key: params.key, order: null, savedAt: null })),
];
