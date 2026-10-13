import { useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HERO_EXTENSIONS, type PortalSection } from "./contentApi";
import { addUploads, cancelUpload, dismissUpload, projectBusy, retryUpload, subscribeUploads, uploadRows } from "./uploads";

/** A project's upload list, and what can be done with it. The list outlives this component. */
export function useUploads(projectId: number) {
    const queryClient = useQueryClient();
    const all = useSyncExternalStore(subscribeUploads, uploadRows);
    const rows = useMemo(() => all.filter((row) => row.projectId === projectId), [all, projectId]);
    // files on their way, or the drafts about to be loaded again: not yet what can be published
    const busy = useSyncExternalStore(subscribeUploads, () => projectBusy(projectId));
    return {
        rows,
        busy,
        /** Files to upload to a section, or, with `replaceItemId`, the new file of a card. */
        add: (section: PortalSection, files: File[], accepted: string[], replaceItemId?: number) =>
            addUploads({ queryClient, projectId, section, files, accepted, replaceItemId }),
        /** A picture for the hero image, which belongs to no section. */
        addHero: (file: File) => addUploads({ queryClient, projectId, section: "hero", files: [file], accepted: HERO_EXTENSIONS }),
        cancel: cancelUpload,
        retry: retryUpload,
        dismiss: dismissUpload,
    };
}
