import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type CompanyOverview = Schemas["CompanyOverviewResponse"];
export type CompanyMonth = Schemas["CompanyMonthResponse"];
export type Overhead = Schemas["OverheadResponse"];
export type OverheadLine = Schemas["OverheadLineResponse"];
export type OverheadGroup = Schemas["OverheadCostGroup"];

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
export function useCompanyMonths(months: number) {
    return useQuery({
        queryKey: ["company", "months", months],
        queryFn: async () => (await http.get<CompanyMonth[]>("/company/overview/monthly", { params: { months } })).data,
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

/** Cancels a line after this month, or undoes that until the month ends (overhead:manage). */
export function useCancelOverhead() {
    const refresh = useRefreshCompany();
    return useMutation({
        mutationFn: async ({ id, resume }: { id: number; resume: boolean }) => { await http.post(`/company/overhead/${id}/${resume ? "resume" : "cancel"}`); },
        onSuccess: refresh,
    });
}
