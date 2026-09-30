import type { Domain } from "@/app/permissions/permissions";

/** A cost as the API splits it, for a project, a client or a period. */
type Cost = { labour: number; expenses: number; materials: number; groundLabour: number };

export type CostPart = { key: keyof Cost; label: string; column: string; color: string };

/*
 * What a domain's money is spent on. Design's cost is its employees' logged hours and project expenses;
 * an Execution site's is its materials, its ground labour and project expenses. Nobody logs hours on a site.
 */
const PARTS: Record<Domain, CostPart[]> = {
    design: [
        { key: "labour", label: "Employee labour", column: "Labour", color: "var(--heat-3)" },
        { key: "expenses", label: "Project expenses", column: "Expenses", color: "var(--heat-1)" },
    ],
    execution: [
        { key: "materials", label: "Materials", column: "Materials", color: "var(--heat-2)" },
        { key: "groundLabour", label: "Ground labour", column: "Ground labour", color: "var(--warn-mark)" },
        { key: "expenses", label: "Project expenses", column: "Expenses", color: "var(--heat-1)" },
    ],
};

export const costPartsOf = (domain: Domain) => PARTS[domain];

/** "Labour and expenses", "Materials, ground labour and expenses". */
export function costWords(domain: Domain): string {
    const words = PARTS[domain].map((p, i) => (i === 0 ? p.column : p.column.toLowerCase()));
    return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0];
}
