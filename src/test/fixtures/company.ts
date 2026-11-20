import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import monthsJson from "./company/months.json";
import overviewJson from "./company/overview.json";

/*
 * The company area as Rana sees it, captured from the seeded development API: September 2026 to date for
 * both domains, and the last 13 months. The seed has no company expenses, so the ledger below is written
 * here, in the API's shape: two lines charged in dollars and one cancelled at the end of this month.
 */

/** The seeded categories, with how many of the lines below use each. */
const groupNames = ["Software & services", "Operating costs", "Rent & utilities", "Internet & phone", "Marketing & advertising", "Professional fees",
    "Insurance", "Office supplies", "Equipment & maintenance", "Vehicles & transport", "Bank fees", "Taxes & licences", "Training & memberships", "Other"];
const groups: Schemas["OverheadGroupResponse"][] = groupNames.map((name, i) => ({ id: i + 1, name, lines: i === 0 ? 2 : i === 1 ? 1 : 0 }));
const software = { id: 1, name: "Software & services" };
const operating = { id: 2, name: "Operating costs" };

const line = (patch: Partial<Schemas["OverheadLineResponse"]>): Schemas["OverheadLineResponse"] => ({
    id: 1, name: "AWS", group: software, currency: "USD", currentAmount: 420, perYear: 5040, amounts: [{ amount: 420, effectiveFrom: "2025-03-01" }],
    startedOn: "2025-03-01", endedOn: null, isCancelled: false, ...patch,
});

const oneOff = (patch: Partial<Schemas["OneOffExpenseResponse"]>): Schemas["OneOffExpenseResponse"] => ({
    id: 7, name: "Refrigerator", group: { id: 8, name: "Office supplies" }, currency: "USD", amount: 450, spentOn: "2026-09-28",
    createdAt: "2026-09-28T09:12:00Z", canEdit: true, ...patch,
});

export const company = {
    overview: overviewJson as unknown as Schemas["CompanyOverviewResponse"],
    months: monthsJson as unknown as Schemas["CompanyMonthResponse"][],
    overhead: {
        lines: [
            line({}),
            line({ id: 2, name: "Office rent", group: operating, currentAmount: 1800, perYear: 21600, amounts: [{ amount: 1800, effectiveFrom: "2024-01-01" }], startedOn: "2024-01-01" }),
            line({ id: 3, name: "Figma", currentAmount: 90, perYear: 1080, isCancelled: true, endedOn: "2026-09-30", startedOn: "2025-06-01" }),
        ],
        groupTotals: [{ groupId: 2, name: "Operating costs", currency: "USD", total: 1800 }, { groupId: 1, name: "Software & services", currency: "USD", total: 510 }],
        monthTotals: [{ currency: "USD", total: 2310 }],
    } as Schemas["OverheadResponse"],
    groups,
    /** This month's one-off expenses (September 2026), newest day first. */
    oneOffs: {
        month: "2026-09-01", isOpen: true,
        items: [oneOff({}), oneOff({ id: 6, name: "Printer repair", group: { id: 9, name: "Equipment & maintenance" }, amount: 120, spentOn: "2026-09-12" })],
        totals: [{ currency: "USD", total: 570 }],
    } as Schemas["OneOffExpenseListResponse"],
    /** A closed month's, which can't be changed. */
    closedOneOffs: {
        month: "2026-08-01", isOpen: false,
        items: [oneOff({ id: 5, name: "Water cooler", amount: 90, spentOn: "2026-08-20", canEdit: false })],
        totals: [{ currency: "USD", total: 90 }],
    } as Schemas["OneOffExpenseListResponse"],
};

export const companyHandlers = [
    http.get("/api/company/overview", () => HttpResponse.json(company.overview)),
    http.get("/api/company/overview/monthly", () => HttpResponse.json(company.months)),
    http.get("/api/company/overhead", () => HttpResponse.json(company.overhead)),
    http.get("/api/company/overhead/one-offs", ({ request }) => HttpResponse.json(new URL(request.url).searchParams.get("month") === "2026-08" ? company.closedOneOffs : company.oneOffs)),
    http.get("/api/company/overhead/groups", () => HttpResponse.json(company.groups)),
    http.get("/api/me/board-layouts/:key", ({ params }) => HttpResponse.json({ key: params.key, order: null, savedAt: null })),
];
