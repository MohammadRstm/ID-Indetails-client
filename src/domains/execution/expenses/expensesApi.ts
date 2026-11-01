import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type SiteExpense = Schemas["SiteExpenseResponse"];
export type SiteExpenseList = Schemas["SiteExpenseListResponse"];
export type SiteExpenseCategory = Schemas["SiteExpenseCategory"];

/** Filters for a site's expenses, as the API takes them. Everything is optional; `from` and `to` are the day it was spent. */
export type ExpenseQuery = {
    type?: string;
    supplier?: string;
    addedById?: number;
    category?: SiteExpenseCategory;
    accountLabelId?: number;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    pageSize?: number;
};

/** Under the project, so anything that refreshes the project refreshes its expenses too. */
export const expensesKey = (projectId: number) => [...keys.projects.detail(projectId), "expenses"] as const;

/** One page of a site's expenses, newest recorded first, with the totals and the filter choices (project:view). */
export function useExpenses(projectId: number, query: ExpenseQuery = {}, enabled = true) {
    const params = { page: 1, pageSize: 30, ...query };
    return useQuery({
        queryKey: [...expensesKey(projectId), params],
        queryFn: async () => (await http.get<SiteExpenseList>(`/projects/${projectId}/site-expenses`, { params })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Every expense on a site, fetched a hundred at a time: for figures and choices that cover all of them. */
export function useAllExpenses(projectId: number, enabled = true) {
    return useQuery({
        queryKey: [...expensesKey(projectId), "all"],
        queryFn: async () => {
            const items: SiteExpense[] = [];
            for (let page = 1; ; page++) {
                const { data } = await http.get<SiteExpenseList>(`/projects/${projectId}/site-expenses`, { params: { page, pageSize: 100 } });
                items.push(...data.items);
                if (items.length >= data.totalCount || data.items.length === 0) return { ...data, items };
            }
        },
        enabled,
    });
}

/** Everything an expense moves: the site's figures and money, the domain's, the dashboards and the feed. */
function useRefreshSite() {
    const invalidate = useInvalidate();
    // a client's page shows what their sites cost
    return () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); };
}

// The API takes at most this many expenses at once.
const BATCH = 100;

/**
 * Adds the rows of the Add expenses sheet, a hundred at a time (material:create). Each batch is saved on its
 * own, so `onSaved` hears how many rows each one took: if a later batch fails, those are already recorded and
 * mustn't be sent again.
 */
export function useAddExpenses(projectId: number, onSaved?: (count: number) => void) {
    const refresh = useRefreshSite();
    return useMutation({
        mutationFn: async (items: Schemas["NewSiteExpenseRequest"][]) => {
            const added: SiteExpense[] = [];
            for (let i = 0; i < items.length; i += BATCH) {
                const batch = items.slice(i, i + BATCH);
                added.push(...(await http.post<SiteExpense[]>(`/projects/${projectId}/site-expenses`, { items: batch })).data);
                onSaved?.(batch.length);
            }
            return added;
        },
        onSettled: refresh,
    });
}

/**
 * Puts a saved expense straight into the lists already loaded, so the next cell changed on its row starts
 * from what was just saved rather than from a list that is still being fetched again.
 */
function useSaved(projectId: number) {
    const queryClient = useQueryClient();
    const refresh = useRefreshSite();
    return (saved: SiteExpense) => {
        queryClient.setQueriesData<SiteExpenseList>({ queryKey: expensesKey(projectId) }, (list) =>
            list && { ...list, items: list.items.map((e) => (e.id === saved.id ? saved : e)) });
        refresh();
    };
}

/**
 * Your own expense with material:create, anyone's with material:manage, while the site is open. The whole row goes:
 * a label left out would clear it.
 */
export function useUpdateExpense(projectId: number) {
    const saved = useSaved(projectId);
    return useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Schemas["SiteExpenseEntryRequest"] }) =>
            (await http.put<SiteExpense>(`/projects/${projectId}/site-expenses/${id}`, body)).data,
        onSuccess: saved,
    });
}

export function useDeleteExpense(projectId: number) {
    const queryClient = useQueryClient();
    const refresh = useRefreshSite();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/projects/${projectId}/site-expenses/${id}`); },
        onSuccess: (_, id) => {
            // gone from the table at once, so its armed Delete can't be clicked again while the list reloads
            queryClient.setQueriesData<SiteExpenseList>({ queryKey: expensesKey(projectId) }, (list) =>
                list && { ...list, items: list.items.filter((e) => e.id !== id), totalCount: Math.max(0, list.totalCount - 1) });
            refresh();
        },
    });
}
