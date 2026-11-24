import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { preparePicture } from "./preparePicture";

export type UploadOptions = {
    /** A photo's longest side once made small (it is never cropped). */
    maxEdge?: number;
    /** How far the upload has got, from 0 to 1. */
    onProgress?: (fraction: number) => void;
};

/** The documents a work entry takes (the API's `POST /api/files/document`): PDF, Word, Excel, PowerPoint and CSV. */
export const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"];

/** Whether a picked file is one of those documents, by its name (a browser may not know an Office file's type). */
export const isDocument = (file: File) => DOCUMENT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

/** Uploads a photo (made small first), a video, or a document, for attaching its id afterwards. */
export async function uploadFile(file: File, { maxEdge, onProgress }: UploadOptions = {}): Promise<Schemas["FileResponse"]> {
    const form = new FormData();
    const asDocument = isDocument(file);
    form.append("file", asDocument ? file : await preparePicture(file, maxEdge));
    const response = await http.post<Schemas["FileResponse"]>(asDocument ? "/files/document" : "/files", form, {
        onUploadProgress: onProgress && ((e) => onProgress(e.total ? e.loaded / e.total : 0)),
    });
    onProgress?.(1);
    return response.data;
}

/** How many uploads run at once: enough to fill the line, few enough not to crowd it. */
const AT_ONCE = 3;

/**
 * Uploads several files, a few at a time, and answers with their ids in the order they were picked, or the first
 * error. `onProgress` hears how many are done and how far all of them have got, from 0 to 1.
 */
export async function uploadAll(
    files: File[],
    { maxEdge, onProgress }: { maxEdge?: number; onProgress?: (done: number, fraction: number) => void } = {},
): Promise<number[]> {
    const ids: number[] = new Array(files.length);
    const progress = files.map(() => 0);
    let done = 0;
    let next = 0;
    const report = () => onProgress?.(done, progress.reduce((sum, p) => sum + p, 0) / Math.max(1, files.length));

    async function worker() {
        while (next < files.length) {
            const index = next++;
            ids[index] = (await uploadFile(files[index], { maxEdge, onProgress: (p) => { progress[index] = p; report(); } })).id;
            done++;
            report();
        }
    }

    await Promise.all(Array.from({ length: Math.min(AT_ONCE, files.length) }, worker));
    return ids;
}

/** "Uploading 2 of 5 · 40%", or "Uploading 40%" for one file. */
export function uploadingLabel(total: number, done: number, fraction: number): string {
    const percent = `${Math.round(fraction * 100)}%`;
    return total > 1 ? `Uploading ${Math.min(done + 1, total)} of ${total} · ${percent}` : `Uploading ${percent}`;
}
