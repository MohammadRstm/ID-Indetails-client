import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type AccountFigures = Schemas["AccountFiguresResponse"];
export type SupervisionWithdrawal = Schemas["SupervisionWithdrawalResponse"];

/** The longest a note on supervision taken can be, and the most one can be for: the API's limits. */
export const SUPERVISION_NOTE_MAX = 500;
export const SUPERVISION_AMOUNT_MAX = 999_999_999_999.99;

/**
 * An Execution client site's account, worked out by the API: the price, what was received, the costs, the supervision,
 * the cash in the account and the rest by label (financial:view). Under the project's key, so what changes the project
 * or its payments refreshes it.
 */
export function useAccountFigures(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "account-figures"],
        queryFn: async () => (await http.get<AccountFigures>(`/projects/${projectId}/account-figures`)).data,
        enabled,
    });
}

/** What the company has taken of the site's supervision, the latest day first (financial:view). */
export function useSupervisionWithdrawals(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "supervision-withdrawals"],
        queryFn: async () => (await http.get<SupervisionWithdrawal[]>(`/projects/${projectId}/supervision-withdrawals`)).data,
        enabled,
    });
}

/** Records supervision taken out of the site's account (payment:record). It is not a cost: profit doesn't move. */
export function useTakeSupervision(projectId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["TakeSupervisionRequest"]) =>
            (await http.post<SupervisionWithdrawal>(`/projects/${projectId}/supervision-withdrawals`, body)).data,
        onSuccess: () => { void invalidate(keys.projects.all, keys.activity.all); },
    });
}

/** Removes a recorded withdrawal: it stays in the books, marked removed (payment:record). */
export function useRemoveSupervision() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/supervision-withdrawals/${id}`); },
        onSuccess: () => { void invalidate(keys.projects.all, keys.activity.all); },
    });
}
