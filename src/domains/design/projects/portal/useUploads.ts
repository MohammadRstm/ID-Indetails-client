import { useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PortalSection } from "./contentApi";
import { addUploads, cancelUpload, dismissUpload, retryUpload, subscribeUploads, uploadRows } from "./uploads";

/** A project's upload list, and what can be done with it. The list outlives this component. */
export function useUploads(projectId: number) {
    const queryClient = useQueryClient();
    const all = useSyncExternalStore(subscribeUploads, uploadRows);
    const rows = useMemo(() => all.filter((row) => row.projectId === projectId), [all, projectId]);
    return {
        rows,
        /** Files to upload to a section, or, with `replaceItemId`, the new file of a card. */
        add: (section: PortalSection, files: File[], accepted: string[], replaceItemId?: number) =>
            addUploads({ queryClient, projectId, section, files, accepted, replaceItemId }),
        cancel: cancelUpload,
        retry: retryUpload,
        dismiss: dismissUpload,
    };
}
