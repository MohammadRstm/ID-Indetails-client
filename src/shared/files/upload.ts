import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { preparePicture } from "./preparePicture";

export type UploadOptions = {
    /** A photo's longest side once made small (it is never cropped). */
    maxEdge?: number;
    /** How far the upload has got, from 0 to 1. */
    onProgress?: (fraction: number) => void;
};

/**
 * The other files a work entry or a chat takes (the API's `POST /api/files/document`, up to 50 MB): documents, ZIP,
 * CAD drawings and 3D models. Programs and web pages never are.
 */
export const DOCUMENT_EXTENSIONS = [
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".zip",
    ".dwg", ".dxf", ".rvt", ".ifc", ".skp", ".3dm", ".glb", ".gltf", ".obj", ".fbx", ".stl", ".3ds", ".max", ".blend", ".usdz", ".dae",
];

/** Photos and videos, by name, for a browser that doesn't know the type (a HEIC photo often). */
const MEDIA_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".mp4", ".m4v", ".mov", ".webm"];

/** Whether a picked file goes as a file rather than a photo or video: anything that isn't one is a file. */
export const isDocument = (file: File) => {
    const name = file.name.toLowerCase();
    const media = file.type.startsWith("image/") || file.type.startsWith("video/") || MEDIA_EXTENSIONS.some((ext) => name.endsWith(ext));
    return !media;
};

/** What a file picker offers: photos, videos and every other file taken. */
export const ATTACH_ACCEPT = ["image/*", "video/*", ...DOCUMENT_EXTENSIONS].join(",");

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
