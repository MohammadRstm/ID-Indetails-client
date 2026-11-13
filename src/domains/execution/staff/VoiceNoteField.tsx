import { useState } from "react";
import Icon from "@/shared/icons/Icon";
import RecordingBar from "@/shared/voice/RecordingBar";
import VoicePlayer from "@/shared/voice/VoicePlayer";
import type { VoiceNote } from "./useVoiceNote";

/** Under a daily log's text: record a voice note, or hear the one it has and remove it. */
export default function VoiceNoteField({ voice }: { voice: VoiceNote }) {
    const { rec } = voice;
    const [asking, setAsking] = useState(false);

    async function start() {
        setAsking(true);
        try { await rec.start(); } finally { setAsking(false); }
    }

    return (
        <div className="voice-field">
            {rec.state !== "idle" ? (
                <RecordingBar seconds={rec.seconds} stopped={rec.state === "recorded"} doneLabel="Done"
                    onDone={() => void voice.finishRecording()} onDiscard={rec.discard} />
            ) : voice.recording || voice.kept ? (
                <div className="row" style={{ gap: 8 }}>
                    <VoicePlayer fileId={voice.recording ? undefined : voice.kept?.id} src={voice.recording ?? undefined} />
                    <button type="button" className="btn btn-sm btn-quiet" onClick={voice.remove}><Icon name="trash" />Remove</button>
                </div>
            ) : (
                <button type="button" className="btn btn-sm" disabled={asking} onClick={() => void start()}><Icon name="mic" />Record a voice note</button>
            )}
            {voice.error && <div className="err mt-s" role="alert" style={{ fontSize: "11.5px" }}><Icon name="alert" />{voice.error}</div>}
        </div>
    );
}
