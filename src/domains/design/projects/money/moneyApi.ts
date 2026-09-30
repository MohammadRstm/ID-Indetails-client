import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type Expense = Schemas["ExpenseResponse"];
export type CostTimeline = Schemas["ProjectCostTimelineResponse"];

const expensesKey = (projectId: number) => [...keys.projects.detail(projectId), "expenses"] as const;

/** Everything a change to a project's money moves: the project, the domain's figures, the dashboards, the feed. */
function useInvalidateMoney() {
    const invalidate = useInvalidate();
    return () => invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all);
}

/** A project's expenses, newest first (expense:manage or financial:view). */
export function useProjectExpenses(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: expensesKey(projectId),
        queryFn: async () => (await http.get<Schemas["ExpenseListResponse"]>(`/projects/${projectId}/expenses`)).data,
        enabled,
    });
}

export function useAddExpense(projectId: number) {
    const refresh = useInvalidateMoney();
    return useMutation({
        mutationFn: async (body: Schemas["CreateExpenseRequest"]) => (await http.post<Expense>(`/projects/${projectId}/expenses`, body)).data,
        onSuccess: refresh,
    });
}

export function useDeleteExpense(projectId: number) {
    const refresh = useInvalidateMoney();
    return useMutation({
        mutationFn: async (expenseId: number) => { await http.delete(`/projects/${projectId}/expenses/${expenseId}`); },
        onSuccess: refresh,
    });
}

/** Client or internal work, its client and its customer payment (project:edit). */
export function useSetProjectBilling(projectId: number) {
    const refresh = useInvalidateMoney();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateProjectBillingRequest"]) => (await http.put<Schemas["ProjectResponse"]>(`/projects/${projectId}/billing`, body)).data,
        onSuccess: refresh,
    });
}

/** Cost and payments week by week (financial:view). */
export function useCostTimeline(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "cost-timeline"],
        queryFn: async () => (await http.get<CostTimeline>(`/projects/${projectId}/cost-timeline`)).data,
        enabled,
    });
}

/** The customer payment's last changes, from the project's money events (activity:view). */
export function useRevenueHistory(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.activity.all, "revenue", projectId],
        queryFn: async () => (await http.get<Paged<Schemas["ActivityItemResponse"]>>("/activity", { params: { projectId, group: "money", page: 1, pageSize: 40 } })).data.items
            .filter((e) => e.kind === "revenue_set" || e.kind === "revenue_changed")
            .slice(0, 4),
        enabled,
    });
}
