import Icon from "@/shared/icons/Icon";
import { playSent, setMessageSounds, useMessageSounds } from "./messageSounds";

/**
 * Turns the app's sounds (messages and notifications) on or off for this browser; turning them on plays one, so it
 * is heard. In Messages and in the bell's list.
 */
export default function SoundToggle() {
    const on = useMessageSounds();
    const label = on ? "Turn sounds off" : "Turn sounds on";
    return (
        <button type="button" className="icon-btn" aria-label={label} title={`${label} (messages and notifications)`} aria-pressed={on}
            onClick={() => {
                setMessageSounds(!on);
                if (!on) playSent();
            }}>
            <Icon name={on ? "volume" : "volumeOff"} />
        </button>
    );
}
