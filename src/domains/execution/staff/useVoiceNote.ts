import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import type { Schemas } from "@/api/types";
import { uploadVoice } from "@/shared/voice/uploadVoice";
import { useVoiceRecorder } from "@/shared/voice/useVoiceRecorder";

type VoiceFile = Schemas["FileResponse"];

/**
 * The voice note of a daily log being written or changed: the one already saved (kept until removed), or a new
 * recording (in progress, or finished and not uploaded yet). `resolve()` uploads what is new and answers with the
 * id to save, or null when the log has no voice note.
 */
export function useVoiceNote(initial: VoiceFile | null = null) {
    const rec = useVoiceRecorder();
    const [kept, setKept] = useState<VoiceFile | null>(initial);
    // a finished recording not uploaded yet, and the object URL its player plays from
    const [recording, setRecording] = useState<{ blob: Blob; url: string } | null>(null);
    const recordingUrl = useRef<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => () => { if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current); }, []);

    function keep(blob: Blob | null) {
        if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current);
        recordingUrl.current = blob ? URL.createObjectURL(blob) : null;
        setRecording(blob && recordingUrl.current ? { blob, url: recordingUrl.current } : null);
    }

    /** Stops the recording in progress and keeps what it recorded. */
    async function finishRecording() {
        const blob = await rec.finish();
        rec.discard();
        if (blob) keep(blob);
        return blob;
    }

    return {
        rec,
        kept,
        recording: recording?.url ?? null,
        uploading,
        error: error ?? rec.error,
        /** The log has, or is getting, a voice note. */
        hasVoice: kept != null || recording != null || rec.state !== "idle",
        finishRecording,
        remove() { setKept(null); keep(null); setError(null); rec.discard(); },
        /** Back to the saved voice note (or none): a cancelled edit, or a log that was saved. */
        reset(saved: VoiceFile | null = null) { setKept(saved); keep(null); setError(null); rec.discard(); },
        async resolve(): Promise<number | null> {
            setError(null);
            setUploading(true);
            try {
                const blob = rec.state !== "idle" ? await finishRecording() : recording?.blob;
                if (!blob) return kept?.id ?? null;
                // once uploaded it is the kept one, so a failed save is retried without uploading it again
                const file = await uploadVoice(blob);
                setKept(file);
                keep(null);
                return file.id;
            } catch (e) {
                setError(errorMessage(e));
                throw e;
            } finally {
                setUploading(false);
            }
        },
    };
}

export type VoiceNote = ReturnType<typeof useVoiceNote>;
