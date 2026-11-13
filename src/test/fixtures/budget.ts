import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

type Budget = Schemas["ProjectBudgetResponse"];

/*
 * Cost budgets as the API gives them, in USD before TVA. Villa Mounir interiors (project 2) is on its second version:
 * Architecture is over its line, Interiors and the expenses well within, with some cost in no line and pounds left
 * unconverted. Achrafieh Towers lobby (project 7) has a site budget by category.
 */

const designV2 = {
    version: 2, effectiveFrom: "2026-09-01", reason: "The client added a guest house.", setByName: "Rana Saab", setAt: "2026-09-28T09:00:00Z", total: 12000,
};
const siteV1 = {
    version: 1, effectiveFrom: "2026-08-03", reason: "Priced from the client BOQ.", setByName: "Rana Saab", setAt: "2026-08-03T09:00:00Z", total: 9500,
};
const designV1 = {
    version: 1, effectiveFrom: "2026-06-01", reason: "Agreed at kick-off.", setByName: "Nadia Karam", setAt: "2026-06-01T09:00:00Z", total: 10000,
};

export const budgets = {
    design: {
        projectId: 2,
        domain: "design",
        current: designV2,
        lines: [
            { teamId: 12, category: null, name: "Architecture", amount: 6000, cost: 6500, left: -500 },
            { teamId: 13, category: null, name: "Interiors", amount: 4000, cost: 1000, left: 3000 },
            { teamId: null, category: "expenses", name: "Expenses", amount: 2000, cost: 750, left: 1250 },
        ],
        uncovered: 320,
        unconverted: [{ currency: "LBP", amount: 4500000 }],
        history: [designV2, designV1],
    } as Budget,
    site: {
        projectId: 7,
        domain: "execution",
        current: siteV1,
        lines: [
            { teamId: null, category: "materials", name: "Materials", amount: 5000, cost: 4200, left: 800 },
            { teamId: null, category: "contractor", name: "Contractor", amount: 2000, cost: 2600, left: -600 },
            { teamId: null, category: "ground_labour", name: "Ground labour", amount: 2500, cost: 1900, left: 600 },
        ],
        uncovered: 0,
        unconverted: [],
        history: [siteV1],
    } as Budget,
    /** No budget yet. */
    none: (projectId: number, domain: string): Budget => ({ projectId, domain, current: null, lines: [], uncovered: 0, unconverted: [], history: [] }),
};

/** Answers each project's budget: the villa's and the lobby's from above. */
export const budgetHandlers = [
    http.get("/api/projects/:id/budget", ({ params }) =>
        HttpResponse.json(String(params.id) === "7" ? budgets.site : String(params.id) === "2" ? budgets.design : budgets.none(Number(params.id), "design"))),
];
