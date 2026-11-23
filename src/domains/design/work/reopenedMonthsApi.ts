import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { MONTHS_LONG } from "@/shared/format/time";

export type ReopenedMonth = Schemas["ReopenedMonthResponse"];

const KEY = ["reopened-months"] as const;

/** The closed months open for logging again today (a super admin reopened them until a day), oldest first. */
export function useReopenedMonths(enabled = true) {
    return useQuery({ queryKey: KEY, queryFn: async () => (await http.get<ReopenedMonth[]>("/reopened-months")).data, enabled, staleTime: 5 * 60_000 });
}

/** Opens a closed month (yyyy-MM) until a day, or moves that day. */
export function useReopenMonth() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ month, ...body }: Schemas["ReopenMonthRequest"] & { month: string }) =>
            (await http.put<ReopenedMonth>(`/reopened-months/${month}`, body)).data,
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: KEY }); },
    });
}

/** Locks a reopened month again now. */
export function useEndReopen() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (month: string) => { await http.delete(`/reopened-months/${month}`); },
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: KEY }); },
    });
}

/** "October 2026" from "2026-10". */
export function monthName(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** The closed months, newest first, going back `count` months: the month just ended stays open through the 1st. */
export function closedMonths(today: string, count = 36): string[] {
    const [y, m, d] = today.split("-").map(Number);
    let back = d === 1 ? 2 : 1;
    const out: string[] = [];
    while (out.length < count) {
        const date = new Date(Date.UTC(y, m - 1 - back, 1));
        out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
        back++;
    }
    return out;
}
