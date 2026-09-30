import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type SiteSummary = Schemas["SiteSummaryResponse"];
export type SiteRecords = Schemas["SiteRecordsResponse"];

/** Each site's card figures: what was recorded there, and when the caller last recorded something (project:view). */
export function useSiteSummaries(ids: number[]) {
    const sorted = [...ids].sort((a, b) => a - b);
    return useQuery({
        // under the projects, so a material or labour week recorded anywhere refreshes the cards
        queryKey: [...keys.projects.all, "site-summary", sorted],
        queryFn: async () => (await http.get<SiteSummary[]>("/projects/site-summary", { params: { ids: sorted } })).data,
        enabled: sorted.length > 0,
    });
}

/** What someone recorded on sites: the signed-in person's own, or anyone's with employee:view. */
export function useSiteRecords(userId: number | "me", enabled = true) {
    return useQuery({
        queryKey: [...keys.projects.all, "site-records", userId],
        queryFn: async () => (await http.get<SiteRecords>(userId === "me" ? "/me/site-records" : `/employees/${userId}/site-records`)).data,
        enabled,
    });
}
