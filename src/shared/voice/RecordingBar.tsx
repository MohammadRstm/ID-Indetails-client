import Icon from "@/shared/icons/Icon";
import { fmtClock, MAX_VOICE_SECONDS } from "./voiceFormat";

type RecordingBarProps = {
    seconds: number;
    /** The recording has stopped by itself at the time limit. */
    stopped: boolean;
    /** Stop and keep it (a button the caller names: "Send", "Done"). */
    doneLabel: string;
    onDone: () => void;
    onDiscard: () => void;
    busy?: boolean;
};

/** While recording: a pulsing dot, the running time, and Discard / done buttons. */
export default function RecordingBar({ seconds, stopped, doneLabel, onDone, onDiscard, busy }: RecordingBarProps) {
    return (
        <div className="voice-recording" role="group" aria-label="Voice note">
            {!stopped && <span className="voice-dot" aria-hidden="true" />}
            <span className="voice-clock mono" role="timer" aria-label="Recording time">{fmtClock(seconds)}</span>
            <span className="muted grow trunc" style={{ fontSize: "11.5px" }}>
                {stopped ? `That is the longest a voice note can be (${fmtClock(MAX_VOICE_SECONDS)}).` : "Recording…"}
            </span>
            <button type="button" className="btn btn-sm" onClick={onDiscard} disabled={busy}><Icon name="trash" />Discard</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={onDone} disabled={busy}>
                <Icon name={doneLabel === "Send" ? "send" : "stop"} />{doneLabel}
            </button>
        </div>
    );
}
