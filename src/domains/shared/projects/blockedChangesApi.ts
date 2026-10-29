import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

export type BlockedChange = Schemas["BlockedChangeResponse"];

/** A change the profit floor refused: what it was, where it stands, and the project's profit today. */
export function useBlockedChange(id: number | null) {
    return useQuery({
        queryKey: ["blocked-changes", id],
        queryFn: async () => (await http.get<BlockedChange>(`/blocked-changes/${id}`)).data,
        enabled: id != null,
    });
}

/**
 * Forcing or dismissing it. Forcing makes the change itself (an expense, materials, a labour week, hours, a payment),
 * so whatever the project shows may change: everything is read again.
 */
function useDecide(action: "force" | "dismiss") {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<BlockedChange>(`/blocked-changes/${id}/${action}`)).data,
        onSuccess: () => queryClient.invalidateQueries(),
    });
}

/** Makes the refused change, past the floor; once. */
export const useForceBlockedChange = () => useDecide("force");

export const useDismissBlockedChange = () => useDecide("dismiss");
