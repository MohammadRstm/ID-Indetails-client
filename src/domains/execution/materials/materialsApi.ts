import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type Material = Schemas["MaterialResponse"];
export type MaterialList = Schemas["MaterialListResponse"];

/** Filters for a site's materials, as the API takes them. Everything is optional. */
export type MaterialQuery = {
    type?: string;
    supplier?: string;
    addedById?: number;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    pageSize?: number;
};

/** Under the project, so anything that refreshes the project refreshes its materials too. */
export const materialsKey = (projectId: number) => [...keys.projects.detail(projectId), "materials"] as const;

/** One page of a site's materials, newest first, with the totals and the filter choices (project:view). */
export function useMaterials(projectId: number, query: MaterialQuery = {}, enabled = true) {
    const params = { page: 1, pageSize: 30, ...query };
    return useQuery({
        queryKey: [...materialsKey(projectId), params],
        queryFn: async () => (await http.get<MaterialList>(`/projects/${projectId}/materials`, { params })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Every material on a site, fetched a hundred at a time: for figures and choices that cover all of them. */
export function useAllMaterials(projectId: number, enabled = true) {
    return useQuery({
        queryKey: [...materialsKey(projectId), "all"],
        queryFn: async () => {
            const items: Material[] = [];
            for (let page = 1; ; page++) {
                const { data } = await http.get<MaterialList>(`/projects/${projectId}/materials`, { params: { page, pageSize: 100 } });
                items.push(...data.items);
                if (items.length >= data.totalCount || data.items.length === 0) return { ...data, items };
            }
        },
        enabled,
    });
}

/** Everything a material moves: the site's figures and money, the domain's, the dashboards and the feed. */
function useRefreshSite() {
    const invalidate = useInvalidate();
    // a client's page shows what their sites charge them
    return () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); };
}

// The API takes at most this many materials at once.
const BATCH = 100;

/**
 * Adds the rows of the Add materials sheet, a hundred at a time (material:create). Each batch is saved on its
 * own, so `onSaved` hears how many rows each one took: if a later batch fails, those are already recorded and
 * mustn't be sent again.
 */
export function useAddMaterials(projectId: number, onSaved?: (count: number) => void) {
    const refresh = useRefreshSite();
    return useMutation({
        mutationFn: async (items: Schemas["NewMaterialRequest"][]) => {
            const added: Material[] = [];
            for (let i = 0; i < items.length; i += BATCH) {
                const batch = items.slice(i, i + BATCH);
                added.push(...(await http.post<Material[]>(`/projects/${projectId}/materials`, { items: batch })).data);
                onSaved?.(batch.length);
            }
            return added;
        },
        onSettled: refresh,
    });
}

/**
 * Puts a saved material straight into the lists already loaded, so the next cell changed on its row starts
 * from what was just saved rather than from a list that is still being fetched again.
 */
function useSaved(projectId: number) {
    const queryClient = useQueryClient();
    const refresh = useRefreshSite();
    return (saved: Material) => {
        queryClient.setQueriesData<MaterialList>({ queryKey: materialsKey(projectId) }, (list) =>
            list && { ...list, items: list.items.map((m) => (m.id === saved.id ? saved : m)) });
        refresh();
    };
}

/** Your own material with material:create, anyone's with material:manage, while the site is open. */
export function useUpdateMaterial(projectId: number) {
    const saved = useSaved(projectId);
    return useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Schemas["MaterialEntryRequest"] }) =>
            (await http.put<Material>(`/projects/${projectId}/materials/${id}`, body)).data,
        onSuccess: saved,
    });
}

export function useDeleteMaterial(projectId: number) {
    const queryClient = useQueryClient();
    const refresh = useRefreshSite();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/projects/${projectId}/materials/${id}`); },
        onSuccess: (_, id) => {
            // gone from the table at once, so its armed Delete can't be clicked again while the list reloads
            queryClient.setQueriesData<MaterialList>({ queryKey: materialsKey(projectId) }, (list) =>
                list && { ...list, items: list.items.filter((m) => m.id !== id), totalCount: Math.max(0, list.totalCount - 1) });
            refresh();
        },
    });
}
