import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type SiteLog = Schemas["SiteLogResponse"];
export type MySite = Schemas["MySiteResponse"];

/** What a daily log may hold, as the API keeps it (SiteTeamRules.MaxLogLength). */
export const SITE_LOG_MAX = 2000;

/** A log needs words, a voice note, or both. */
export const SITE_LOG_EMPTY = "Write what happened or record a voice note.";

export type SiteLogFilters = { projectId?: number | null; userId?: number | null; from?: string; to?: string; search?: string; page?: number; pageSize?: number };

const logsKey = ["site-logs"] as const;

/**
 * Daily logs, newest first: the caller's own (`mine`, site_log:create) or everyone's on the sites they see
 * (site_log:view_all). Days are company days, both inclusive.
 */
export function useSiteLogs(mine: boolean, filters: SiteLogFilters, enabled = true) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""));
    return useQuery({
        queryKey: [...logsKey, mine ? "mine" : "all", params],
        queryFn: async () => (await http.get<Paged<SiteLog>>(mine ? "/me/site-logs" : "/site-logs", { params })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** The sites the caller oversees, newest assignment first. */
export function useMySites(enabled = true) {
    return useQuery({
        queryKey: [...logsKey, "my-sites"],
        queryFn: async () => (await http.get<MySite[]>("/me/sites")).data,
        enabled,
    });
}

export function useWriteSiteLog() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ projectId, ...log }: { projectId: number } & Schemas["SaveSiteLogRequest"]) =>
            (await http.post<SiteLog>(`/projects/${projectId}/site-logs`, log)).data,
        onSuccess: () => { void invalidate(logsKey); },
    });
}

/** The writer changes a log on the day it was written; `voiceFileId` null removes its voice note, the same id keeps it. */
export function useEditSiteLog() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, ...log }: { id: number } & Schemas["SaveSiteLogRequest"]) => (await http.put<SiteLog>(`/site-logs/${id}`, log)).data,
        onSuccess: () => { void invalidate(logsKey); },
    });
}

/** Who oversees a site (project:edit), all of them. */
export function useSetSiteStaff(projectId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (staffIds: number[]) => (await http.put<Schemas["ProjectResponse"]>(`/projects/${projectId}/staff`, { staffIds })).data,
        onSuccess: () => { void invalidate(keys.projects.all, logsKey); },
    });
}
