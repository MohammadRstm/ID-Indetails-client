import { useEffect, useState } from "react";

/** An object URL for a blob (a recording not sent yet), freed when the blob changes or the caller goes away. */
export function useBlobUrl(blob: Blob | null): string | undefined {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        if (!blob) { setUrl(undefined); return; }
        const made = URL.createObjectURL(blob);
        setUrl(made);
        return () => URL.revokeObjectURL(made);
    }, [blob]);
    return url;
}
