import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { dismissVoiceMessage, endVoice, muteVoice, useVoice, voiceActive, type VoiceStatus } from "./protonVoice";

const STATUS: Record<VoiceStatus, string> = {
    idle: "",
    connecting: "Connecting…",
    listening: "Listening",
    thinking: "Looking into it…",
    speaking: "Speaking",
    ending: "Ending…",
    error: "Voice isn't working",
};

/**
 * The voice conversation, above the composer: what Proton is doing, what it hears and says as captions, and mute
 * and end. The questions and answers themselves go into the chat, so nothing here is kept.
 */
export default function ProtonVoiceBar() {
    const voice = useVoice();
    const active = voiceActive(voice.status);
    if (!active && !voice.message) return null;

    return (
        <div className={cx("proton-voice", voice.status)} role="region" aria-label="Voice conversation">
            {active && (
                <div className="proton-voice-head">
                    <span className="proton-voice-dot" aria-hidden="true" />
                    <span className="proton-voice-status" role="status">{voice.muted && voice.status === "listening" ? "Muted" : STATUS[voice.status]}</span>
                    <button
                        className={cx("icon-btn", voice.muted && "on")}
                        onClick={() => muteVoice(!voice.muted)}
                        aria-label={voice.muted ? "Unmute" : "Mute"}
                        aria-pressed={voice.muted}
                        disabled={voice.status === "connecting" || voice.status === "ending"}
                    >
                        <Icon name={voice.muted ? "micOff" : "mic"} />
                    </button>
                    <button className="btn btn-sm" onClick={() => void endVoice()} disabled={voice.status === "ending"}>End</button>
                </div>
            )}
            {active && voice.heard && <div className="proton-voice-caption"><b>You</b> {voice.heard}</div>}
            {active && voice.said && <div className="proton-voice-caption muted"><b>Proton</b> {voice.said}</div>}
            {voice.message && (
                <div className="proton-voice-message">
                    <span>{voice.message}</span>
                    {!active && <button className="icon-btn" onClick={dismissVoiceMessage} aria-label="Dismiss"><Icon name="x" /></button>}
                </div>
            )}
        </div>
    );
}
