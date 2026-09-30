import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

type Layout = Schemas["BoardLayoutResponse"];

const layoutKey = (board: string) => ["me", "board-layout", board] as const;

/** The signed-in person's saved card order for a board; null when they never changed it. */
export function useBoardLayout(board: string) {
    return useQuery({
        queryKey: layoutKey(board),
        queryFn: async () => (await http.get<Layout>(`/me/board-layouts/${board}`)).data,
        staleTime: Infinity,
    });
}

/** Saves a new order, or goes back to the default one (null). */
export function useSaveBoardLayout(board: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (order: string[] | null): Promise<Layout> => {
            if (order == null) {
                await http.delete(`/me/board-layouts/${board}`);
                return { key: board, order: null, savedAt: null };
            }
            return (await http.put<Layout>(`/me/board-layouts/${board}`, { order })).data;
        },
        onSuccess: (layout) => queryClient.setQueryData(layoutKey(board), layout),
    });
}

/** The saved order reconciled with the cards a page has today: gone cards drop out, new ones join where they are by default. */
export function resolveOrder(saved: readonly string[] | null | undefined, defaults: string[]): string[] {
    if (!saved) return defaults.slice();
    const out = saved.filter((k) => defaults.includes(k));
    defaults.forEach((k, i) => {
        if (!out.includes(k)) out.splice(Math.min(i, out.length), 0, k);
    });
    return out;
}
