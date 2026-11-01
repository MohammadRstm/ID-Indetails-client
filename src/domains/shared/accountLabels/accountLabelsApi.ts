import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type AccountLabel = Schemas["AccountLabelResponse"];

/** The longest an account label's name can be: the API's limit. */
export const ACCOUNT_LABEL_NAME_MAX = 40;

/**
 * The company's account labels in their order (Concrete, Finishing, Permits…), for a select on a payment or an expense.
 * The archived ones are only listed for a super admin who asks for them, to restore.
 */
export function useAccountLabels(includeArchived = false, enabled = true) {
    return useQuery({
        queryKey: keys.accountLabels.list(includeArchived),
        queryFn: async () => (await http.get<AccountLabel[]>("/account-labels", { params: includeArchived ? { includeArchived: true } : undefined })).data,
        enabled,
    });
}

/** Adds a label (no id) or renames one (super admin). A name already in use comes back as account_label_taken. */
export function useSaveAccountLabel() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, name }: { id: number | null; name: string }) =>
            (id == null ? await http.post<AccountLabel>("/account-labels", { name }) : await http.put<AccountLabel>(`/account-labels/${id}`, { name })).data,
        onSuccess: () => { void invalidate(keys.accountLabels.all); },
    });
}

/** Archives a label so it can't be picked any more, or restores it; what already uses it keeps it (super admin). */
export function useArchiveAccountLabel() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, archive }: { id: number; archive: boolean }) =>
            (await http.post<AccountLabel>(`/account-labels/${id}/${archive ? "archive" : "restore"}`)).data,
        onSuccess: () => { void invalidate(keys.accountLabels.all); },
    });
}

/** Sets the order of the labels from the ids, first to last (super admin). */
export function useReorderAccountLabels() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (ids: number[]) => { await http.put("/account-labels/order", { ids }); },
        onSuccess: () => { void invalidate(keys.accountLabels.all); },
    });
}
