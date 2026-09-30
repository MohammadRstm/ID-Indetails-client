import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type FinanceSummary = Schemas["FinanceSummaryResponse"];
export type FinanceClient = Schemas["FinanceClientResponse"];
export type FinanceMonth = Schemas["FinanceMonthResponse"];

/** Revenue, cost, profit and margin over a period, with the billing position. Needs financial:view. */
export function useFinanceSummary(domain: string, range: { from?: string; to?: string }, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.summary(domain, range),
        queryFn: async () => (await http.get<FinanceSummary>(`/finance/${domain}/summary`, { params: range })).data,
        enabled,
    });
}

/** Every client with projects and their money, most revenue first. Needs financial:view. */
export function useFinanceClients(domain: string, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.clients(domain),
        queryFn: async () => (await http.get<FinanceClient[]>(`/finance/${domain}/clients`)).data,
        enabled,
    });
}

/** Revenue, cost and profit month by month, oldest first. Needs financial:view. */
export function useFinanceMonthly(domain: string, months: number, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.monthly(domain, months),
        queryFn: async () => (await http.get<FinanceMonth[]>(`/finance/${domain}/monthly`, { params: { months } })).data,
        enabled,
    });
}
