import Popover from "@/shared/components/Overlays/Popover";
import MessagesDropdown from "@/domains/shared/messages/MessagesDropdown";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useUnreadBadges } from "./shellQueries";

/** The Messages icon of the header and the launcher: unread chats on its badge ("@" for a mention), the latest chats in its menu. */
export default function MessagesButton({ messagesPath }: { messagesPath: string }) {
    const badges = useUnreadBadges();
    const unread = badges.messages?.unread ?? 0;
    return (
        <Popover
            align="right"
            trigger={(open, toggle) => (
                <button className={cx("icon-btn", open && "on")} onClick={toggle} aria-label="Messages">
                    <Icon name="chat" />
                    {unread > 0 && <span className="msg-badge">{badges.messages?.mention ? "@" : unread > 9 ? "9+" : unread}</span>}
                </button>
            )}
        >
            {(close) => <MessagesDropdown messagesPath={messagesPath} close={close} />}
        </Popover>
    );
}
