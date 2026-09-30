import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

/* Everyone's work on a Design project, for admins (work_entry:view_all). */

export type ProjectWork = Schemas["ProjectWorkResponse"];
export type Contributor = Schemas["ProjectContributorResponse"];
export type ContributorDetail = Schemas["ProjectContributorDetailResponse"];
export type Timeline = Schemas["ProjectTimelineResponse"];
export type TimelineEntry = Schemas["TimelineEntryResponse"];
export type EntryDetail = Schemas["WorkEntryDetailResponse"];

type Range = { from?: string; to?: string; search?: string };
const clean = (p: object) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ""));

/** Totals, contributors, weekly hours and the hour heat, for a range and a work-text search. */
export function useProjectWork(projectId: number, range: Range = {}) {
    const p = clean(range);
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "work", p],
        queryFn: async () => (await http.get<ProjectWork>(`/projects/${projectId}/work`, { params: p })).data,
        placeholderData: keepPreviousData,
    });
}

/** One person's work on the project. */
export function useContributor(projectId: number, userId: number, range: Range = {}) {
    const p = clean(range);
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "work", "person", userId, p],
        queryFn: async () => (await http.get<ContributorDetail>(`/projects/${projectId}/work/people/${userId}`, { params: p })).data,
        placeholderData: keepPreviousData,
    });
}

/** The project's latest entry: who logged what, and for how long. */
export function useLatestEntry(projectId: number) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "latest-entry"],
        queryFn: async () => (await http.get<Paged<Schemas["WorkEntryResponse"]>>("/work-entries", { params: { projectId, page: 1, pageSize: 1 } })).data.items[0] ?? null,
    });
}

/** Who worked on which day, with the project's events and quiet stretches. */
export function useProjectTimeline(projectId: number) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "timeline"],
        queryFn: async () => (await http.get<Timeline>(`/projects/${projectId}/timeline`)).data,
    });
}

/** The entries behind a stretch of the timeline. */
export function useTimelineEntries(projectId: number, from: string, to: string) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "timeline", "entries", from, to],
        queryFn: async () => (await http.get<TimelineEntry[]>(`/projects/${projectId}/timeline/entries`, { params: { from, to } })).data,
        placeholderData: keepPreviousData,
    });
}

/** One entry, the person's other entries that day, and its comments. */
export function useEntryDetail(entryId: number) {
    return useQuery({
        queryKey: ["work", "entry", entryId],
        queryFn: async () => (await http.get<EntryDetail>(`/work-entries/${entryId}`)).data,
    });
}

/** Comments on an entry (work_entry:comment); the author is notified, and the team chat too when asked. */
export function useAddComment(entryId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["AddWorkEntryCommentRequest"]) =>
            (await http.post<Schemas["WorkEntryCommentResponse"]>(`/work-entries/${entryId}/comments`, body)).data,
        onSuccess: () => invalidate(["work", "entry", entryId], ["work", "comments", entryId], keys.work.all, keys.projects.all, keys.activity.all),
    });
}

/** A person's team, for the "also send to their team chat" choice. */
export function useEmployeeTeam(userId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.employees.all, "detail", userId],
        queryFn: async () => (await http.get<Schemas["EmployeeResponse"]>(`/employees/${userId}`)).data,
        enabled,
        staleTime: 5 * 60_000,
        select: (e) => ({ team: e.team, domain: e.domain, position: e.position }),
    });
}
