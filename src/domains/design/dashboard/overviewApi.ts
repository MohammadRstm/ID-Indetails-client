import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type Overview = Schemas["OverviewResponse"];
export type OverviewPeriod = Schemas["OverviewPeriod"];

/** Design's logged work over a period against the one before, with what needs attention (report:view). */
export function useOverview(period: OverviewPeriod, enabled = true) {
    return useQuery({
        queryKey: keys.dashboard.overview(period),
        queryFn: async () => (await http.get<Overview>("/reports/overview", { params: { period } })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Project counts, clients and the longest-running projects (report:view). */
export function useDashboard(domain: string) {
    return useQuery({
        queryKey: keys.dashboard.domain(domain),
        queryFn: async () => (await http.get<Schemas["DashboardResponse"]>(`/dashboard/${domain}`)).data,
    });
}

/** Open requirements overdue or due in the next two weeks (report:view). */
export function useUpcomingDeadlines(domain: string, enabled = true) {
    return useQuery({
        queryKey: keys.dashboard.deadlines(domain),
        queryFn: async () => (await http.get<Schemas["UpcomingDeadlinesResponse"]>(`/dashboard/${domain}/deadlines`)).data,
        enabled,
    });
}
