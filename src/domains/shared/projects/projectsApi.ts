import { keepPreviousData, useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type ProjectSummary = Schemas["ProjectSummaryResponse"];
export type Project = Schemas["ProjectResponse"];
export type ProjectStatus = Schemas["ProjectStatus"];
export type ProjectSort = Schemas["ProjectSort"];
export type ProjectTotals = Schemas["ProjectListTotalsResponse"];

export type ProjectListParams = {
    domain: string;
    search?: string;
    status?: ProjectStatus;
    clientId?: number;
    billingType?: "client" | "internal";
    ownerId?: number;
    year?: number;
    quarter?: number;
    sort?: ProjectSort;
    page?: number;
    pageSize?: number;
};

/** Leaves out the filters that aren't set, so equal filters share a cache entry. */
function clean<T extends object>(params: T): Partial<T> {
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null)) as Partial<T>;
}

export function useProjects(params: ProjectListParams, enabled = true) {
    const p = clean(params);
    return useQuery({
        queryKey: keys.projects.list(p),
        queryFn: async () => (await http.get<Paged<ProjectSummary>>("/projects", { params: p })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** The list's header money: the same filters, paging aside. Needs financial:view. */
export function useProjectTotals(params: ProjectListParams, enabled: boolean) {
    const p = clean({ ...params, page: undefined, pageSize: undefined, sort: undefined });
    return useQuery({
        queryKey: keys.projects.totals(p),
        queryFn: async () => (await http.get<ProjectTotals>("/projects/totals", { params: p })).data,
        enabled,
        placeholderData: keepPreviousData,
    });
}

const STATUSES: (ProjectStatus | "all")[] = ["all", "active", "hold", "completed", "archived"];

/** How many of the domain's projects are in each status, for the filter chips. */
export function useProjectStatusCounts(domain: string) {
    const results = useQueries({
        queries: STATUSES.map((status) => ({
            queryKey: [...keys.projects.counts(domain), status],
            queryFn: async () => (await http.get<Paged<ProjectSummary>>("/projects", {
                params: clean({ domain, status: status === "all" ? undefined : status, page: 1, pageSize: 1 }),
            })).data.totalCount,
            staleTime: 60_000,
        })),
    });
    return Object.fromEntries(STATUSES.map((s, i) => [s, results[i].data])) as Record<ProjectStatus | "all", number | undefined>;
}

/** One project; an id that isn't a number never reaches the API. */
export function useProject(id: number) {
    return useQuery({
        queryKey: keys.projects.detail(id),
        queryFn: async () => (await http.get<Project>(`/projects/${id}`)).data,
        enabled: Number.isInteger(id) && id > 0,
    });
}

export type CreateProjectBody = Schemas["CreateProjectRequest"];

export function useCreateProject() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: CreateProjectBody) => (await http.post<Project>("/projects", body)).data,
        onSuccess: () => { void invalidate(keys.projects.all, keys.clients.all, keys.dashboard.all, keys.activity.all); },
    });
}

export function useUpdateProject(id: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateProjectRequest"]) => (await http.put<Project>(`/projects/${id}`, body)).data,
        onSuccess: () => { void invalidate(keys.projects.all, keys.activity.all); },
    });
}

/** A status change the API allows from each status. */
export type StatusAction = "hold" | "resume" | "complete" | "archive" | "reopen";

export const STATUS_ACTIONS: Record<ProjectStatus, StatusAction[]> = {
    active: ["hold", "complete", "archive"],
    hold: ["resume", "complete", "archive"],
    completed: ["archive", "reopen"],
    archived: ["reopen"],
};

/** The action that moves a project from its status to another, if the API allows it. */
export function actionFor(from: ProjectStatus, to: ProjectStatus): StatusAction | null {
    const wanted: Record<ProjectStatus, StatusAction[]> = {
        active: ["resume", "reopen"],
        hold: ["hold"],
        completed: ["complete"],
        archived: ["archive"],
    };
    return STATUS_ACTIONS[from].find((a) => wanted[to].includes(a)) ?? null;
}

export function useChangeProjectStatus(id: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (action: StatusAction) => (await http.post<Project>(`/projects/${id}/${action}`)).data,
        // Completing ticks every open requirement; reopening unticks those again.
        // not awaited: the close-out window's own onSuccess (its toast with Undo) has to run before the project
        // comes back completed and the window goes
        onSuccess: () => { void invalidate(keys.projects.all, keys.requirements.all, keys.activity.all, keys.dashboard.all, keys.clients.all, keys.finance.all); },
    });
}
