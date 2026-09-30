import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type LabourWeekList = Schemas["LabourWeekListResponse"];
export type LabourWeek = Schemas["LabourWeekResponse"];
export type LabourDefaults = Schemas["LabourDefaultsResponse"];
export type LabourDefault = Schemas["LabourDefaultResponse"];

/** Under the project, so anything that refreshes the project refreshes its labour too. */
export const labourKey = (projectId: number) => [...keys.projects.detail(projectId), "labour"] as const;

/** Every week from the site's start, newest first, reported or not, with the total so far (project:view). */
export function useLabourWeeks(projectId: number, enabled = true) {
    return useQuery({
        queryKey: [...labourKey(projectId), "weeks"],
        queryFn: async () => (await http.get<LabourWeekList>(`/projects/${projectId}/labour-weeks`)).data,
        enabled,
    });
}

/** One week: as reported, or, before it is, filled in from the defaults up to today. */
export function useLabourWeek(projectId: number, weekStart: string | null) {
    return useQuery({
        queryKey: [...labourKey(projectId), "week", weekStart],
        queryFn: async () => (await http.get<LabourWeek>(`/projects/${projectId}/labour-weeks/${weekStart}`)).data,
        enabled: weekStart != null,
    });
}

/** The crew size and day rate new weeks start from, and every change to them. */
export function useLabourDefaults(projectId: number) {
    return useQuery({
        queryKey: [...labourKey(projectId), "defaults"],
        queryFn: async () => (await http.get<LabourDefaults>(`/projects/${projectId}/labour-defaults`)).data,
    });
}

/**
 * Ground labour moves the site's cost and profit, the domain's figures, the dashboards and the feed. The save
 * doesn't wait for them: the panel is drawn again from the fresh defaults, which would drop what the caller
 * does once it is saved.
 */
function useRefreshSite() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); };
}

/** Submits a week, or replaces the days of one already reported (labour_report:create for your own, :manage for anyone's). */
export function useSubmitWeek(projectId: number) {
    const refresh = useRefreshSite();
    return useMutation({
        mutationFn: async ({ weekStart, body }: { weekStart: string; body: Schemas["SubmitLabourWeekRequest"] }) =>
            (await http.put<LabourWeek>(`/projects/${projectId}/labour-weeks/${weekStart}`, body)).data,
        onSuccess: refresh,
    });
}

/** New defaults, applying from today (labour_report:manage). */
export function useSetLabourDefaults(projectId: number) {
    const refresh = useRefreshSite();
    return useMutation({
        mutationFn: async (body: Schemas["SetLabourDefaultsRequest"]) => (await http.post<LabourDefaults>(`/projects/${projectId}/labour-defaults`, body)).data,
        onSuccess: refresh,
    });
}
