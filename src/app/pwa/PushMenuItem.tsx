import { useCurrentUser } from "@/app/session/useSession";
import Icon from "@/shared/icons/Icon";
import { usePush } from "./push";

/** "Turn on notifications" (or off) in an account menu, for this device, where the browser can get them. */
export default function PushMenuItem({ close }: { close: () => void }) {
    const me = useCurrentUser();
    const push = usePush(me.id);
    if (push.state === "blocked") {
        return (
            <button className="pop-item" disabled title="Allow notifications for this site in the browser's settings">
                <Icon name="bell" />Notifications blocked
            </button>
        );
    }
    if (push.state !== "on" && push.state !== "off") return null;
    const on = push.state === "on";
    return (
        <button className="pop-item" disabled={push.busy} onClick={() => { close(); void (on ? push.turnOff() : push.turnOn()); }}>
            <Icon name="bell" />{on ? "Turn off notifications" : "Turn on notifications"}
        </button>
    );
}
