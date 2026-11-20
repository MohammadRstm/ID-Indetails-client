import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type BoqProgress = Schemas["BoqProgressResponse"];
export type BoqProgressLine = Schemas["BoqProgressLineResponse"];
export type BoqProgressRecord = Schemas["BoqProgressRecordResponse"];
export type RecordBoqProgress = Schemas["RecordBoqProgressRequest"];

/*
 * What the API accepts (BoqProgressRules): the forms stop at the same limits, so nobody types what would be refused.
 */
/** A note on a record. */
export const PROGRESS_NOTE_MAX = 500;
/** The most lines one save may hold. */
export const PROGRESS_MAX_LINES = 200;

/** A quantity as the API sends it, as a field shows it: "12.5", or empty for none. */
export const quantityText = (quantity: number | null | undefined) => (quantity == null ? "" : String(quantity));

/**
 * What is wrong with an executed quantity as typed, against its line's quantity, or null. It is everything executed so
 * far: 0 or more, to four places, and at most twice the line's quantity (an overrun can be recorded, a typo is caught).
 */
export function executedQuantityError(text: string, lineQuantity: number): string | null {
    const t = text.trim().replace(/,/g, "");
    if (!t) return "Enter the quantity executed so far, or 0.";
    if (!/^\d+(\.\d+)?$/.test(t)) return "Enter a number, like 12.5.";
    if ((t.split(".")[1]?.length ?? 0) > 4) return "At most four decimal places.";
    if (Number(t) > lineQuantity * 2) return `At most twice the line's quantity (${lineQuantity * 2}).`;
    return null;
}

/** The quantity as typed, as the API takes it. */
export const quantityOf = (text: string) => Number(text.trim().replace(/,/g, ""));

/**
 * A site's progress by value as it stood on a day (today when left out): each agreed BOQ and VO line with its executed
 * quantity, and the value executed against the agreed value. The values come only with financial:view; site staff read
 * the sites they oversee (403 for any other). The previous day stays up while another is read.
 */
export function useBoqProgress(projectId: number, asOf: string, enabled = true) {
    return useQuery({
        queryKey: keys.projects.boqProgress(projectId, asOf),
        queryFn: async () => (await http.get<BoqProgress>(`/projects/${projectId}/boqs/progress`, { params: asOf ? { asOf } : {} })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/**
 * Records executed quantities on a day (project:pricing_manage, or site_log:create on a site its writer oversees),
 * while the site is open. The answer is the progress as of today; the project's insight shows the same figure, and the
 * feed says it was recorded.
 */
export function useRecordBoqProgress(projectId: number) {
    const queryClient = useQueryClient();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: RecordBoqProgress) => (await http.put<BoqProgress>(`/projects/${projectId}/boqs/progress`, body)).data,
        onSuccess: (saved) => {
            queryClient.setQueryData(keys.projects.boqProgress(projectId, saved.asOf), saved);
            void invalidate(keys.projects.boqProgress(projectId), keys.projects.insights(projectId), keys.activity.all);
        },
    });
}
