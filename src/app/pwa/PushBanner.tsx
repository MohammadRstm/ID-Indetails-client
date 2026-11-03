import { useState } from "react";
import { useCurrentUser } from "@/app/session/useSession";
import Icon from "@/shared/icons/Icon";
import { isStandalone } from "./install";
import { usePush } from "./push";

const AWAY_KEY = "hourline.push-banner";
const AWAY_MS = 30 * 24 * 60 * 60_000;

function readAway(): boolean {
    try {
        return Date.now() - Number(localStorage.getItem(AWAY_KEY) ?? 0) < AWAY_MS;
    } catch {
        return false;
    }
}

/**
 * In the installed app only, until notifications are on: the phone app's notifications are the reason to install it.
 * Put away, it stays away for a month; the account menu still turns them on.
 */
export default function PushBanner() {
    const me = useCurrentUser();
    const push = usePush(me.id);
    const [away, setAway] = useState(readAway);
    if (away || push.state !== "off" || !isStandalone() || Notification.permission !== "default") return null;

    const putAway = () => {
        setAway(true);
        try {
            localStorage.setItem(AWAY_KEY, String(Date.now()));
        } catch {
            // private window: put away until the app is opened again
        }
    };

    return (
        <div className="banner app-push">
            <Icon name="bell" />
            <span>Get notifications on this device, for your work, messages and reminders.</span>
            <button type="button" className="btn btn-sm btn-primary" disabled={push.busy} onClick={() => { putAway(); void push.turnOn(); }}>
                Turn on
            </button>
            <button type="button" className="icon-btn" aria-label="Not now" title="Not now" onClick={putAway}>
                <Icon name="x" />
            </button>
        </div>
    );
}
