import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";
import type { Domain } from "@/app/permissions/permissions";

export type ProjectRisks = Schemas["ProjectRisksResponse"];
export type ProjectRiskGroup = Schemas["ProjectRiskGroupResponse"];
export type ProjectRiskKind = Schemas["ProjectRiskKind"];
export type ExpenseTrends = Schemas["ExpenseTrendsResponse"];
export type ExpenseAnomaly = Schemas["ExpenseAnomalyResponse"];
export type ExpenseAnomalyKind = Schemas["ExpenseAnomalyKind"];
export type LabourInsight = Schemas["LabourInsightResponse"];
export type LabourTotals = Schemas["LabourTotalsResponse"];

/** How many months of spending can be shown, ending with this one. The API takes 1 to 24 and shows 12 unless asked. */
export const TREND_MONTHS = [6, 12, 24] as const;
export type TrendMonths = (typeof TREND_MONTHS)[number];

/** The domain's client projects with a financial risk, most pressing first, each risk with the rule that fired (financial:view). */
export function useDomainRisks(domain: Domain, enabled = true) {
    return useQuery({
        queryKey: keys.finance.risks(domain),
        queryFn: async () => (await http.get<ProjectRisks>(`/finance/insights/${domain}/risks`)).data,
        enabled,
    });
}

/** The domain's spending by category, month by month in USD, and what the owner's rules call unusual in it (financial:view). */
export function useExpenseTrends(domain: Domain, months: TrendMonths, enabled = true) {
    return useQuery({
        queryKey: keys.finance.expenseTrends(domain, months),
        queryFn: async () => (await http.get<ExpenseTrends>(`/finance/insights/${domain}/expenses`, { params: { months } })).data,
        enabled,
        // another number of months keeps the last figures up while it loads
        placeholderData: keepPreviousData,
    });
}

/**
 * Design's labour over the months picked: its cost and hours by month, by project and by department, with the part
 * logged outside the agreed scope. Never a person's (financial:view, Design only).
 */
export function useDomainLabour(domain: Domain, months: TrendMonths, enabled = true) {
    return useQuery({
        queryKey: keys.finance.labour(domain, months),
        queryFn: async () => (await http.get<LabourInsight>(`/finance/insights/${domain}/labour`, { params: { months } })).data,
        // Execution has no logged hours: its labour is weekly crews, on each site
        enabled: enabled && domain === "design",
        placeholderData: keepPreviousData,
    });
}

/** Each risk in plain words, in the API's ranking (the most pressing first), with the pill it shows in. */
const RISKS: Record<ProjectRiskKind, { label: string; cls: string }> = {
    profit_at_zero: { label: "Profit at zero", cls: "pill-neg" },
    short_runway: { label: "Money running out", cls: "pill-neg" },
    projected_loss: { label: "Projected loss", cls: "pill-neg" },
    profit_close: { label: "Close to zero", cls: "pill-low" },
    blocked_change: { label: "Refused change waiting", cls: "pill-low" },
    department_over_budget: { label: "Department over budget", cls: "pill-low" },
    unconverted_costs: { label: "No exchange rate", cls: "cur-chip" },
    settlement_at_zero: { label: "Settled at a loss", cls: "pill-neg" },
};

/** A risk's words and pill; one this app doesn't know yet still shows, under the API's own name. */
export const riskOf = (kind: ProjectRiskKind) => RISKS[kind] ?? { label: kind, cls: "" };

const ANOMALIES: Record<ExpenseAnomalyKind, string> = {
    category_high: "Unusual month",
    unit_cost_jump: "Unit cost jump",
    same_amount_twice: "Same amount twice",
};

/** Why spending was called unusual, in plain words. */
export const anomalyLabel = (kind: ExpenseAnomalyKind) => ANOMALIES[kind] ?? kind;

/** Both domains' expense categories, as their forms name them: Design's project expenses and a site's expenses. */
const CATEGORY_NAMES: Record<string, string> = {
    assets: "Assets & licences", services: "Services", contractor: "Contractor", software: "Software", travel: "Travel", hardware: "Hardware",
    materials: "Materials", equipment: "Equipment", fees: "Fees", other: "Other",
};

/** A category's name; an older one the forms no longer offer shows as it was saved. */
export const categoryName = (code: string) => CATEGORY_NAMES[code] ?? (code.charAt(0).toUpperCase() + code.slice(1)).replace(/_/g, " ");

/** The chart's colours for categories, darker and lighter in turn so neighbours stand apart. "Other" is always grey. */
const CATEGORY_COLORS = ["var(--heat-4)", "var(--heat-1)", "var(--warn-mark)", "var(--heat-2)", "var(--done)", "var(--heat-3)"];

/** Each category's colour, by its place in the domain's own order. */
export function categoryColors(categories: readonly string[]): string[] {
    const coloured = categories.filter((c) => c !== "other");
    return categories.map((c) => (c === "other" ? "var(--ghost)" : CATEGORY_COLORS[coloured.indexOf(c) % CATEGORY_COLORS.length]));
}
