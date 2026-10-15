import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { steadyPresentation } from "@/portal/presentation/presentationLinks";
import type { PortalPresentation } from "@/portal/presentation/presentationTypes";

const base = (projectId: number) => `/projects/${projectId}/portal/content`;

export const previewKey = (projectId: number) => ["portal-preview", projectId] as const;

/** The preview's own page, outside the staff shell: the Client portal tab's Preview opens it in a new browser tab. */
export const previewPath = (projectId: number) => `/design/projects/${projectId}/portal-preview`;

/** Opens the preview of what the project's client would get in a new browser tab, so the tab the person works in stays as it is. */
export function openPreview(projectId: number) {
    window.open(previewPath(projectId), "_blank");
}

/** The project's page as the draft would show it to the client: the draft hero and introduction, and the items not removed. */
export function usePresentationPreview(projectId: number) {
    return useQuery({
        queryKey: previewKey(projectId),
        queryFn: async () => steadyPresentation((await http.get<PortalPresentation>(`${base(projectId)}/preview`)).data),
        // the draft changes while it is edited in another tab: every look at this one (focusing it) asks again
        staleTime: 0,
        gcTime: 0,
    });
}

/** A short-lived link to a file of the draft: shown in the browser (`inline`) or saved. */
export async function getPreviewLink(projectId: number, itemId: number, inline: boolean): Promise<{ url: string; expiresAt: string }> {
    return (await http.get<{ url: string; expiresAt: string }>(`${base(projectId)}/items/${itemId}/link`, { params: { inline } })).data;
}
