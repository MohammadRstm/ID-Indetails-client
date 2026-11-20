import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { voiceExtension } from "./voiceFormat";

/** Uploads a recorded voice note, for attaching its id afterwards (to a message or a daily log). */
export async function uploadVoice(blob: Blob): Promise<Schemas["FileResponse"]> {
    const form = new FormData();
    // the API reads the format from the file's first bytes; the name just carries the right extension
    form.append("file", new File([blob], `voice-note.${voiceExtension(blob.type)}`, { type: blob.type }));
    return (await http.post<Schemas["FileResponse"]>("/files/voice", form)).data;
}
