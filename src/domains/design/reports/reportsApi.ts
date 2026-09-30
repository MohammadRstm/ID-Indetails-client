import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type WorkReport = Schemas["WorkReportResponse"];

/** What a report covers: company days, and optionally one project or person. */
export type ReportScope = { from: string; to: string; projectId?: number; userId?: number };

const clean = (p: object) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ""));

/** Logged work in a range, cut every way the Reports page shows it (report:view; money needs financial:view). */
export function useWorkReport(scope: ReportScope) {
    const params = clean(scope);
    return useQuery({
        queryKey: keys.work.report(params),
        queryFn: async () => (await http.get<WorkReport>("/reports/work", { params })).data,
        placeholderData: keepPreviousData,
    });
}

const PAGE = 50;

/** The range's entries, newest first, 50 at a time (work_entry:view_all). */
export function useReportEntries(scope: ReportScope & { search?: string }, enabled: boolean) {
    const params = clean(scope);
    return useInfiniteQuery({
        queryKey: keys.work.reportEntries(params),
        queryFn: async ({ pageParam }) =>
            (await http.get<Paged<Schemas["WorkEntryResponse"]>>("/work-entries", { params: { ...params, page: pageParam, pageSize: PAGE } })).data,
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined),
        placeholderData: keepPreviousData,
        enabled,
    });
}
