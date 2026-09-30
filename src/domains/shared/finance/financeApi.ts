import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type FinanceSummary = Schemas["FinanceSummaryResponse"];
export type FinanceClient = Schemas["FinanceClientResponse"];
export type FinanceMonth = Schemas["FinanceMonthResponse"];
export type FinanceProjects = Schemas["FinanceProjectsResponse"];
export type FinanceBilling = Schemas["FinanceBillingResponse"];
export type MoneyAttention = Schemas["MoneyAttentionResponse"];
export type FinanceCosts = Schemas["FinanceCostsResponse"];

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

/** Every project with its revenue, cost, profit and margin. Needs financial:view. */
export function useFinanceProjects(domain: string, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.projects(domain),
        queryFn: async () => (await http.get<FinanceProjects>(`/finance/${domain}/projects`)).data,
        enabled,
    });
}

/** What was invoiced and collected month by month, what is owed and the open invoices. Needs financial:view. */
export function useFinanceBilling(domain: string, months: number, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.billing(domain, months),
        queryFn: async () => (await http.get<FinanceBilling>(`/finance/${domain}/billing`, { params: { months } })).data,
        enabled,
    });
}

/** Money worth a look: overdue invoices, finished work still owed, no payment recorded, cost running high. Needs financial:view. */
export function useFinanceAttention(domain: string, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.attention(domain),
        queryFn: async () => (await http.get<MoneyAttention[]>(`/finance/${domain}/attention`)).data,
        enabled,
    });
}

/** Labour by person, expenses by category and the biggest expenses over a period. Needs financial:view. */
export function useFinanceCosts(domain: string, range: { from?: string; to?: string }, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.costs(domain, range),
        queryFn: async () => (await http.get<FinanceCosts>(`/finance/${domain}/costs`, { params: range })).data,
        enabled,
    });
}
