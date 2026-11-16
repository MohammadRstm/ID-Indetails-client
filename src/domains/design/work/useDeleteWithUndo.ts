import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import { useDeleteEntry, useRestoreEntry, type WorkEntry } from "./workApi";

/**
 * Deletes one of the person's entries, with Undo on the toast. The list keeps it rather than the row, because the
 * row is gone once its entry is.
 */
export function useDeleteWithUndo() {
    const remove = useDeleteEntry();
    const restore = useRestoreEntry();
    return (entry: WorkEntry) => remove.mutate(entry.id, {
        onSuccess: () => toast({ text: "Entry deleted", icon: "trash", actionLabel: "Undo", action: () => restore.mutate(entry.id) }),
        onError: (err) => toast({ text: "That entry wasn't deleted", sub: errorMessage(err), icon: "alert" }),
    });
}
