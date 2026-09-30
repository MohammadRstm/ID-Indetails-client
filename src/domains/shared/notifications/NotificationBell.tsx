import { useUnreadBadges } from "@/app/shell/shellQueries";
import Popover from "@/shared/components/Overlays/Popover";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import NotificationDropdown from "./NotificationDropdown";

/** The bell in the top bar and on the launcher: a dot while anything is unread, the newest few on a click. */
export default function NotificationBell({ allPath }: { allPath: string }) {
    const unread = useUnreadBadges().notifications;
    return (
        <Popover align="right"
            trigger={(open, toggle) => (
                <button className={cx("icon-btn", open && "on")} onClick={toggle} aria-label="Notifications">
                    <Icon name="bell" />{unread > 0 && <span className="pip" />}
                </button>
            )}>
            {(close) => <NotificationDropdown unread={unread} allPath={allPath} close={close} />}
        </Popover>
    );
}
