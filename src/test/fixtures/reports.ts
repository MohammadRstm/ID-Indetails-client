import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import entriesJson from "./reports/entries.json";
import monthlyJson from "./reports/monthly.json";
import workJson from "./reports/work.json";
import { people } from "./people";

/*
 * Design's Q3 2026 report (1 July to 30 September), captured from the seeded development API as Nadia:
 * 551 entries over 6 projects and 7 people, with its money, the last eight months of revenue and cost,
 * and the first six of its entries.
 */

export const reports = {
    work: workJson as unknown as Schemas["WorkReportResponse"],
    monthly: monthlyJson as unknown as Schemas["FinanceMonthResponse"][],
    entries: entriesJson as unknown as Paged<Schemas["WorkEntryResponse"]>,
};

export const reportHandlers = [
    http.get("/api/reports/work", () => HttpResponse.json(reports.work)),
    http.get("/api/finance/design/monthly", () => HttpResponse.json(reports.monthly)),
    http.get("/api/work-entries", () => HttpResponse.json(reports.entries)),
    http.get("/api/work/people", () => HttpResponse.json(people.list)),
];
