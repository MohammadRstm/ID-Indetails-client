import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type Pocket = Schemas["PocketResponse"];
export type PocketRequest = Schemas["PocketRequestResponse"];
export type PocketEntry = Schemas["PocketEntryResponse"];
export type PocketEntryKind = Schemas["PocketEntryKind"];

/** What a pocket money note may hold, as the API keeps it (PocketRules.MaxNoteLength). */
export const POCKET_NOTE_MAX = 500;

/** Execution's pocket money: its balance, what came in and went out, and the requests waiting for a decision. */
export function usePocket() {
    return useQuery({ queryKey: keys.pocket.summary(), queryFn: async () => (await http.get<Pocket>("/execution/pocket")).data });
}

export type PocketEntryFilters = { kind?: PocketEntryKind; projectId?: number | null; from?: string; to?: string; search?: string; page?: number; pageSize?: number };

/** Movements, newest first: contributions (in) or payouts (out), of a site, between days (both inclusive), with words. */
export function usePocketEntries(filters: PocketEntryFilters) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""));
    return useQuery({
        queryKey: keys.pocket.entries(params),
        queryFn: async () => (await http.get<Paged<PocketEntry>>("/execution/pocket/entries", { params })).data,
        placeholderData: keepPreviousData,
    });
}

/** Every pocket change moves a site's profit too. */
function useInvalidatePocket() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.pocket.all, keys.projects.all, keys.finance.all); };
}

/** Moves part of a site's money into the pocket. */
export function useContributeToPocket() {
    const done = useInvalidatePocket();
    return useMutation({
        mutationFn: async (body: { projectId: number; amount: number; note?: string }) => (await http.post<Pocket>("/execution/pocket/contributions", body)).data,
        onSuccess: done,
    });
}

/** Asks the pocket for money for a site; a site already waiting gets its request back. */
export function useAskPocket() {
    const done = useInvalidatePocket();
    return useMutation({
        mutationFn: async (body: { projectId: number; note?: string }) => (await http.post<PocketRequest>("/execution/pocket/requests", body)).data,
        onSuccess: done,
    });
}

export function useApprovePocketRequest() {
    const done = useInvalidatePocket();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; amount: number; note?: string }) =>
            (await http.post<PocketRequest>(`/execution/pocket/requests/${id}/approve`, body)).data,
        onSuccess: done,
    });
}

export function useDenyPocketRequest() {
    const done = useInvalidatePocket();
    return useMutation({
        mutationFn: async ({ id, ...body }: { id: number; note?: string }) => (await http.post<PocketRequest>(`/execution/pocket/requests/${id}/deny`, body)).data,
        onSuccess: done,
    });
}
