import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import monthsJson from "./company/months.json";
import overviewJson from "./company/overview.json";

/*
 * The company area as Rana sees it, captured from the seeded development API: September 2026 to date for
 * both domains, and the last 13 months. The seed has no company expenses, so the ledger below is written
 * here, in the API's shape: two lines charged in dollars and one cancelled at the end of this month.
 */

const line = (patch: Partial<Schemas["OverheadLineResponse"]>): Schemas["OverheadLineResponse"] => ({
    id: 1, name: "AWS", costGroup: "software", currency: "USD", currentAmount: 420, perYear: 5040, amounts: [{ amount: 420, effectiveFrom: "2025-03-01" }],
    startedOn: "2025-03-01", endedOn: null, isCancelled: false, ...patch,
});

export const company = {
    overview: overviewJson as unknown as Schemas["CompanyOverviewResponse"],
    months: monthsJson as unknown as Schemas["CompanyMonthResponse"][],
    overhead: {
        lines: [
            line({}),
            line({ id: 2, name: "Office rent", costGroup: "operating", currentAmount: 1800, perYear: 21600, amounts: [{ amount: 1800, effectiveFrom: "2024-01-01" }], startedOn: "2024-01-01" }),
            line({ id: 3, name: "Figma", currentAmount: 90, perYear: 1080, isCancelled: true, endedOn: "2026-09-30", startedOn: "2025-06-01" }),
        ],
        groupTotals: [{ costGroup: "software", currency: "USD", total: 510 }, { costGroup: "operating", currency: "USD", total: 1800 }],
        monthTotals: [{ currency: "USD", total: 2310 }],
    } as Schemas["OverheadResponse"],
};

export const companyHandlers = [
    http.get("/api/company/overview", () => HttpResponse.json(company.overview)),
    http.get("/api/company/overview/monthly", () => HttpResponse.json(company.months)),
    http.get("/api/company/overhead", () => HttpResponse.json(company.overhead)),
    http.get("/api/me/board-layouts/:key", ({ params }) => HttpResponse.json({ key: params.key, order: null, savedAt: null })),
];
