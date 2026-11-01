import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type FinanceOverview = Schemas["FinanceOverviewResponse"];

/**
 * How long money figures count as fresh: returning to the tab within it doesn't load them again. Every change to
 * the money (a payment, an expense, logged work) invalidates them at once, so this only spares the heavy loads.
 */
const MONEY_STALE_MS = 5 * 60_000;
export type FinanceSummary = Schemas["FinanceSummaryResponse"];
export type FinanceClient = Schemas["FinanceClientResponse"];
export type FinanceMonth = Schemas["FinanceMonthResponse"];
export type FinanceProjects = Schemas["FinanceProjectsResponse"];
export type FinanceBilling = Schemas["FinanceBillingResponse"];
export type MoneyAttention = Schemas["MoneyAttentionResponse"];
export type FinanceCosts = Schemas["FinanceCostsResponse"];

/** A part of the overview with its load's state, so a card shows loading and errors as it would with its own query. */
export type FinancePart<T> = { data: T | undefined; isError: boolean; isPending: boolean; error: unknown; refetch: () => unknown };

/**
 * The summary over the range, the last months, every project, billing, the follow-ups and the clients, from one
 * load on the server (a page asking for them one by one loads the domain's money each time). Needs financial:view.
 */
export function useFinanceOverview(domain: string, params: { from?: string; to?: string; months: number }, enabled: boolean) {
    const query = useQuery({
        queryKey: keys.finance.overview(domain, params),
        queryFn: async () => (await http.get<FinanceOverview>(`/finance/${domain}/overview`, { params })).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
    const part = <T,>(pick: (o: FinanceOverview) => T): FinancePart<T> => ({
        data: query.data ? pick(query.data) : undefined,
        isError: query.isError,
        isPending: query.isPending,
        error: query.error,
        refetch: query.refetch,
    });
    return {
        summary: part((o) => o.summary),
        monthly: part((o) => o.monthly),
        projects: part((o) => o.projects),
        billing: part((o) => o.billing),
        attention: part((o) => o.attention),
        clients: part((o) => o.clients),
    };
}

/** Revenue, cost, profit and margin over a period, with the billing position. Needs financial:view. */
export function useFinanceSummary(domain: string, range: { from?: string; to?: string }, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.summary(domain, range),
        queryFn: async () => (await http.get<FinanceSummary>(`/finance/${domain}/summary`, { params: range })).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}

/** Every client with projects and their money, most revenue first. Needs financial:view. */
export function useFinanceClients(domain: string, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.clients(domain),
        queryFn: async () => (await http.get<FinanceClient[]>(`/finance/${domain}/clients`)).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}

/** Revenue, cost and profit month by month, oldest first. Needs financial:view. */
export function useFinanceMonthly(domain: string, months: number, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.monthly(domain, months),
        queryFn: async () => (await http.get<FinanceMonth[]>(`/finance/${domain}/monthly`, { params: { months } })).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}

/** Every project with its revenue, cost, profit and margin. Needs financial:view. */
export function useFinanceProjects(domain: string, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.projects(domain),
        queryFn: async () => (await http.get<FinanceProjects>(`/finance/${domain}/projects`)).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}

/** What was invoiced and collected month by month, what is owed and the open invoices. Needs financial:view. */
export function useFinanceBilling(domain: string, months: number, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.billing(domain, months),
        queryFn: async () => (await http.get<FinanceBilling>(`/finance/${domain}/billing`, { params: { months } })).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}

/** Money worth a look: overdue invoices, finished work still owed, no payment recorded, cost running high. Needs financial:view. */
export function useFinanceAttention(domain: string, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.attention(domain),
        queryFn: async () => (await http.get<MoneyAttention[]>(`/finance/${domain}/attention`)).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}

/** Labour by person, expenses by category and the biggest expenses over a period. Needs financial:view. */
export function useFinanceCosts(domain: string, range: { from?: string; to?: string }, enabled: boolean) {
    return useQuery({
        queryKey: keys.finance.costs(domain, range),
        queryFn: async () => (await http.get<FinanceCosts>(`/finance/${domain}/costs`, { params: range })).data,
        enabled,
        staleTime: MONEY_STALE_MS,
    });
}
