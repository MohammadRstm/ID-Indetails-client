import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

/*
 * Financial Intelligence on the two projects the other fixtures show, in the API's shape: Villa Mounir interiors
 * (Design project 2, ./project) and the Achrafieh Towers lobby (site 7, ./site), with the figures their own money
 * gives. The API wasn't captured for these: they are written by hand from docs/finance.md, "Financial Intelligence".
 */

const METHOD = "Agreed revenue − all cost so far + pocket money, in USD net of TVA, all time (owner decision Q1). Overhead, fixed "
    + "salaries, paid leave and the overtime premium are company costs, never a project's.";
const SCENARIO_METHOD = "The changes applied to today's figures with the same pricing rules as the real changes (agreed revenue − cost + "
    + "pocket money, net of TVA). Nothing is saved.";
const MARGIN_RULE = "The margin shows once the project is done, at least 5% along, or has 10 hours logged.";
const PROJECTION = "The projection divides the cost so far by the progress (requirements done): a straight line, an estimate.";

/** Villa Mounir: $18,000 agreed, an $8,000 variation order applied, and its labour and expenses so far. */
const design: Schemas["ProjectInsightResponse"] = {
    projectId: 2, title: "Villa Mounir interiors", domain: "design", status: "active", billingType: "client",
    agreedRevenue: 26000, agreedWithTva: 26000,
    cost: { labour: 1915.48, expenses: 155, siteExpenses: 0, groundLabour: 0, total: 2070.48, unconverted: [], unpricedLabourMinutes: 0 },
    agreedProfit: 23929.52, margin: 0.9204, marginKnown: true, standing: "fine",
    progressPct: 25, recognisedToDate: 6500, projected: { cost: 8281.92, profit: 17718.08, margin: 0.6815 },
    received: 0, receivedTva: 0, owed: 26000, siteCashProfit: null, toPocket: 0, fromPocket: 0, supervisionRate: null, tvaRate: 0,
    bridge: [
        { kind: "base_price", amount: 18000 },
        { kind: "variation_orders", amount: 8000 },
        { kind: "labour", amount: -1915.48 },
        { kind: "expenses", amount: -155 },
    ],
    // Interiors' hours include some paid in pounds with no rate on their day; the last row is hours in no department.
    // Architecture has 80h planned and is past them; Interiors has no plan
    departments: [
        { id: 12, name: "Architecture", share: 0.6, budget: 15600, cost: 1300, left: 14300, minutes: 6000, labourShare: 0.679, unconverted: [], plannedMinutes: 4800, progress: 1.25 },
        { id: 13, name: "Interiors", share: 0.4, budget: 10400, cost: 515.48, left: 9884.52, minutes: 2910, labourShare: 0.269, unconverted: [{ amount: 4500000, currency: "LBP" }], plannedMinutes: null, progress: null },
        { id: null, name: "Other hours", share: null, budget: 0, cost: 100, left: -100, minutes: 600, labourShare: 0.052, unconverted: [], plannedMinutes: null, progress: null },
    ],
    basis: { method: METHOD, assumptions: [MARGIN_RULE, PROJECTION], leftOut: [] },
};

/** The lobby: a $15,000 client BOQ and a $2,000 VO with 10% supervision, against its site expenses and ground labour. */
const site: Schemas["ProjectInsightResponse"] = {
    projectId: 7, title: "Achrafieh Towers lobby", domain: "execution", status: "active", billingType: "client",
    agreedRevenue: 18700, agreedWithTva: 18700,
    cost: { labour: 0, expenses: 0, siteExpenses: 6036, groundLabour: 3000, total: 9036, unconverted: [], unpricedLabourMinutes: 0 },
    agreedProfit: 9664, margin: 0.5168, marginKnown: true, standing: "fine",
    progressPct: 33, recognisedToDate: 6250.66, projected: { cost: 27381.82, profit: -8681.82, margin: -0.4643 },
    received: 10000, receivedTva: 0, owed: 8700, siteCashProfit: 964, toPocket: 0, fromPocket: 0, supervisionRate: 0.1, tvaRate: 0,
    bridge: [
        { kind: "base_price", amount: 15000 },
        { kind: "variation_orders", amount: 2000 },
        { kind: "supervision", amount: 1700 },
        { kind: "site_expenses", amount: -6036 },
        { kind: "ground_labour", amount: -3000 },
    ],
    departments: null,
    basis: { method: METHOD, assumptions: [MARGIN_RULE, PROJECTION], leftOut: [] },
};

const designToday: Schemas["ScenarioFiguresResponse"] = {
    agreedRevenue: 26000, agreedWithTva: 26000, cost: 2070.48, agreedProfit: 23929.52, margin: 0.9204, owed: 26000, standing: "fine",
};
const siteToday: Schemas["ScenarioFiguresResponse"] = {
    agreedRevenue: 18700, agreedWithTva: 18700, cost: 9036, agreedProfit: 9664, margin: 0.5168, owed: 8700, standing: "fine",
};

export const insights = {
    design,
    site,
    /** Villa Mounir with a $2,000 variation order. */
    designScenario: {
        projectId: 2,
        before: designToday,
        after: { agreedRevenue: 28000, agreedWithTva: 28000, cost: 2070.48, agreedProfit: 25929.52, margin: 0.9261, owed: 28000, standing: "fine" },
        profitChange: 2000, floorWouldRefuse: false, weeklyCost: null,
        basis: { method: SCENARIO_METHOD, assumptions: ["A variation order of 2,000 USD on the price, with its TVA."], leftOut: [] },
    } as Schemas["ProjectScenarioResponse"],
    /** Villa Mounir with $30,000 more labour: below zero, so the profit floor would refuse it as a real change. */
    designFloorScenario: {
        projectId: 2,
        before: designToday,
        after: { agreedRevenue: 26000, agreedWithTva: 26000, cost: 32070.48, agreedProfit: -6070.48, margin: -0.2335, owed: 26000, standing: "at_zero" },
        profitChange: -30000, floorWouldRefuse: true, weeklyCost: null,
        basis: { method: SCENARIO_METHOD, assumptions: ["An extra cost of 30,000 USD in Labour."], leftOut: [] },
    } as Schemas["ProjectScenarioResponse"],
    /** The lobby with 12% supervision instead of 10%. */
    siteScenario: {
        projectId: 7,
        before: siteToday,
        after: { agreedRevenue: 19040, agreedWithTva: 19040, cost: 9036, agreedProfit: 10004, margin: 0.5254, owed: 9040, standing: "fine" },
        profitChange: 340, floorWouldRefuse: false, weeklyCost: null,
        basis: { method: SCENARIO_METHOD, assumptions: ["Supervision at 12% of the work price instead of 10%."], leftOut: [] },
    } as Schemas["ProjectScenarioResponse"],
};

const notFound = () => HttpResponse.json({ type: "not_found", code: "not_found", message: "Project not found." }, { status: 404 });

/** Both projects' insights and one scenario each, whatever changes are asked for. A test's own handlers go first. */
export const insightHandlers = [
    http.get("/api/finance/insights/projects/:id", ({ params }) =>
        params.id === "2" ? HttpResponse.json(insights.design) : params.id === "7" ? HttpResponse.json(insights.site) : notFound()),
    http.get("/api/finance/insights/projects/:id/scenario", ({ params }) =>
        params.id === "2" ? HttpResponse.json(insights.designScenario) : params.id === "7" ? HttpResponse.json(insights.siteScenario) : notFound()),
];
