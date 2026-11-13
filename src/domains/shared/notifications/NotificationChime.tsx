import { useUnreadBadges } from "@/app/shell/shellQueries";
import { useNotificationChime } from "../messages/messageSounds";

/**
 * The sound a new notification makes, for a screen without the bell (a phone's header and the launcher: its Alerts tab
 * is in the bottom bar). Shows nothing.
 */
export default function NotificationChime() {
    const badges = useUnreadBadges();
    useNotificationChime(badges.notificationsLoaded ? badges.notifications : undefined);
    return null;
}
