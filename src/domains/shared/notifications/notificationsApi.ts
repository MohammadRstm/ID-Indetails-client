import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Paged, Schemas } from "@/api/types";
import type { Notification } from "./notificationWords";

const notificationsKey = ["notifications"] as const;
const PAGE = 30;

/** The newest few, for the bell's list. */
export function useLatestNotifications(enabled: boolean) {
    return useQuery({
        queryKey: [...notificationsKey, "latest"],
        queryFn: async () => (await http.get<Paged<Notification>>("/notifications", { params: { page: 1, pageSize: 9 } })).data,
        enabled,
    });
}

/** Everything, newest first, a page at a time; or only what is unread. */
export function useNotificationPages(unreadOnly: boolean) {
    return useInfiniteQuery({
        queryKey: [...notificationsKey, "list", { unreadOnly }],
        queryFn: async ({ pageParam }) =>
            (await http.get<Paged<Notification>>("/notifications", { params: { page: pageParam, pageSize: PAGE, unreadOnly: unreadOnly || null } })).data,
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined),
    });
}

/** Marks one read or all of them; the bell's count comes back with the answer. */
export function useMarkRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number | "all") =>
            (await http.post<Schemas["UnreadCountResponse"]>(id === "all" ? "/notifications/read-all" : `/notifications/${id}/read`)).data,
        onSuccess: (count) => {
            queryClient.setQueryData([...notificationsKey, "unread"], count.unread);
            void queryClient.invalidateQueries({ queryKey: notificationsKey, predicate: (q) => q.queryKey[1] !== "unread" });
        },
    });
}
