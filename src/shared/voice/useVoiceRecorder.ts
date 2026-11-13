import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS, MIC_BLOCKED_MESSAGE, pickVoiceType } from "./voiceFormat";

export type VoiceRecorder = {
    /** idle: nothing yet. recording: the microphone is on. recorded: stopped (by the person, or at the time limit) with a recording ready. */
    state: "idle" | "recording" | "recorded";
    /** How long it has been recording, in whole seconds. */
    seconds: number;
    /** A plain message when the microphone can't be used. */
    error: string | null;
    /** The finished recording, once stopped. */
    blob: Blob | null;
    /** Asks for the microphone and starts recording. */
    start: () => Promise<void>;
    /** Stops (if still recording) and answers with the recording, or null when there is none. */
    finish: () => Promise<Blob | null>;
    /** Throws the recording away and releases the microphone. */
    discard: () => void;
};

/**
 * Records a voice note from the microphone with MediaRecorder at a low bit rate (speech needs no more), stopping
 * by itself at five minutes. The microphone is released as soon as recording ends, and when the caller goes away.
 */
export function useVoiceRecorder(): VoiceRecorder {
    const [state, setState] = useState<VoiceRecorder["state"]>("idle");
    const [seconds, setSeconds] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const recorder = useRef<MediaRecorder | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const result = useRef<Promise<Blob | null>>(Promise.resolve(null));
    const alive = useRef(true);

    const release = useCallback(() => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
    }, []);

    const discard = useCallback(() => {
        // taking the handler off first means the recorder's last data is dropped, not kept
        const current = recorder.current;
        recorder.current = null;
        if (current) {
            current.ondataavailable = null;
            current.onstop = null;
            if (current.state !== "inactive") current.stop();
        }
        release();
        result.current = Promise.resolve(null);
        setState("idle");
        setSeconds(0);
        setBlob(null);
    }, [release]);

    const start = useCallback(async () => {
        setError(null);
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setError(MIC_BLOCKED_MESSAGE);
            return;
        }
        let mic: MediaStream;
        try {
            mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setError(MIC_BLOCKED_MESSAGE);
            return;
        }
        if (!alive.current) { mic.getTracks().forEach((t) => t.stop()); return; }

        const mimeType = pickVoiceType();
        const rec = new MediaRecorder(mic, { audioBitsPerSecond: 32000, ...(mimeType ? { mimeType } : {}) });
        const chunks: Blob[] = [];
        stream.current = mic;
        recorder.current = rec;
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        result.current = new Promise((resolve) => {
            rec.onstop = () => {
                release();
                const recording = chunks.length > 0 ? new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }) : null;
                if (alive.current) {
                    setBlob(recording);
                    setState(recording ? "recorded" : "idle");
                    if (!recording) setError("Nothing was recorded. Try again.");
                }
                resolve(recording);
            };
        });
        rec.start();
        setSeconds(0);
        setBlob(null);
        setState("recording");
        let elapsed = 0;
        timer.current = setInterval(() => {
            elapsed += 1;
            setSeconds(elapsed);
            if (elapsed >= MAX_VOICE_SECONDS && rec.state === "recording") rec.stop();
        }, 1000);
    }, [release]);

    const finish = useCallback(() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
        return result.current;
    }, []);

    // going away mid-recording drops it and frees the microphone (alive is set again for React's dev re-mount)
    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; discard(); };
    }, [discard]);

    return { state, seconds, error, blob, start, finish, discard };
}
