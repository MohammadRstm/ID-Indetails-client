import { useEffect, useRef, useState, type CSSProperties } from "react";
import Avatar from "@/shared/components/Identity/Avatar";
import { useFileUrl } from "@/shared/files/useFileUrl";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { fmtClock } from "./voiceFormat";
import { knownWaveform, loadWaveform, placeholderPeaks } from "./waveform";

type VoicePlayerProps = {
    /** A voice note saved on the server. */
    fileId?: number;
    /** Or a recording not sent yet (an object URL). */
    src?: string;
    /** Who recorded it: their photo with a microphone, as a voice app shows it. */
    person?: { name: string; photoFileId?: number | null };
};

const SPEEDS = [1, 1.5, 2] as const;

/**
 * A voice note, as a voice app shows it: who recorded it, play or pause, its waveform with a dot to drag along it,
 * and its length (where it is, while it plays). The waveform comes from the recording itself, decoded once when the
 * note is first on screen; until then, or where the browser can't decode it, a made-up shape stands in. While it
 * plays only a CSS variable moves the dot and the played part along, so nothing re-renders each frame.
 */
export default function VoicePlayer({ fileId, src, person }: VoicePlayerProps) {
    const loaded = useFileUrl(fileId);
    const url = src ?? loaded.url;
    const key = fileId != null ? `file-${fileId}` : src ?? "";
    const audio = useRef<HTMLAudioElement>(null);
    const box = useRef<HTMLDivElement>(null);
    // Chrome's recordings say their length is Infinity until played to the end; while this is true the player
    // has jumped to the end to learn it, and ignores the audio's position
    const measuring = useRef(false);
    const [playing, setPlaying] = useState(false);
    const [at, setAt] = useState(0);
    const [length, setLength] = useState(0);
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
    const [peaks, setPeaks] = useState(() => knownWaveform(key)?.peaks ?? placeholderPeaks(key));

    // the real waveform, once the note is near the screen
    useEffect(() => {
        const el = box.current;
        if (!url || !el || knownWaveform(key)) return;
        let cancelled = false;
        const decode = () => void loadWaveform(key, url, fileId != null).then((w) => {
            if (cancelled || !w) return;
            setPeaks(w.peaks);
            setLength((l) => (l > 0 ? l : w.duration));
        });
        if (typeof IntersectionObserver === "undefined") { decode(); return () => { cancelled = true; }; }
        const seen = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { seen.disconnect(); decode(); } }, { rootMargin: "200px" });
        seen.observe(el);
        return () => { cancelled = true; seen.disconnect(); };
    }, [key, url, fileId]);

    // while it plays, the dot and the played part follow the sound smoothly
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        const step = () => {
            const el = audio.current;
            if (el && box.current && length > 0) box.current.style.setProperty("--p", `${Math.min(100, (el.currentTime / length) * 100)}%`);
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [playing, length]);

    useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);

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

    const share = length > 0 ? Math.min(100, (at / length) * 100) : 0;
    const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    const speedButton = (
        <button type="button" className="voice-speed" onClick={() => setSpeed(nextSpeed)} aria-label={`Play at ${nextSpeed} times the speed`}>
            {speed}×
        </button>
    );

    return (
        <div className={cx("voice-player", person && "with-person")}>
            <audio ref={audio} src={url} preload="metadata"
                onLoadedMetadata={onMetadata} onDurationChange={onDuration}
                onTimeUpdate={() => { if (!measuring.current && audio.current) setAt(audio.current.currentTime); }}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setAt(0); box.current?.style.setProperty("--p", "0%"); }} />
            {person && (
                <div className="voice-who">
                    {playing || speed !== 1 ? speedButton : (
                        <>
                            <Avatar person={{ name: person.name, photoFileId: person.photoFileId ?? null }} size={40} />
                            <span className="voice-mic" aria-hidden="true"><Icon name="mic" /></span>
                        </>
                    )}
                </div>
            )}
            <button type="button" className="voice-play" disabled={!url} onClick={toggle} aria-label={playing ? "Pause voice note" : "Play voice note"}>
                <Icon name={playing ? "pause" : "play"} />
            </button>
            <div className="voice-body">
                <div className="voice-wave" ref={box} style={{ "--p": `${share}%` } as CSSProperties}>
                    <div className="voice-bars" aria-hidden="true">{peaks.map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} />)}</div>
                    <div className="voice-bars played" aria-hidden="true">{peaks.map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} />)}</div>
                    <span className="voice-track" aria-hidden="true"><span className="voice-knob" /></span>
                    {/* dragging, clicking and the keyboard move along the note; the waveform underneath is what shows */}
                    <input type="range" className="voice-seek" aria-label="Position in the voice note" disabled={!url || length === 0}
                        min={0} max={length || 1} step="any" value={Math.min(at, length || 1)}
                        onChange={(e) => { const t = +e.target.value; setAt(t); if (audio.current) audio.current.currentTime = t; }} />
                </div>
                <div className="voice-meta">
                    <span className="voice-time mono">{fmtClock(playing || at > 0 ? at : length)}</span>
                    {!person && (playing || speed !== 1) && speedButton}
                </div>
            </div>
        </div>
    );
}
