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

const hours = (loggedMinutes: number, expectedMinutes: number, excusedMinutes: number, overtimeMinutes: number, utilization: number | null): Schemas["UtilizationTotalsResponse"] =>
    ({ loggedMinutes, expectedMinutes, excusedMinutes, availableMinutes: expectedMinutes - excusedMinutes, overtimeMinutes, utilization });

/*
 * September 2026's utilization, still running on Wednesday the 30th, in the API's shape. Written by hand from the
 * API's docs/design.md ("Utilization"): 21 working days of 8 hours (10,080 minutes) expected of each Design employee,
 * departments and people by name. Hours only: the API sends no pay with it.
 */
const utilization: Schemas["UtilizationResponse"] = {
    month: "2026-09-01",
    inProgress: true,
    total: hours(64920, 70560, 2400, 2100, 0.9521),
    departments: [
        { teamId: 1, name: "Architecture", people: 3, hours: hours(29700, 30240, 960, 1500, 1.0143) },
        { teamId: 2, name: "Interiors", people: 2, hours: hours(17820, 20160, 1440, 0, 0.9519) },
        { teamId: 3, name: "Visualisation", people: 2, hours: hours(17400, 20160, 0, 600, 0.8631) },
    ],
    people: [
        {
            userId: 8, name: "Elie Khalil", department: "Architecture", hours: hours(11340, 10080, 0, 1260, 1.125),
            projects: [
                { projectId: 11, title: "Gemmayze loft renovation", minutes: 7380, share: 0.6508 },
                { projectId: 12, title: "Batroun beach house", minutes: 3960, share: 0.3492 },
            ],
        },
        { userId: 5, name: "Lina Saad", department: "Interiors", hours: hours(8220, 10080, 1440, 0, 0.9514), projects: [{ projectId: 2, title: "Villa Mounir interiors", minutes: 8220, share: 1 }] },
        { userId: 7, name: "Maya Nassar", department: "Architecture", hours: hours(9420, 10080, 960, 240, 1.0329), projects: [{ projectId: 11, title: "Gemmayze loft renovation", minutes: 9420, share: 1 }] },
        { userId: 4, name: "Omar Fares", department: "Architecture", hours: hours(8940, 10080, 0, 0, 0.8869), projects: [{ projectId: 12, title: "Batroun beach house", minutes: 8940, share: 1 }] },
        { userId: 6, name: "Rami Aoun", department: "Visualisation", hours: hours(7440, 10080, 0, 0, 0.7381), projects: [] },
        { userId: 3, name: "Sarah Haddad", department: "Interiors", hours: hours(9600, 10080, 0, 0, 0.9524), projects: [{ projectId: 2, title: "Villa Mounir interiors", minutes: 9600, share: 1 }] },
        {
            userId: 9, name: "Yara Mansour", department: "Visualisation", hours: hours(9960, 10080, 0, 600, 0.9881),
            projects: [
                { projectId: 2, title: "Villa Mounir interiors", minutes: 5400, share: 0.5422 },
                { projectId: 11, title: "Gemmayze loft renovation", minutes: 4560, share: 0.4578 },
            ],
        },
    ],
    basis: {
        method: "Each Design employee's month from the hours ledger: expected hours are the required hours of their working days (from joining, up to "
            + "leaving), excused hours and days come off them, and utilization is logged ÷ what was left.",
        assumptions: ["Overtime is the time past each day's required hours, as employees see it.", "A department is the person's department today.", "This month runs to today."],
        leftOut: ["Admins, super admins and site staff: they log no hours."],
    },
};

export const reports = {
    work: workJson as unknown as Schemas["WorkReportResponse"],
    monthly: monthlyJson as unknown as Schemas["FinanceMonthResponse"][],
    entries: entriesJson as unknown as Paged<Schemas["WorkEntryResponse"]>,
    utilization,
    /** August 2026, finished. */
    utilizationAugust: { ...utilization, month: "2026-08-01", inProgress: false, total: hours(70200, 70560, 0, 1800, 0.9949) } as Schemas["UtilizationResponse"],
};

export const reportHandlers = [
    http.get("/api/reports/work", () => HttpResponse.json(reports.work)),
    http.get("/api/reports/utilization", ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get("month")?.startsWith("2026-08") ? reports.utilizationAugust : reports.utilization)),
    http.get("/api/finance/design/monthly", () => HttpResponse.json(reports.monthly)),
    http.get("/api/work-entries", () => HttpResponse.json(reports.entries)),
    http.get("/api/work/people", () => HttpResponse.json(people.list)),
];
