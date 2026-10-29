import type { Domain } from "@/app/permissions/permissions";
import type { Schemas } from "@/api/types";

/** A period's cost as the API splits it. A project's (and a client's) names the site expenses `siteExpenses`; see `projectCostOf`. */
type Cost = Schemas["PeriodCostResponse"];

export type CostPart = { key: keyof Pick<Cost, "labour" | "expenses" | "materials" | "groundLabour">; label: string; column: string; color: string };

/*
 * What a domain's money is spent on. Design's cost is its employees' logged hours and project expenses;
 * an Execution site's is its site expenses (materials, contractors, equipment, fees) and its ground labour. Nobody
 * logs hours on a site, and no project expense can be added to one any more, so its "other costs" stay at nothing.
 */
const PARTS: Record<Domain, CostPart[]> = {
    design: [
        { key: "labour", label: "Employee labour", column: "Labour", color: "var(--heat-3)" },
        { key: "expenses", label: "Project expenses", column: "Expenses", color: "var(--heat-1)" },
    ],
    execution: [
        { key: "materials", label: "Site expenses", column: "Site expenses", color: "var(--heat-2)" },
        { key: "groundLabour", label: "Ground labour", column: "Ground labour", color: "var(--warn-mark)" },
        { key: "expenses", label: "Other costs", column: "Other costs", color: "var(--heat-1)" },
    ],
};

export const costPartsOf = (domain: Domain) => PARTS[domain];

/** One part of a project's or a client's cost, which the API names `siteExpenses` where a period's says `materials`. */
export const projectCostOf = (cost: Schemas["ProjectCostResponse"], part: CostPart) => (part.key === "materials" ? cost.siteExpenses : cost[part.key]);

/** "Labour and expenses", "Site expenses, ground labour and other costs". */
export function costWords(domain: Domain): string {
    const words = PARTS[domain].map((p, i) => (i === 0 ? p.column : p.column.toLowerCase()));
    return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0];
}
