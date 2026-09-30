import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";

export type ClientSummary = Schemas["ClientSummaryResponse"];
export type Client = Schemas["ClientResponse"];
export type ClientContact = Schemas["ClientContactResponse"];
export type ClientOverview = Schemas["ClientOverviewResponse"];
export type ClientFilter = "active" | "owing" | "empty";
export type ClientSort = Schemas["ClientSort"];

export type ClientListParams = {
    domain: string;
    search?: string;
    filter?: ClientFilter;
    includeArchived?: boolean;
    sort?: ClientSort;
    page?: number;
    pageSize?: number;
};

function clean<T extends object>(params: T): Partial<T> {
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null && v !== false)) as Partial<T>;
}

export function useClients(params: ClientListParams, enabled = true) {
    const p = clean(params);
    return useQuery({
        queryKey: keys.clients.list(p),
        queryFn: async () => (await http.get<Paged<ClientSummary>>("/clients", { params: p })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

export function useClientOverview(domain: string) {
    return useQuery({
        queryKey: keys.clients.overview(domain),
        queryFn: async () => (await http.get<ClientOverview>("/clients/overview", { params: { domain } })).data,
    });
}

export function useClient(id: number | null | undefined) {
    return useQuery({
        queryKey: keys.clients.detail(id ?? 0),
        queryFn: async () => (await http.get<Client>(`/clients/${id}`)).data,
        enabled: id != null,
    });
}

export type SaveClientBody = Schemas["CreateClientRequest"];

export function useSaveClient(id?: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: SaveClientBody) =>
            (id ? await http.put<Client>(`/clients/${id}`, body) : await http.post<Client>("/clients", body)).data,
        onSuccess: () => invalidate(keys.clients.all, keys.projects.all),
    });
}

export function useArchiveClient(id: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (archive: boolean) => (await http.post<Client>(`/clients/${id}/${archive ? "archive" : "restore"}`)).data,
        onSuccess: () => invalidate(keys.clients.all),
    });
}

export function useDeleteClient(id: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async () => {
            await http.delete(`/clients/${id}`);
        },
        onSuccess: () => invalidate(keys.clients.all),
    });
}

export type ClientCheck = Schemas["ClientCheckResponse"];

/** Whether a name or contact being typed is already used, before saving. */
export async function checkClient(body: Schemas["CheckClientRequest"]): Promise<ClientCheck> {
    return (await http.post<ClientCheck>("/clients/check", body)).data;
}

/** The client's organisation, or their name when there isn't one (the prototype's C.displayName). */
export const secondaryLine = (c: { organisation?: string | null; name: string; label?: string | null }) =>
    c.organisation ? c.name : c.label ?? "";
