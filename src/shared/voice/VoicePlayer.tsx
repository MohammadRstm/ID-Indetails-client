import { useRef, useState } from "react";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import { fmtClock } from "./voiceFormat";

type VoicePlayerProps = {
    /** A voice note saved on the server. */
    fileId?: number;
    /** Or a recording not sent yet (an object URL). */
    src?: string;
};

/** A voice note: play or pause, a bar to move along it, and the time (where it is / how long it is). */
export default function VoicePlayer({ fileId, src }: VoicePlayerProps) {
    const loaded = useFileUrl(fileId);
    const url = src ?? loaded.url;
    const audio = useRef<HTMLAudioElement>(null);
    // Chrome's recordings say their length is Infinity until played to the end; while this is true the player
    // has jumped to the end to learn it, and ignores the audio's position
    const measuring = useRef(false);
    const [playing, setPlaying] = useState(false);
    const [at, setAt] = useState(0);
    const [length, setLength] = useState(0);

    if (loaded.isError && !src) return <div className="voice-player voice-failed"><Icon name="alert" />The voice note couldn't be loaded.</div>;

    function onMetadata() {
        const el = audio.current;
        if (el && el.duration === Infinity) {
            measuring.current = true;
            el.currentTime = Number.MAX_SAFE_INTEGER;
        }
    }

    function onDuration() {
        const el = audio.current;
        if (!el) return;
        if (Number.isFinite(el.duration)) setLength(el.duration);
        if (measuring.current && Number.isFinite(el.duration)) {
            measuring.current = false;
            el.currentTime = 0;
            setAt(0);
        }
    }

    function toggle() {
        const el = audio.current;
        if (!el) return;
        if (el.paused) void Promise.resolve(el.play()).catch(() => setPlaying(false));
        else el.pause();
    }

    return (
        <div className="voice-player">
            <audio ref={audio} src={url} preload="metadata"
                onLoadedMetadata={onMetadata} onDurationChange={onDuration}
                onTimeUpdate={() => { if (!measuring.current && audio.current) setAt(audio.current.currentTime); }}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setAt(0); }} />
            <button type="button" className="icon-btn voice-play" disabled={!url} onClick={toggle} aria-label={playing ? "Pause voice note" : "Play voice note"}>
                <Icon name={playing ? "pause" : "play"} />
            </button>
            <input type="range" className="voice-seek" aria-label="Position in the voice note" disabled={!url || length === 0}
                min={0} max={length || 1} step="any" value={Math.min(at, length || 1)}
                onChange={(e) => { const t = +e.target.value; setAt(t); if (audio.current) audio.current.currentTime = t; }} />
            <span className="voice-time mono">{fmtClock(at)} / {fmtClock(length)}</span>
        </div>
    );
}
