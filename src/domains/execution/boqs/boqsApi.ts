import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadFile } from "@/api/download";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type BoqList = Schemas["BoqListResponse"];
export type BoqSummary = Schemas["BoqSummaryResponse"];
export type Boq = Schemas["BoqDetailResponse"];
export type BoqLine = Schemas["BoqLineResponse"];
export type BoqKind = Schemas["BoqKind"];
export type BoqAdjustmentType = Schemas["BoqAdjustmentType"];
export type BoqDeliveryChannel = Schemas["DeliveryChannel"];

/*
 * What the API accepts (BoqRules): longer text is refused, so forms stop at the same limits.
 */
export const BOQ_TITLE_MAX = 120;
export const BOQ_REASON_MAX = 500;
export const BOQ_CODE_MAX = 20;
export const BOQ_DESCRIPTION_MAX = 500;
export const BOQ_UNIT_MAX = 20;
export const BOQ_MAX_LINES = 1000;
/** What an email's or a recorded delivery's note may hold. */
export const BOQ_NOTE_MAX = 500;

/** Under the project, so a change to the site (its price, its status) refreshes them. */
const boqsKey = (projectId: number) => [...keys.projects.detail(projectId), "boqs"] as const;

/**
 * A site's BOQs and VOs, newest first, and its price (financial:view, project:pricing_manage or boq:create):
 * the caller's own internal drafts (everyone's for project:pricing_manage); the client BOQs, the VOs and the
 * price only for financial:view or project:pricing_manage.
 */
export function useBoqs(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...boqsKey(projectId), "list"],
        queryFn: async () => (await http.get<BoqList>(`/projects/${projectId}/boqs`)).data,
        enabled,
    });
}

/** One BOQ with its lines, the figures of its last save and who it was sent to. */
export function useBoq(projectId: number, id: number | null) {
    return useQuery({
        queryKey: [...boqsKey(projectId), "detail", id],
        queryFn: async () => (await http.get<Boq>(`/boqs/${id}`)).data,
        enabled: id != null,
    });
}

/** Everything a BOQ changes: its site's lists, and the feed. */
function useRefresh() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.projects.all, keys.activity.all); };
}

/** Agreeing or withdrawing sets the site's work price, so what shows money is read again too. */
function useRefreshPrice() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); };
}

/** Starts a draft: an internal one (boq:create), a client BOQ or a VO (project:pricing_manage), empty or copied from one the caller can see. */
export function useCreateBoq(projectId: number) {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: async (body: Schemas["CreateBoqRequest"]) => (await http.post<Boq>(`/projects/${projectId}/boqs`, body)).data,
        onSuccess: refresh,
    });
}

/** What every change to one BOQ does with the answer: the editor starts from it, and the lists are read again. */
function useSaved(projectId: number) {
    const queryClient = useQueryClient();
    const refresh = useRefresh();
    return (saved: Boq) => {
        queryClient.setQueryData([...boqsKey(projectId), "detail", saved.id], saved);
        refresh();
    };
}

/** Saves the whole document: the lines are replaced in the order given, and every figure is worked out by the API. */
export function useSaveBoq(projectId: number, id: number) {
    const saved = useSaved(projectId);
    return useMutation({
        mutationFn: async (body: Schemas["SaveBoqRequest"]) => (await http.put<Boq>(`/boqs/${id}`, body)).data,
        onSuccess: saved,
    });
}

/** Appends all the lines of another BOQ, or the chosen ones, to a draft. */
export function useCopyBoqLines(projectId: number, id: number) {
    const saved = useSaved(projectId);
    return useMutation({
        mutationFn: async (body: Schemas["CopyBoqLinesRequest"]) => (await http.post<Boq>(`/boqs/${id}/copy-lines`, body)).data,
        onSuccess: saved,
    });
}

/** A new draft of the same kind with this one's title, reason, adjustment and lines. */
export function useDuplicateBoq() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<Boq>(`/boqs/${id}/duplicate`)).data,
        onSuccess: refresh,
    });
}

/** Deletes a draft; an agreed BOQ can't be deleted. */
export function useDeleteBoq(projectId: number) {
    const queryClient = useQueryClient();
    const refresh = useRefresh();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/boqs/${id}`); },
        onSuccess: (_, id) => {
            queryClient.removeQueries({ queryKey: [...boqsKey(projectId), "detail", id] });
            refresh();
        },
    });
}

/** Agrees a client BOQ or a VO, which sets the site's work price. The profit floor may refuse it (422 profit_floor). */
export function useAgreeBoq(projectId: number) {
    const saved = useSaved(projectId);
    const price = useRefreshPrice();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<Boq>(`/boqs/${id}/agree`)).data,
        onSuccess: (boq) => { saved(boq); price(); },
    });
}

/** Takes an agreement back, with why; the BOQ is a draft again. The profit floor may refuse it (422 profit_floor). */
export function useWithdrawBoqAgreement(projectId: number) {
    const saved = useSaved(projectId);
    const price = useRefreshPrice();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
            (await http.post<Boq>(`/boqs/${id}/withdraw-agreement`, { reason })).data,
        onSuccess: (boq) => { saved(boq); price(); },
    });
}

/** Emails the PDF to the client and records the delivery; a failed email records nothing (503 email_delivery_failed). */
export function useEmailBoq(projectId: number) {
    const saved = useSaved(projectId);
    return useMutation({
        mutationFn: async ({ id, to, note }: { id: number; to: string; note?: string }) =>
            (await http.post<Boq>(`/boqs/${id}/email`, { to, note })).data,
        onSuccess: saved,
    });
}

/** Records that it went out: on WhatsApp, or as a PDF sent some other way. */
export function useRecordBoqDelivery(projectId: number) {
    const saved = useSaved(projectId);
    return useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Schemas["RecordBoqDeliveryRequest"] }) =>
            (await http.post<Boq>(`/boqs/${id}/deliveries`, body)).data,
        onSuccess: saved,
    });
}

/** The PDF of a client BOQ or a VO, as the client receives it. */
export const downloadBoqPdf = (boq: { id: number; number: string | null }) =>
    downloadFile(`/boqs/${boq.id}/pdf`, `${(boq.number ?? "boq").toLowerCase()}.pdf`);
