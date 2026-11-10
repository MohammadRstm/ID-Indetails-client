import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type ProjectInsight = Schemas["ProjectInsightResponse"];
export type ProjectScenario = Schemas["ProjectScenarioResponse"];
export type ScenarioFigures = Schemas["ScenarioFiguresResponse"];
export type DepartmentInsight = Schemas["DepartmentInsightResponse"];
export type BridgeStepKind = Schemas["BridgeStepKind"];
export type ProfitStanding = NonNullable<Schemas["ProfitStanding"]>;
export type CostSource = Schemas["CostSource"];
export type OwedSettlement = NonNullable<Schemas["OwedSettlement"]>;

/** The changes to try on a project; each one left out stays as it is. Rates are fractions (0.1 is 10%). */
export type ScenarioLevers = {
    voAmount?: number;
    extraCost?: number;
    extraCostSource?: CostSource;
    supervisionRate?: number;
    tvaRate?: number;
    settleOwed?: OwedSettlement;
    delayWeeks?: number;
};

/** The most weeks a delay can be tried with, as the API allows. */
export const MAX_DELAY_WEEKS = 104;

/**
 * One project's profitability, all time, in USD before TVA: agreed revenue, cost, agreed profit, where it comes from,
 * its standing against the profit floor and, on Design, its departments (financial:view).
 */
export function useProjectInsight(projectId: number) {
    return useQuery({
        queryKey: keys.projects.insights(projectId),
        queryFn: async () => (await http.get<ProjectInsight>(`/finance/insights/projects/${projectId}`)).data,
    });
}

/** The project's figures today and with the changes asked for, worked out by the API; nothing is saved. Null asks nothing. */
export function useProjectScenario(projectId: number, levers: ScenarioLevers | null) {
    return useQuery({
        queryKey: keys.projects.scenario(projectId, levers ?? {}),
        queryFn: async () => (await http.get<ProjectScenario>(`/finance/insights/projects/${projectId}/scenario`, { params: levers })).data,
        enabled: levers != null,
    });
}

/** Each step from the price first agreed to the agreed profit, in plain words, with what it is (on a site, when it differs). */
export const BRIDGE_STEPS: Record<BridgeStepKind, { label: string; note: string; siteNote?: string }> = {
    base_price: { label: "Price first agreed", note: "The customer payment before any variation order", siteNote: "The agreed client BOQ" },
    variation_orders: { label: "Variation orders", note: "Agreed changes to the price" },
    settlement: { label: "Settled at completion", note: "What the client still owed, excused or written off" },
    paid_ahead: { label: "Paid ahead, kept", note: "What the client paid beyond the price, kept at completion" },
    supervision: { label: "Supervision", note: "On top of the work price" },
    permits: { label: "Permits", note: "Charged as they are" },
    labour: { label: "Employee labour", note: "The hours logged on it" },
    expenses: { label: "Project expenses", note: "One-off costs recorded on it" },
    site_expenses: { label: "Site expenses", note: "What was spent on site" },
    ground_labour: { label: "Ground labour", note: "Never billed to the client" },
    pocket: { label: "Pocket money", note: "Paid by the pocket money, less what was moved to it" },
};

/** Where a client project's profit stands against the profit floor, in the margin pill's colours. */
export const STANDINGS: Record<ProfitStanding, { label: string; cls: string; note: string }> = {
    fine: { label: "Healthy", cls: "pill-high", note: "a margin above 10%" },
    close: { label: "Close to zero", cls: "pill-low", note: "a margin of 10% or less" },
    at_zero: { label: "At zero or below", cls: "pill-neg", note: "a change that lowers it is refused" },
};

/** Where an extra cost can go, by domain: a site's costs are its expenses and ground labour, Design's its labour and expenses. */
export const COST_SOURCES: Record<"design" | "execution", { value: CostSource; label: string }[]> = {
    design: [{ value: "labour", label: "Employee labour" }, { value: "expenses", label: "Project expenses" }],
    execution: [{ value: "site_expense", label: "Site expenses" }, { value: "ground_labour", label: "Ground labour" }],
};

/** A percentage the API already worked out (60 for 60%), as text: "60%", "33.33%". */
export const percentText = (percent: number) => `${Number(percent.toFixed(2))}%`;
