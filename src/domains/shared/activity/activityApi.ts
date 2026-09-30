import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type ActivityGroup = Schemas["ActivityGroup"];

export type FeedFilters = {
    domain: string;
    group?: ActivityGroup;
    projectId?: number;
    clientId?: number;
    /** Only projects without a client. */
    internal?: boolean;
    /** Whoever did it. */
    userId?: number;
};

const PAGE = 40;

/** The domain's activity, newest first, a page at a time (activity:view; work needs work_entry:view_all). */
export function useActivityFeed(filters: FeedFilters, enabled = true) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== false));
    return useInfiniteQuery({
        queryKey: [...keys.activity.all, "feed", params],
        queryFn: async ({ pageParam }) =>
            (await http.get<Paged<Schemas["ActivityItemResponse"]>>("/activity", { params: { ...params, page: pageParam, pageSize: PAGE } })).data,
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined),
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Design work started today, by the hour it was logged (activity:view and work_entry:view_all). */
export function useActivityToday(enabled: boolean) {
    return useQuery({
        queryKey: [...keys.activity.all, "today"],
        queryFn: async () => (await http.get<Schemas["ActivityTodayResponse"]>("/activity/today")).data,
        enabled,
    });
}

/** The newest few events, for a page's "Recent activity" (activity:view). */
export function useRecentActivity(filters: FeedFilters, count: number, enabled = true) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== false));
    return useQuery({
        queryKey: [...keys.activity.all, "recent", params, count],
        queryFn: async () => (await http.get<Paged<Schemas["ActivityItemResponse"]>>("/activity", { params: { ...params, page: 1, pageSize: count } })).data.items,
        enabled,
    });
}
