import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
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
