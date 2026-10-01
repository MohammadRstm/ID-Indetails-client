import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type EmployeeSummary = Schemas["EmployeeSummaryResponse"];

export const personName = (p: { firstName?: string | null; lastName?: string | null; email: string }) =>
    `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email;

/**
 * The people of a domain, for pickers (owners, assignees). Up to the API's largest page; a domain has
 * fewer people than that.
 */
export function useDomainPeople(domain: string, enabled: boolean, params: { role?: string; status?: string } = {}) {
    const p = { domain, pageSize: 100, ...params };
    return useQuery({
        queryKey: keys.employees.list(p),
        queryFn: async () => (await http.get<Paged<EmployeeSummary>>("/employees", { params: p })).data.items,
        enabled,
        staleTime: 5 * 60_000,
    });
}

export type PeopleQuery = { search?: string; domain?: string; role?: string; status?: string; page: number; pageSize: number };

/** Everyone the viewer may see, a page at a time: the company area's list of people (employee:view). */
export function usePeople(params: PeopleQuery) {
    const p = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
    return useQuery({
        queryKey: keys.employees.list(p),
        queryFn: async () => (await http.get<Paged<EmployeeSummary>>("/employees", { params: p })).data,
        placeholderData: keepPreviousData,
    });
}
