import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";
import { CATEGORIES } from "../../../execution/expenses/expenseRules";

export type ProjectBudget = Schemas["ProjectBudgetResponse"];
export type BudgetVersion = Schemas["ProjectBudgetVersionResponse"];
export type BudgetLine = Schemas["ProjectBudgetLineResponse"];
export type SetBudget = Schemas["SetProjectBudgetRequest"];

/** Why a budget changes: required, at most this long (the API's limit). */
export const BUDGET_REASON_MAX = 500;

/** One line a budget can have: a Design department (teamId) or a category of cost. */
export type BudgetLineKey = { id: string; teamId: number | null; category: string | null; name: string };

/** A site's budget lines: its expense categories, then its ground labour. */
const SITE_LINES: { category: string; name: string }[] = [
    ...CATEGORIES.map((c) => ({ category: c.value as string, name: c.label })),
    { category: "ground_labour", name: "Ground labour" },
];

const lineId = (teamId: number | null, category: string | null) => (teamId != null ? `team-${teamId}` : `cat-${category}`);

/**
 * The lines a budget is set by: a Design project's departments, then its expenses; an Execution site's categories
 * of cost and its ground labour.
 */
export function budgetLineKeys(domain: string, departments: { id: number; name: string }[]): BudgetLineKey[] {
    if (domain === "execution") return SITE_LINES.map((l) => ({ id: lineId(null, l.category), teamId: null, category: l.category, name: l.name }));
    return [
        ...departments.map((d) => ({ id: lineId(d.id, null), teamId: d.id, category: null, name: d.name })),
        { id: lineId(null, "expenses"), teamId: null, category: "expenses", name: "Expenses" },
    ];
}

/** What a line was budgeted at in the budget now, or nothing when it had no line. */
export function currentAmount(budget: ProjectBudget | undefined, key: BudgetLineKey): number | null {
    if (!budget?.current) return null;
    const line = budget.lines.find((l) => (key.teamId != null ? l.teamId === key.teamId : l.teamId == null && l.category === key.category));
    return line ? line.amount : null;
}

/** A project's cost budget: the version in force, each line against what it has cost, and every version (financial:view). */
export function useProjectBudget(projectId: number, enabled = true) {
    return useQuery({
        queryKey: keys.projects.budget(projectId),
        queryFn: async () => (await http.get<ProjectBudget>(`/projects/${projectId}/budget`)).data,
        enabled,
    });
}

/**
 * Sets a new version of the budget, with why (financial:write on a Design project, project:pricing_manage on a site).
 * The project's figures that compare cost with the budget, and the feed, follow.
 */
export function useSetProjectBudget(projectId: number) {
    const queryClient = useQueryClient();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: SetBudget) => (await http.put<ProjectBudget>(`/projects/${projectId}/budget`, body)).data,
        onSuccess: (saved) => {
            queryClient.setQueryData(keys.projects.budget(projectId), saved);
            void invalidate(keys.projects.detail(projectId), keys.finance.all, keys.activity.all);
        },
    });
}
