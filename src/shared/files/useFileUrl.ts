import { useQuery } from "@tanstack/react-query";
import { fetchBlob } from "@/api/download";
import { loadFailed } from "@/api/queryState";

/*
 * Files need the access token, so <img src="/api/files/1"> can't load them. They are fetched once as blobs
 * and shown from object URLs, kept for the session (photos and attachments are few and small).
 */

const urls = new Map<string, Promise<string>>();

function load(id: number, size: number | undefined): Promise<string> {
    const key = `${id}:${size ?? ""}`;
    let url = urls.get(key);
    if (!url) {
        url = fetchBlob(`/files/${id}${size ? `?size=${size}` : ""}`).then(({ blob }) => URL.createObjectURL(blob));
        url.catch(() => urls.delete(key));
        urls.set(key, url);
    }
    return url;
}

/** Forgets every file loaded so far (a sign-out: the next person loads what they may see). */
export function forgetFileUrls() {
    urls.forEach((url) => void url.then(URL.revokeObjectURL, () => undefined));
    urls.clear();
}

/**
 * An object URL for an uploaded file; undefined while it loads, or when there is no file. `size` asks for a photo's
 * smaller copy (its longest side; the API rounds it up to 160, 480, 960 or 1920 px), so a preview doesn't download
 * the whole photo.
 */
export function useFileUrl(id: number | null | undefined, size?: number): { url: string | undefined; isError: boolean } {
    const query = useQuery({
        queryKey: ["file", id, size ?? null],
        queryFn: () => load(id!, size),
        enabled: id != null,
        staleTime: Infinity,
    });
    return { url: id == null ? undefined : query.data, isError: loadFailed(query) };
}
