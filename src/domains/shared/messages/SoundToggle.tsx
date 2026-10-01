import Icon from "@/shared/icons/Icon";
import { playSent, setMessageSounds, useMessageSounds } from "./messageSounds";

/** Turns the messages' sounds on or off for this browser; turning them on plays one, so it is heard. */
export default function SoundToggle() {
    const on = useMessageSounds();
    const label = on ? "Turn message sounds off" : "Turn message sounds on";
    return (
        <button type="button" className="icon-btn" aria-label={label} title={label} aria-pressed={on}
            onClick={() => {
                setMessageSounds(!on);
                if (!on) playSent();
            }}>
            <Icon name={on ? "volume" : "volumeOff"} />
        </button>
    );
}
