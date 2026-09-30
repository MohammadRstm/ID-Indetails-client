import { useQuery } from "@tanstack/react-query";
import { fetchBlob } from "@/api/download";

/*
 * Files need the access token, so <img src="/api/files/1"> can't load them. They are fetched once as blobs
 * and shown from object URLs, kept for the session (photos and attachments are few and small).
 */

const urls = new Map<number, Promise<string>>();

function load(id: number): Promise<string> {
    let url = urls.get(id);
    if (!url) {
        url = fetchBlob(`/files/${id}`).then(({ blob }) => URL.createObjectURL(blob));
        url.catch(() => urls.delete(id));
        urls.set(id, url);
    }
    return url;
}

/** An object URL for an uploaded file; undefined while it loads, or when there is no file. */
export function useFileUrl(id: number | null | undefined): { url: string | undefined; isError: boolean } {
    const query = useQuery({
        queryKey: ["file", id],
        queryFn: () => load(id!),
        enabled: id != null,
        staleTime: Infinity,
    });
    return { url: id == null ? undefined : query.data, isError: query.isError };
}
