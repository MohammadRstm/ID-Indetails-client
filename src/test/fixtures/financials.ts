import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import costsJson from "./financials/costs.json";
import monthlyJson from "./financials/monthly.json";
import summaryJson from "./financials/summary.json";
import { overview } from "./overview";

/*
 * Design's financials for 2026 to 30 September, captured from the seeded development API as Nadia; the
 * projects and clients are the overview's, which cover all time.
 */

export const financials = {
    summary: summaryJson as unknown as Schemas["FinanceSummaryResponse"],
    monthly: monthlyJson as unknown as Schemas["FinanceMonthResponse"][],
    costs: costsJson as unknown as Schemas["FinanceCostsResponse"],
    projects: overview.projects,
    clients: overview.clients,
};

export const financialsHandlers = [
    http.get("/api/finance/design/summary", () => HttpResponse.json(financials.summary)),
    http.get("/api/finance/design/monthly", () => HttpResponse.json(financials.monthly)),
    http.get("/api/finance/design/costs", () => HttpResponse.json(financials.costs)),
    http.get("/api/finance/design/projects", () => HttpResponse.json(financials.projects)),
    http.get("/api/finance/design/clients", () => HttpResponse.json(financials.clients)),
];
