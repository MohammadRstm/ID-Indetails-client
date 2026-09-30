import { useNavigate } from "react-router";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import NotificationItem from "./NotificationItem";
import { useLatestNotifications, useMarkRead } from "./notificationsApi";

/** The bell's panel (the prototype's P.NotificationDropdown): the newest nine, and a way to all of them. */
export default function NotificationDropdown({ unread, allPath, close }: { unread: number; allPath: string; close: () => void }) {
    const navigate = useNavigate();
    const latest = useLatestNotifications(true);
    const markRead = useMarkRead();
    const list = latest.data?.items ?? [];

    return (
        <div style={{ width: 356, maxWidth: "80vw" }}>
            <div className="pop-head">
                <div className="grow"><b>Notifications</b>{unread > 0 && <span className="muted"> · {unread} unread</span>}</div>
                <button className="btn btn-sm btn-quiet" disabled={markRead.isPending || unread === 0} onClick={() => markRead.mutate("all")}>Mark all read</button>
            </div>
            <div className="notif-list">
                {latest.isError ? <div style={{ padding: 10 }}><LoadError error={latest.error} retry={() => latest.refetch()} what="your notifications" /></div>
                    : !latest.data ? <div style={{ padding: 10 }}><SkeletonLines lines={4} /></div>
                        : list.length === 0 ? <Empty art="done" title="You're all caught up" />
                            : list.map((n) => <NotificationItem key={n.id} note={n} onOpen={close} />)}
            </div>
            <div className="pop-foot">
                <button className="btn btn-sm btn-block btn-quiet" onClick={() => { close(); navigate(allPath); }}>See all notifications</button>
            </div>
        </div>
    );
}
