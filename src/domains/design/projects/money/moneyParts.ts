import type { WaterfallStep } from "@/shared/components/Charts/Waterfall";
import type { Project } from "../../../shared/projects/projectsApi";

type ProjectMoney = NonNullable<Project["money"]>;

export const COST_COLORS = { labour: "var(--heat-3)", expense: "var(--heat-1)", siteExpenses: "var(--heat-4)", ground: "var(--heat-2)" };

/** Labour, then any site expenses and ground labour, then expenses: Design projects have only the first and last. */
export function costParts(m: ProjectMoney) {
    return [
        { label: "Employee labour", value: m.cost.labour, color: COST_COLORS.labour },
        ...(m.cost.siteExpenses ? [{ label: "Site expenses", value: m.cost.siteExpenses, color: COST_COLORS.siteExpenses }] : []),
        ...(m.cost.groundLabour ? [{ label: "Ground labour", value: m.cost.groundLabour, color: COST_COLORS.ground }] : []),
        { label: "Project expenses", value: m.cost.expenses, color: COST_COLORS.expense },
    ];
}

/** Payment, each cost taken away, then what's left. */
export function profitSteps(m: ProjectMoney): WaterfallStep[] {
    return [
        { label: "Payment", value: m.revenue, kind: "start" },
        { label: "Labour", value: m.cost.labour, kind: "cost", sub: `${Math.round(m.labourHours)}h` },
        ...(m.cost.siteExpenses ? [{ label: "Site expenses", value: m.cost.siteExpenses, kind: "cost" as const }] : []),
        ...(m.cost.groundLabour ? [{ label: "Ground labour", value: m.cost.groundLabour, kind: "cost" as const }] : []),
        { label: "Expenses", value: m.cost.expenses, kind: "cost" },
        { label: m.isLocked ? "Final profit" : "Profit", value: 0, kind: "result" },
    ];
}
