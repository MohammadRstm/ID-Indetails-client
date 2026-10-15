import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalHttp, type PortalAccount } from "../portalApi";

export type PortalNotificationKind = "team_message" | "team_comment" | "mention";

export type PortalNotification = {
    id: number;
    kind: PortalNotificationKind;
    projectId: number;
    projectTitle: string;
    /** Who wrote last. */
    actorName: string;
    /** The file, for comment notifications. */
    itemId: number | null;
    itemTitle: string | null;
    /** A rolling notification: "3 new messages". */
    count: number;
    createdAt: string;
    read: boolean;
};

type NotificationPage = { items: PortalNotification[]; hasMore: boolean };

const PAGE = 20;

/** Everything the bell shows starts with this, so a live signal can refresh it all. */
export const portalBellKey = ["portal", "notifications"] as const;
export const portalUnreadKey = [...portalBellKey, "unread"] as const;
const listKey = [...portalBellKey, "list"] as const;
/** The signed-in client and their projects, with what is unread in each. */
export const portalMeKey = ["portal", "me"] as const;

/** How many notifications are unread: the bell's badge. */
export function usePortalUnreadCount() {
    return useQuery({
        queryKey: portalUnreadKey,
        queryFn: async () => (await portalHttp.get<{ unread: number }>("/notifications/unread-count")).data.unread,
    });
}

/** The bell's list, newest first, a page at a time (each page continues before the last one's id). */
export function usePortalNotifications() {
    return useInfiniteQuery({
        queryKey: listKey,
        queryFn: async ({ pageParam }) => (await portalHttp.get<NotificationPage>("/notifications", { params: { before: pageParam, limit: PAGE } })).data,
        initialPageParam: undefined as number | undefined,
        getNextPageParam: (last) => (last.hasMore ? last.items[last.items.length - 1]?.id : undefined),
    });
}

/** Marks some read, or all of them; the bell's count comes back with the answer. */
export function useMarkPortalNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (which: { ids: number[] } | { all: true }) =>
            (await portalHttp.post<{ unread: number }>("/notifications/read", which)).data,
        onSuccess: (answer) => {
            queryClient.setQueryData(portalUnreadKey, answer.unread);
            void queryClient.invalidateQueries({ queryKey: listKey });
        },
    });
}

/** The client and their projects as the API sees them now: the unread counts on the home page. */
export function usePortalMe() {
    return useQuery({
        queryKey: portalMeKey,
        queryFn: async () => (await portalHttp.get<PortalAccount>("/me")).data,
    });
}
