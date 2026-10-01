import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type CompanyOverview = Schemas["CompanyOverviewResponse"];
export type CompanyMonth = Schemas["CompanyMonthResponse"];
export type Overhead = Schemas["OverheadResponse"];
export type OverheadLine = Schemas["OverheadLineResponse"];
export type OverheadGroup = Schemas["OverheadGroupResponse"];

/** Both domains and the company's own expenses over a window, this month to date by default (company:view). */
export function useCompanyOverview(range: { from: string; to: string }) {
    return useQuery({
        // the launcher reads this month's the same way
        queryKey: ["company", "overview", range.from, range.to],
        queryFn: async () => (await http.get<CompanyOverview>("/company/overview", { params: range })).data,
        placeholderData: keepPreviousData,
    });
}

/** Revenue, costs and company expenses month by month, this one included (company:view). */
export function useCompanyMonths(months: number, enabled = true) {
    return useQuery({
        queryKey: ["company", "months", months],
        queryFn: async () => (await http.get<CompanyMonth[]>("/company/overview/monthly", { params: { months } })).data,
        enabled,
    });
}

/** The same for a year's months, January first, up to this month in the current year (company:view). */
export function useCompanyYear(year: number, enabled = true) {
    return useQuery({
        queryKey: ["company", "months", "year", year],
        queryFn: async () => (await http.get<CompanyMonth[]>("/company/overview/monthly", { params: { year } })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Company expenses alone, month by month and per currency (company:view or overhead:manage). */
export function useOverheadMonths(months: number, enabled = true) {
    return useQuery({
        queryKey: ["company", "overhead", "months", months],
        queryFn: async () => (await http.get<Schemas["OverheadMonthResponse"][]>("/company/overhead/monthly", { params: { months } })).data,
        enabled,
    });
}

const overheadKey = ["company", "overhead"] as const;

/** Every recurring company expense, with this month's totals by group and currency (company:view or overhead:manage). */
export function useOverhead() {
    return useQuery({
        queryKey: overheadKey,
        queryFn: async () => (await http.get<Overhead>("/company/overhead")).data,
    });
}

/** The categories of company expenses, first to last ("Other" last), with how many expenses use each. */
export function useOverheadGroups() {
    return useQuery({
        queryKey: [...overheadKey, "groups"],
        queryFn: async () => (await http.get<OverheadGroup[]>("/company/overhead/groups")).data,
        staleTime: 60_000,
    });
}

/** A change to the company's expenses moves its overview, its months and the launcher's figures. */
function useRefreshCompany() {
    const invalidate = useInvalidate();
    return () => { void invalidate(["company"]); };
}

export function useAddOverhead() {
    const refresh = useRefreshCompany();
    return useMutation({
        mutationFn: async (body: Schemas["CreateOverheadRequest"]) => (await http.post<OverheadLine>("/company/overhead", body)).data,
        onSuccess: refresh,
    });
}

/** What a change to a line does: its name and group, its amount from a month, or its currency from a month. */
export type OverheadChange =
    | { kind: "details"; body: Schemas["UpdateOverheadRequest"] }
    | { kind: "amount"; body: Schemas["ChangeOverheadAmountRequest"] }
    | { kind: "currency"; body: Schemas["ChangeOverheadCurrencyRequest"] };

/** Applies a line's changes one after another (overhead:manage). */
export function useChangeOverhead(id: number) {
    const refresh = useRefreshCompany();
    return useMutation({
        mutationFn: async (changes: OverheadChange[]) => {
            for (const c of changes) {
                if (c.kind === "details") await http.put(`/company/overhead/${id}`, c.body);
                else if (c.kind === "amount") await http.post(`/company/overhead/${id}/amounts`, c.body);
                else await http.post(`/company/overhead/${id}/currency`, c.body);
            }
        },
        onSettled: refresh,
    });
}

/** Adds a category, before "Other" (super admins only). */
export function useAddOverheadGroup() {
    const refresh = useRefreshCompany();
    return useMutation({
        mutationFn: async (name: string) => (await http.post<OverheadGroup>("/company/overhead/groups", { name })).data,
        onSuccess: refresh,
    });
}

/** Renames a category; its expenses keep it (super admins only). */
export function useRenameOverheadGroup() {
    const refresh = useRefreshCompany();
    return useMutation({
        mutationFn: async ({ id, name }: { id: number; name: string }) => (await http.put<OverheadGroup>(`/company/overhead/groups/${id}`, { name })).data,
        onSuccess: refresh,
    });
}

/** Removes a category no expense uses (super admins only). */
export function useRemoveOverheadGroup() {
    const refresh = useRefreshCompany();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/company/overhead/groups/${id}`); },
        onSuccess: refresh,
    });
}

/** Cancels a line after this month, or undoes that until the month ends (overhead:manage). */
export function useCancelOverhead() {
    const refresh = useRefreshCompany();
    return useMutation({
        // true when a line that hadn't started was removed rather than cancelled (the API answers 204)
        mutationFn: async ({ id, resume }: { id: number; resume: boolean }) => (await http.post(`/company/overhead/${id}/${resume ? "resume" : "cancel"}`)).status === 204,
        onSuccess: refresh,
    });
}
