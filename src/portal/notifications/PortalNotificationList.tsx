import { useNavigate } from "react-router";
import { loadFailed } from "@/api/queryState";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { relTime } from "@/shared/format/time";
import { clickable } from "@/shared/utils/clickable";
import { cx } from "@/shared/utils/cx";
import { describePortalNotification } from "./notificationWords";
import { useMarkPortalNotificationsRead, usePortalNotifications, type PortalNotification } from "./notificationsApi";

/** The bell's panel: the notifications newest first. A click marks one read and opens what it is about. */
export default function PortalNotificationList({ unread, close }: { unread: number; close: () => void }) {
    const navigate = useNavigate();
    const query = usePortalNotifications();
    const markRead = useMarkPortalNotificationsRead();
    const items = query.data?.pages.flatMap((page) => page.items) ?? [];

    function open(note: PortalNotification, link: string) {
        if (!note.read) markRead.mutate({ ids: [note.id] });
        close();
        navigate(link);
    }

    return (
        <div>
            <div className="pop-head">
                <div className="grow"><b>Notifications</b>{unread > 0 && <span className="muted"> · {unread} unread</span>}</div>
                <button type="button" className="btn btn-sm btn-quiet" disabled={markRead.isPending || unread === 0}
                    onClick={() => markRead.mutate({ all: true })}>Mark all as read</button>
            </div>
            <div className="notif-list">
                {loadFailed(query) ? <div style={{ padding: 10 }}><LoadError error={query.error} retry={() => void query.refetch()} what="your notifications" /></div>
                    : !query.data ? <div style={{ padding: 10 }}><SkeletonLines lines={4} /></div>
                        : items.length === 0 ? <Empty art="done" title="No notifications yet" />
                            : items.map((note) => <Item key={note.id} note={note} onOpen={open} />)}
                {query.hasNextPage && (
                    <div className="pn-more">
                        <button type="button" className="btn btn-sm btn-quiet" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                            {query.isFetchingNextPage ? "Loading…" : "Load more"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function Item({ note, onOpen }: { note: PortalNotification; onOpen: (note: PortalNotification, link: string) => void }) {
    const view = describePortalNotification(note);
    return (
        <div className={cx("notif", !note.read && "unread")} {...clickable(() => onOpen(note, view.link), "button")}>
            <Avatar person={{ name: note.actorName }} size={28} />
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="notif-txt">{view.text}</div>
                <div className="notif-meta"><span>{relTime(note.createdAt)}</span></div>
            </div>
            {!note.read && <span className="dot dot-on" style={{ marginTop: 6 }} aria-label="Unread" />}
        </div>
    );
}
