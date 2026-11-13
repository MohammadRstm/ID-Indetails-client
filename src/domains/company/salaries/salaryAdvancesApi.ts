import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type SalaryAdvance = Schemas["SalaryAdvanceResponse"];
export type SalaryAdvanceMonth = Schemas["SalaryAdvanceMonthResponse"];
export type SalaryAdvanceStatus = Schemas["SalaryAdvanceStatus"];
export type SalaryAdvanceView = Schemas["SalaryAdvanceView"];
export type SalaryAdvanceSettlement = Schemas["SalaryAdvanceSettlement"];
export type SalaryAdvanceSummary = Schemas["SalaryAdvanceSummaryResponse"];
export type MySalaryAdvance = Schemas["MySalaryAdvanceResponse"];
export type MySalaryAdvances = Schemas["MySalaryAdvancesResponse"];
/** A month an advance comes off: `month` is its first day ("yyyy-MM-01"). */
export type PlannedMonth = Schemas["PlannedMonthRequest"];

/** What a reason or a note may hold, as the API keeps it (AdvanceRules.MaxNoteLength). */
export const ADVANCE_NOTE_MAX = 500;

/** Repayment months run from the first month allowed to at most this many months on (AdvanceRules.MaxMonths). */
export const ADVANCE_MAX_MONTHS = 12;

/** Everyone's advances sit under Salaries, so refreshing Salaries refreshes them too. */
const advancesKey = ["company", "salaries", "advances"] as const;

/**
 * An advance moves what Salaries hands over, the person's own list, and (once written off) the company overview's
 * expenses. Pay itself never changes.
 */
function useRefreshAdvances() {
    const invalidate = useInvalidate();
    return () => { void invalidate(["company", "salaries"], keys.advances.mine, ["company", "overview"], ["company", "months"]); };
}

/** The signed-in person's own advances, and whether they may ask for one now. */
export function useMySalaryAdvances(enabled = true) {
    return useQuery({
        queryKey: keys.advances.mine,
        queryFn: async () => (await http.get<MySalaryAdvances>("/me/salary-advances")).data,
        enabled,
    });
}

export function useAskSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async (body: { amount: number; reason: string }) => (await http.post<MySalaryAdvance>("/me/salary-advances", body)).data,
        onSuccess: refresh,
    });
}

export function useWithdrawSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<MySalaryAdvance>(`/me/salary-advances/${id}/withdraw`)).data,
        onSuccess: refresh,
    });
}

/** Everyone's advances, for whoever sees salaries or gives advances: waiting, still being paid back, or closed. */
export function useSalaryAdvances(view: SalaryAdvanceView, page = 1, pageSize = 25) {
    return useQuery({
        queryKey: [...advancesKey, "list", view, page, pageSize],
        queryFn: async () => (await http.get<Paged<SalaryAdvance>>("/company/salary-advances", { params: { view, page, pageSize } })).data,
        placeholderData: keepPreviousData,
    });
}

/** One advance, for a notification that links to it. */
export function useSalaryAdvance(id: number | null) {
    return useQuery({
        queryKey: [...advancesKey, "detail", id],
        queryFn: async () => (await http.get<SalaryAdvance>(`/company/salary-advances/${id}`)).data,
        enabled: id != null,
    });
}

/** A super admin recording an advance they handed over, without a request. */
export function useRecordSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async (body: { userId: number; amount: number; givenOn?: string; months: PlannedMonth[]; note?: string }) =>
            (await http.post<SalaryAdvance>("/company/salary-advances", body)).data,
        onSuccess: refresh,
    });
}

export function useApproveSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; amount?: number; months: PlannedMonth[]; note?: string }) =>
            (await http.post<SalaryAdvance>(`/company/salary-advances/${id}/approve`, body)).data,
        onSuccess: refresh,
    });
}

export function useDeclineSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; note?: string }) =>
            (await http.post<SalaryAdvance>(`/company/salary-advances/${id}/decline`, body)).data,
        onSuccess: refresh,
    });
}

/** The months still open (this month on), adding up to what the closed months don't plan to take. */
export function useChangeAdvanceMonths() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async ({ id, months }: { id: number; months: PlannedMonth[] }) =>
            (await http.put<SalaryAdvance>(`/company/salary-advances/${id}/months`, { months })).data,
        onSuccess: refresh,
    });
}

/** Only in the month it was given: an advance given by mistake. */
export function useCancelSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; note?: string }) =>
            (await http.post<SalaryAdvance>(`/company/salary-advances/${id}/cancel`, body)).data,
        onSuccess: refresh,
    });
}

/** Closes what is left: repaid in cash, or written off as a company expense today. */
export function useSettleSalaryAdvance() {
    const refresh = useRefreshAdvances();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; kind: SalaryAdvanceSettlement; note?: string }) =>
            (await http.post<SalaryAdvance>(`/company/salary-advances/${id}/settle`, body)).data,
        onSuccess: refresh,
    });
}
