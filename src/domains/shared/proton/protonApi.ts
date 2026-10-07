import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

export type ProtonReply = Schemas["ProtonReplyResponse"];
export type ProtonPendingAction = Schemas["ProtonPendingAction"];
export type ProtonOutcome = Schemas["ProtonActionOutcomeResponse"];
export type ProtonRef = Schemas["ProtonRef"];

// every key starts with "proton"
const protonKey = ["proton"] as const;

/** The person's question allowance this month (never money), and whether Proton can answer now. */
export function useProtonUsage(enabled = true) {
    return useQuery({
        queryKey: [...protonKey, "usage"],
        queryFn: async () => (await http.get<Schemas["ProtonUsageResponse"]>("/proton/usage")).data,
        enabled,
    });
}

/** One question. The answer may carry a proposed change, which only the person's Confirm carries out. */
export function useAskProton() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: { conversationId: string | null; text: string }) =>
            (await http.post<ProtonReply>("/proton/messages", body)).data,
        onSuccess: (reply) => queryClient.setQueryData([...protonKey, "usage"], reply.usage),
    });
}

/**
 * Confirms or cancels a proposed change: only its id and conversation go to the API, which runs the stored change
 * (or refuses it) itself. A confirmed change can touch anything Proton shows, so every cached screen is refreshed.
 */
export function useDecideAction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ action, conversationId, decision }: { action: ProtonPendingAction; conversationId: string; decision: "confirm" | "cancel" }) =>
            (await http.post<ProtonOutcome>(`/proton/actions/${action.id}/${decision}`, { conversationId })).data,
        onSettled: (_outcome, _error, { decision }) => {
            if (decision === "confirm") void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== protonKey[0] });
        },
    });
}

/** Ends a conversation on the server; the next question starts a new one. */
export function useEndConversation() {
    return useMutation({
        mutationFn: async (conversationId: string) => { await http.delete(`/proton/conversations/${conversationId}`); },
    });
}

export type ProtonSource = Schemas["ProtonSourceResponse"];
export type ProtonBudget = Schemas["ProtonBudgetResponse"];

/** This month's estimated cost against the budget, and where it went: super admins only (proton_budget:manage). */
export function useProtonBudget() {
    return useQuery({
        queryKey: [...protonKey, "budget"],
        queryFn: async () => (await http.get<ProtonBudget>("/proton/budget")).data,
    });
}

/** Adds to this month's budget; the API answers with the budget as it now stands. */
export function useTopUpBudget() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: { amountUsd: number; note: string | null }) =>
            (await http.post<ProtonBudget>("/proton/budget/top-ups", body)).data,
        onSuccess: (budget) => {
            queryClient.setQueryData([...protonKey, "budget"], budget);
            void queryClient.invalidateQueries({ queryKey: [...protonKey, "usage"] });
        },
    });
}
