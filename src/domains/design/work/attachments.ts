import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Schemas } from "@/api/types";
import { uploadFile } from "./workApi";

export type UploadedFile = Schemas["FileResponse"];

/** A photo, video or document (PDF, Word, Excel, PowerPoint, CSV) for an entry: uploaded as soon as it is picked, saved with the entry. */
export function useAttachment(initial: UploadedFile | null = null) {
    const [file, setFile] = useState<UploadedFile | null>(initial);
    const upload = useMutation({ mutationFn: (file: File) => uploadFile(file), onSuccess: setFile });
    return {
        file,
        uploading: upload.isPending,
        error: upload.error,
        pick: (f: File) => upload.mutate(f),
        clear: () => {
            setFile(null);
            upload.reset();
        },
    };
}

export type AttachmentState = ReturnType<typeof useAttachment>;
