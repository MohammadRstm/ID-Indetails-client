import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type SiteTimeline = Schemas["SiteMoneyTimelineResponse"];

/** Cash week by week from the start, and when profit would reach zero at today's crew and day rate (financial:view). */
export function useSiteTimeline(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "site-timeline"],
        queryFn: async () => (await http.get<SiteTimeline>(`/projects/${projectId}/site-money/timeline`)).data,
        enabled,
    });
}

/** The supervision rate and the TVA, with why they change (project:pricing_manage). The work price comes from agreed BOQs. */
export function useSetPricing(projectId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateProjectPricingRequest"]) => (await http.put<Schemas["ProjectResponse"]>(`/projects/${projectId}/pricing`, body)).data,
        onSuccess: () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); },
    });
}
