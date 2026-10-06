import { useState } from "react";
import { useUnreadBadges } from "@/app/shell/shellQueries";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Segmented } from "@/shared/components/Forms/Filters";
import { dayKey, relDay } from "@/shared/format/time";
import NotificationItem from "./NotificationItem";
import type { Notification } from "./notificationWords";
import { useMarkRead, useNotificationPages } from "./notificationsApi";
import { loadFailed } from "@/api/queryState";

/** Everything the bell has said, by day (the prototype's P.Notifications). */
export default function NotificationsPage() {
    const [tab, setTab] = useState<"all" | "unread">("all");
    const pages = useNotificationPages(tab === "unread");
    const everything = useNotificationPages(false);
    const markRead = useMarkRead();
    const unread = useUnreadBadges().notifications;
    const list = pages.data?.pages.flatMap((p) => p.items) ?? [];
    const total = everything.data?.pages[0]?.totalCount ?? 0;

    const groups: { key: string; items: Notification[] }[] = [];
    for (const n of list) {
        const key = dayKey(n.createdAt);
        const last = groups[groups.length - 1];
        if (last?.key === key) last.items.push(n);
        else groups.push({ key, items: [n] });
    }

    return (
        <div className="page page-reading">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Notifications</h1>
                    <div className="page-sub">{unread} unread of {total}</div>
                </div>
                <div className="page-actions">
                    <Segmented aria-label="Show" value={tab} onChange={setTab} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} />
                    <button className="btn" disabled={markRead.isPending || unread === 0} onClick={() => markRead.mutate("all")}>Mark all read</button>
                </div>
            </div>
            <div className="panel">
                <div className="panel-body" style={{ paddingTop: 4 }}>
                    {loadFailed(pages) ? <div className="mt-s"><LoadError error={pages.error} retry={() => pages.refetch()} what="your notifications" /></div>
                        : !pages.data ? <div className="mt-s"><SkeletonLines lines={8} /></div> : (
                            <>
                                {groups.map((g) => (
                                    <div key={g.key}>
                                        <div className="feed-day">{relDay(g.key)}</div>
                                        {g.items.map((n) => <NotificationItem key={n.id} note={n} />)}
                                    </div>
                                ))}
                                {list.length === 0 && <Empty art="done" title="Nothing here" text="Unread notifications will appear here." />}
                                {pages.hasNextPage && (
                                    <div className="mt-s" style={{ textAlign: "center" }}>
                                        <button className="btn btn-sm btn-quiet" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()}>
                                            {pages.isFetchingNextPage ? "Loading…" : "Show older notifications"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                </div>
            </div>
        </div>
    );
}
