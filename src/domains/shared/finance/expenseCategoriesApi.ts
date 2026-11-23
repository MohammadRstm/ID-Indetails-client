import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

export type ExpenseCategory = Schemas["ExpenseCategoryResponse"];
export type CategoryDomain = "design" | "execution";
export type CategoryChoice = { value: string; label: string };

/** The choice that opens the "Add category" window from a category menu, for whoever manages the categories. */
export const ADD_CATEGORY = "__add_category__";

/** The categories each business started with, shown until its own list loads. */
export const STARTING_CATEGORIES: Record<CategoryDomain, CategoryChoice[]> = {
    design: [
        { value: "assets", label: "Assets & licences" }, { value: "services", label: "Services" }, { value: "contractor", label: "Contractor" },
        { value: "software", label: "Software" }, { value: "travel", label: "Travel" }, { value: "hardware", label: "Hardware" }, { value: "other", label: "Other" },
    ],
    execution: [
        { value: "materials", label: "Materials" }, { value: "contractor", label: "Contractor" }, { value: "equipment", label: "Equipment" },
        { value: "fees", label: "Fees" }, { value: "other", label: "Other" },
    ],
};

const key = (domain: CategoryDomain) => ["expense-categories", domain] as const;

/** A business's expense categories, in its order (Settings › Finance). */
export function useExpenseCategories(domain: CategoryDomain, enabled = true) {
    return useQuery({
        queryKey: key(domain),
        queryFn: async () => (await http.get<ExpenseCategory[]>("/expense-categories", { params: { domain } })).data,
        enabled,
        staleTime: 5 * 60_000,
    });
}

/** The business's categories as a menu's choices: its own once loaded, the ones it started with until then. */
export function useCategoryChoices(domain: CategoryDomain): CategoryChoice[] {
    const list = useExpenseCategories(domain).data;
    return list ? list.map((c) => ({ value: c.code, label: c.name })) : STARTING_CATEGORIES[domain];
}

/** A category's name by its code, in the business's list, or the code in words for one no longer listed. */
export function useCategoryName(domain: CategoryDomain): (code: string) => string {
    const choices = useCategoryChoices(domain);
    return (code) => choices.find((c) => c.value === code)?.label ?? (code.charAt(0).toUpperCase() + code.slice(1)).replace(/_/g, " ");
}

function useRefresh(domain: CategoryDomain) {
    const queryClient = useQueryClient();
    return () => { void queryClient.invalidateQueries({ queryKey: key(domain) }); };
}

export function useAddExpenseCategory(domain: CategoryDomain) {
    const refresh = useRefresh(domain);
    return useMutation({
        mutationFn: async (name: string) => (await http.post<ExpenseCategory>("/expense-categories", { domain, name })).data,
        onSuccess: refresh,
    });
}

export function useRenameExpenseCategory(domain: CategoryDomain) {
    const refresh = useRefresh(domain);
    return useMutation({
        mutationFn: async ({ id, name }: { id: number; name: string }) => (await http.put<ExpenseCategory>(`/expense-categories/${id}`, { name })).data,
        onSuccess: refresh,
    });
}

export function useOrderExpenseCategories(domain: CategoryDomain) {
    const refresh = useRefresh(domain);
    return useMutation({
        mutationFn: async (ids: number[]) => (await http.put<ExpenseCategory[]>("/expense-categories/order", { domain, ids })).data,
        onSuccess: refresh,
    });
}

export function useRemoveExpenseCategory(domain: CategoryDomain) {
    const refresh = useRefresh(domain);
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/expense-categories/${id}`); },
        onSuccess: refresh,
    });
}
