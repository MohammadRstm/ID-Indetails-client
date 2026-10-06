import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type Salaries = Schemas["SalariesResponse"];
export type SalaryRow = Schemas["SalaryRowResponse"];
export type SalaryDetail = Schemas["SalaryDetailResponse"];
export type HourExcuse = Schemas["HourExcuseResponse"];

export type SalaryYear = Schemas["SalaryYearResponse"];
export type SalaryYearRow = Schemas["SalaryYearRowResponse"];

export type SalaryParams = { month: string; domain: string | null; search: string; page: number; pageSize: number };

const salariesKey = ["company", "salaries"] as const;

/** What everyone is owed for a month, a page at a time, with totals over every page (salary:view). */
export function useSalaries(params: SalaryParams, enabled = true) {
    return useQuery({
        queryKey: [...salariesKey, "list", params],
        queryFn: async () => (await http.get<Salaries>("/company/salaries", { params: { ...params, search: params.search || null } })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** What everyone was owed month by month over a year, up to this month (salary:view). */
export function useSalaryYear(params: { year: number; domain: string | null; search: string }) {
    return useQuery({
        queryKey: [...salariesKey, "year", params],
        queryFn: async () => (await http.get<SalaryYear>("/company/salaries/year", { params: { ...params, search: params.search || null } })).data,
        placeholderData: keepPreviousData,
    });
}

/** How one person's month adds up: hours owed, overtime, excuses and deductions (salary:view). */
export function useSalary(userId: number, month: string) {
    return useQuery({
        queryKey: [...salariesKey, "detail", userId, month],
        queryFn: async () => (await http.get<SalaryDetail>(`/company/salaries/${userId}`, { params: { month } })).data,
    });
}

/** An excuse moves the salaries, the person's hours balance and overtime, and their own pay page. */
function useRefreshPay() {
    const invalidate = useInvalidate();
    return () => { void invalidate(salariesKey, keys.employees.all, keys.work.all); };
}

/** Excuses minutes, days or a whole month of someone's (hours:excuse). */
export function useAddExcuse(userId: number) {
    const refresh = useRefreshPay();
    return useMutation({
        mutationFn: async (body: Schemas["AddHourExcuseRequest"]) => (await http.post<HourExcuse>(`/employees/${userId}/hour-excuses`, body)).data,
        onSuccess: refresh,
    });
}

export function useRemoveExcuse() {
    const refresh = useRefreshPay();
    return useMutation({
        mutationFn: async (excuseId: number) => { await http.delete(`/hour-excuses/${excuseId}`); },
        onSuccess: refresh,
    });
}
