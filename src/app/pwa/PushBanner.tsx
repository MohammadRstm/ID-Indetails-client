import { useState } from "react";
import { useCurrentUser } from "@/app/session/useSession";
import Icon from "@/shared/icons/Icon";
import { isStandalone } from "./install";
import { pushBannerAway, putPushBannerAway, usePush } from "./push";

/**
 * In the installed app only, until notifications are on: the phone app's notifications are the reason to install it.
 * It shows even when the phone already allows them (Android lets people allow them in its settings), since allowing
 * them doesn't sign this device up: only turning them on here does. Put away, or turned off, it stays away for a month;
 * the account menu still turns them on.
 */
export default function PushBanner() {
    const me = useCurrentUser();
    const push = usePush(me.id);
    // read on every render: turning them off from the account menu puts the banner away too
    const [putAwayHere, setPutAwayHere] = useState(false);
    if (putAwayHere || pushBannerAway() || push.state !== "off" || !isStandalone()) return null;

    const putAway = () => {
        setPutAwayHere(true);
        putPushBannerAway();
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
