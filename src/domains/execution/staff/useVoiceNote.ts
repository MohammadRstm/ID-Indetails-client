import { useState } from "react";
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
    const [recording, setRecording] = useState<Blob | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Stops the recording in progress and keeps what it recorded. */
    async function finishRecording() {
        const blob = await rec.finish();
        rec.discard();
        if (blob) setRecording(blob);
        return blob;
    }

    return {
        rec,
        kept,
        recording,
        uploading,
        error: error ?? rec.error,
        /** The log has, or is getting, a voice note. */
        hasVoice: kept != null || recording != null || rec.state !== "idle",
        finishRecording,
        remove() { setKept(null); setRecording(null); setError(null); rec.discard(); },
        /** Back to the saved voice note (or none): a cancelled edit, or a log that was saved. */
        reset(saved: VoiceFile | null = null) { setKept(saved); setRecording(null); setError(null); rec.discard(); },
        async resolve(): Promise<number | null> {
            setError(null);
            setUploading(true);
            try {
                const blob = rec.state !== "idle" ? await finishRecording() : recording;
                if (!blob) return kept?.id ?? null;
                // once uploaded it is the kept one, so a failed save is retried without uploading it again
                const file = await uploadVoice(blob);
                setKept(file);
                setRecording(null);
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
