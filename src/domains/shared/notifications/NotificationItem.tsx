import { ProjectTile } from "@/shared/components/Data/Bits";
import Avatar from "@/shared/components/Identity/Avatar";
import { relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { describe, type Notification } from "./notificationWords";
import { useMarkRead } from "./notificationsApi";
import { useOpenNotification, useReader } from "./useNotificationLinks";
import { clickable } from "@/shared/utils/clickable";

/**
 * One notification (the prototype's NotifItem): who or what it is about, the sentence, when. A click marks
 * it read and opens what it is about.
 */
export default function NotificationItem({ note, onOpen }: { note: Notification; onOpen?: () => void }) {
    const reader = useReader();
    const markRead = useMarkRead();
    const open = useOpenNotification();
    const view = describe(note, reader);
    const unread = !note.readAt;

    function click() {
        if (unread) markRead.mutate(note.id);
        onOpen?.();
        void open(view);
    }

    return (
        <div className={cx("notif", unread && "unread")} {...clickable(click, "button")}>
            {note.actor ? <Avatar person={{ name: note.actor.name, photoFileId: note.actor.photoFileId }} size={28} />
                : note.project ? <ProjectTile icon={note.project.icon} tint={note.project.tint} />
                    : <span className="feed-ic"><Icon name={view.icon} /></span>}
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="notif-txt">{view.text}</div>
                {view.sub && <div className="muted trunc" style={{ fontSize: "11.5px" }}>{view.sub}</div>}
                <div className="notif-meta"><span>{relTime(note.createdAt)}</span></div>
            </div>
            {unread && <span className="dot dot-on" style={{ marginTop: 6 }} aria-label="Unread" />}
        </div>
    );
}
