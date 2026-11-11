import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

/*
 * Financial Intelligence across Design, in the API's shape, as of Wednesday 30 September 2026: its client projects at
 * risk and its spending by category over the last 12 months. The API wasn't captured for these: they are written by
 * hand from docs/finance.md ("A domain's project risks", "A domain's spending trends"), each rule in the API's words
 * at the owner's thresholds.
 */

const PROFIT_AT_ZERO = "an agreed profit of 0 or below, against the profit floor";
const PROJECTED_LOSS = "the cost so far ÷ progress (requirements done) puts the profit at completion at 0 or below: a straight-line estimate, made from 5% along";
const PROFIT_CLOSE = "a margin of 10% or less, against the profit floor";
const BLOCKED = "a change the profit floor refused, waiting to be forced or dismissed";
const DEPARTMENT = "a department's labour cost past its budget (its share of the price, plus its variation orders)";
const UNCONVERTED = "costs with no exchange rate on their day, left out of cost and profit";
const SETTLEMENT = "finished in the last 12 months with what the client owed excused or written off, ending at an agreed profit of 0 or below (a settlement isn't held to the profit floor)";

const riskBasis: Schemas["InsightBasisResponse"] = {
    method: "Each active or on-hold client project of the domain, checked against the rules each risk names, with the shared calculator's "
        + "figures (USD net of TVA, all time); a finished one only for a settlement in the last 12 months.",
    assumptions: [
        "The projection divides the cost so far by the progress (requirements done): a straight line, an estimate.",
        "A department's budget is its share of the price plus its variation orders.",
    ],
    leftOut: [
        "Internal projects: cost centres, never a risk of loss.",
        "1 running project with no agreed amount yet: no standing, projection or department budget to check.",
    ],
};

/** Three running projects with risks, ranked, and one settled at a loss, out of the 7 checked. */
const designRisks: Schemas["ProjectRisksResponse"] = {
    domain: "design", today: "2026-09-30", checked: 7,
    projects: [
        {
            projectId: 11, title: "Gemmayze loft renovation", status: "active",
            risks: [
                { kind: "profit_at_zero", amount: -1250, fact: "An agreed profit of -1,250 USD on 14,000 USD agreed.", rule: PROFIT_AT_ZERO },
                { kind: "department_over_budget", amount: 2600, fact: "Architecture: 11,000 USD of labour on a budget of 8,400 USD, 2,600 USD over.", rule: DEPARTMENT },
            ],
        },
        {
            projectId: 12, title: "Batroun beach house", status: "hold",
            risks: [
                { kind: "projected_loss", amount: -3400, fact: "At 40% along, the cost so far points to 25,400 USD at completion: a profit of -3,400 USD on 22,000 USD agreed.", rule: PROJECTED_LOSS },
                { kind: "profit_close", amount: 1840, fact: "An agreed profit of 1,840 USD on 22,000 USD agreed, a margin of 8.4%.", rule: PROFIT_CLOSE },
                { kind: "blocked_change", amount: null, fact: "A refused change waiting since 21 Sep 2026.", rule: BLOCKED },
                { kind: "unconverted_costs", amount: null, fact: "Not counted: 1,200,000 LBP of labour.", rule: UNCONVERTED },
            ],
        },
        {
            projectId: 13, title: "Achrafieh clinic", status: "active",
            risks: [{ kind: "unconverted_costs", amount: null, fact: "Not counted: 4,500,000 LBP of expenses.", rule: UNCONVERTED }],
        },
        {
            projectId: 14, title: "Jounieh showroom", status: "completed",
            risks: [{ kind: "settlement_at_zero", amount: 2000, fact: "Written off at completion on 14 Aug 2026, taking 2,000 USD off the profit: an agreed profit of -350 USD.", rule: SETTLEMENT }],
        },
    ],
    counts: [
        { kind: "profit_at_zero", projects: 1 },
        { kind: "projected_loss", projects: 1 },
        { kind: "profit_close", projects: 1 },
        { kind: "blocked_change", projects: 1 },
        { kind: "department_over_budget", projects: 1 },
        { kind: "unconverted_costs", projects: 2 },
        { kind: "settlement_at_zero", projects: 1 },
    ],
    basis: riskBasis,
};

const CATEGORIES = ["assets", "services", "contractor", "software", "travel", "hardware", "other"];

/** A month with each category's USD in the scheme's order, and the total the API gives it. */
const month = (start: string, usd: number[], total: number, baselines: (number | null)[] = []): Schemas["ExpenseMonthResponse"] => ({
    month: start, total, categories: CATEGORIES.map((category, i) => ({ category, usd: usd[i] ?? 0, baseline: baselines[i] ?? null })),
});

const CATEGORY_HIGH = "a category's month at 1.5× or more of its average over the 6 months before (a month with nothing counts as 0), and at least 1,000 USD";
const DUPLICATE = "expenses on one project with the same item, amount and currency, on the same day: maybe one typed twice";

/** October 2025 to September 2026: a contractor's bill far above the months before, and a render bought twice in a day. */
const designSpending: Schemas["ExpenseTrendsResponse"] = {
    domain: "design",
    categories: CATEGORIES,
    months: [
        month("2025-10-01", [0, 400, 0, 120, 0, 0, 35], 555),
        month("2025-11-01", [0, 400, 0, 120, 210, 0, 0], 730),
        month("2025-12-01", [1200, 400, 0, 120, 0, 0, 0], 1720),
        month("2026-01-01", [0, 400, 0, 140, 0, 650, 0], 1190),
        month("2026-02-01", [0, 400, 0, 140, 0, 0, 60], 600),
        month("2026-03-01", [0, 400, 800, 140, 0, 0, 0], 1340),
        month("2026-04-01", [0, 400, 0, 140, 320, 0, 0], 860),
        month("2026-05-01", [0, 450, 0, 140, 0, 0, 0], 590),
        month("2026-06-01", [0, 450, 0, 140, 0, 0, 25], 615),
        month("2026-07-01", [0, 450, 600, 140, 0, 0, 0], 1190),
        month("2026-08-01", [0, 450, 0, 140, 0, 0, 0], 590),
        month("2026-09-01", [0, 600, 3400, 140, 0, 0, 0], 4140, [null, 433.33, 233.33, 140, 53.33, null, 4.17]),
    ],
    anomalies: [
        {
            kind: "category_high", on: "2026-09-01", category: "contractor", projectId: null, projectTitle: null, item: null,
            usd: 3400, baseline: 233.33, pct: 1357, expenseIds: [],
            fact: "Contractor: 3,400 USD in September 2026, 14.57× its 6-month average of 233.33 USD.", rule: CATEGORY_HIGH,
        },
        {
            kind: "same_amount_twice", on: "2026-09-14", category: "services", projectId: 2, projectTitle: "Villa Mounir interiors", item: "Render farm credits",
            usd: 150, baseline: null, pct: null, expenseIds: [41, 42],
            fact: "2 expenses of 150 USD for \"Render farm credits\" on 14 Sep 2026.", rule: DUPLICATE,
        },
    ],
    unconverted: [{ currency: "LBP", amount: 4500000 }],
    basis: {
        method: "Project expenses by category, month by month, in USD at the rate of each expense's day; internal projects included, as their "
            + "costs count in the domain's totals.",
        assumptions: [CATEGORY_HIGH, "Design expenses have no unit cost, so only categories and repeated entries are checked", DUPLICATE, "This month runs to today."],
        leftOut: ["Spending with no exchange rate on its day, in no USD figure: 4,500,000 LBP."],
    },
};

export const domainInsights = {
    designRisks,
    designSpending,
    /** Every project checked, none at risk. */
    noRisks: { ...designRisks, projects: [], counts: [] } as Schemas["ProjectRisksResponse"],
    /** The same spending, with nothing unusual in it and every amount converted. */
    nothingUnusual: { ...designSpending, anomalies: [], unconverted: [], basis: { ...designSpending.basis, leftOut: [] } } as Schemas["ExpenseTrendsResponse"],
};

const notFound = () => HttpResponse.json({ type: "not_found", code: "not_found", message: "Domain not found." }, { status: 404 });

/** Design's risks and spending, however many months are asked for; any other domain isn't found. A test's own handlers go first. */
export const domainInsightHandlers = [
    http.get("/api/finance/insights/:domain/risks", ({ params }) => (params.domain === "design" ? HttpResponse.json(designRisks) : notFound())),
    http.get("/api/finance/insights/:domain/expenses", ({ params }) => (params.domain === "design" ? HttpResponse.json(designSpending) : notFound())),
];
