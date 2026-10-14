import Popover from "@/shared/components/Overlays/Popover";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import PortalNotificationList from "./PortalNotificationList";
import { usePortalUnreadCount } from "./notificationsApi";

/** The bell in the portal's top bar: how many notifications are unread, and the list on a click. */
export default function PortalBell() {
    const unread = usePortalUnreadCount().data ?? 0;
    return (
        <Popover align="right" hostClass="pn-host" className="pn-pop"
            trigger={(open, toggle) => (
                <button type="button" className={cx("icon-btn", open && "on")} onClick={toggle} aria-expanded={open}
                    aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
                    <Icon name="bell" />
                    {unread > 0 && <span className="pn-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
                </button>
            )}>
            {(close) => <PortalNotificationList unread={unread} close={close} />}
        </Popover>
    );
}
