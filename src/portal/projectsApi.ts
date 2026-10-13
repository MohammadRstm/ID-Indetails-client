import { useQuery } from "@tanstack/react-query";
import { portalHttp } from "./portalApi";
import { steadyPresentation } from "./presentation/presentationLinks";
import type { PortalPresentation } from "./presentation/presentationTypes";

export const presentationKey = (projectId: number) => ["portal", "presentation", projectId] as const;

/** What the client sees of a project: the published presentation. A project they can't see answers 404. */
export function usePortalPresentation(projectId: number) {
    return useQuery({
        queryKey: presentationKey(projectId),
        queryFn: async () => steadyPresentation((await portalHttp.get<PortalPresentation>(`/projects/${projectId}`)).data),
    });
}

/** A short-lived link to a published file: shown in the browser (`inline`) or saved. */
export async function getPortalLink(projectId: number, itemId: number, inline: boolean): Promise<{ url: string; expiresAt: string }> {
    return (await portalHttp.get<{ url: string; expiresAt: string }>(`/projects/${projectId}/items/${itemId}/link`, { params: { inline } })).data;
}
