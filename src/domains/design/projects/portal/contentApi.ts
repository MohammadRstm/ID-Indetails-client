import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toApiError } from "@/api/errors";
import { http } from "@/api/http";

/** The three places the client's drafts are sorted into. */
export type PortalSection = "presentation" | "model" | "drawing";
/** What the browser can show of a file inline. */
export type PortalPreview = "image" | "video" | "pdf" | "none";
export type PersonRef = { id: number; name: string };

export type PortalUsage = {
    /** Live files of the project. */
    files: number;
    originalBytes: number;
    /** What the file storage reports for the stored objects. */
    storedBytes: number;
};

export type PortalContentFile = {
    id: number;
    /** The original file name, e.g. "Living room v3.jpg". */
    name: string;
    contentType: string;
    preview: PortalPreview;
    originalBytes: number;
    storedBytes: number;
    uploadedAt: string;
    uploadedBy: PersonRef | null;
};

export type PortalContentItem = {
    id: number;
    section: PortalSection;
    title: string;
    sortOrder: number;
    isDraft: boolean;
    file: PortalContentFile;
    /** A signed link for an image or a video; may be relative (development). */
    previewUrl: string | null;
    previewUrlExpiresAt: string | null;
    createdAt: string;
    updatedAt: string;
    updatedBy: PersonRef | null;
};

export type PortalContent = {
    projectId: number;
    /** False when file storage isn't set up: no uploads. */
    storageReady: boolean;
    /** False when the project is archived: files can be viewed and downloaded only. */
    canEdit: boolean;
    readOnlyReason: string | null;
    usage: PortalUsage;
    /** Lower case, without the dot. */
    acceptedExtensions: string[];
    /** Every section, ordered by section, then sort order, then id. */
    items: PortalContentItem[];
};

export type ContentLink = { url: string; expiresAt: string };

export const PORTAL_SECTIONS: PortalSection[] = ["presentation", "model", "drawing"];
export const SECTION_LABEL: Record<PortalSection, string> = { presentation: "Presentation", model: "3D", drawing: "Drawings" };

/**
 * The API's answers that say the project's content can no longer be changed: the page's `canEdit` is out of date,
 * so it is loaded again.
 */
const LOCKED_CODES = ["portal_content_read_only", "portal_project_not_eligible"];

export const contentBase = (projectId: number) => `/projects/${projectId}/portal/content`;
export const contentKey = (projectId: number) => ["portal-content", projectId] as const;

/** Ascending sort order, then id: the order of cards in a section. */
export const byOrder = (a: PortalContentItem, b: PortalContentItem) => a.sortOrder - b.sortOrder || a.id - b.id;

const bySectionThenOrder = (a: PortalContentItem, b: PortalContentItem) =>
    PORTAL_SECTIONS.indexOf(a.section) - PORTAL_SECTIONS.indexOf(b.section) || byOrder(a, b);

// ---- preview links ----

const KEEP_LINK_MS = 10 * 60_000;
const previews = new Map<number, { url: string; expiresAt: number }>();

/**
 * Every answer carries new signed links, and a new link is a new address for the browser: each image would load
 * again. A file keeps the link it was first shown with while more than 10 minutes of it remain.
 */
function steadyLinks(items: PortalContentItem[]): PortalContentItem[] {
    return items.map((item) => {
        if (!item.previewUrl || !item.previewUrlExpiresAt) return item;
        const kept = previews.get(item.file.id);
        if (kept && kept.expiresAt - Date.now() > KEEP_LINK_MS) {
            return kept.url === item.previewUrl ? item : { ...item, previewUrl: kept.url, previewUrlExpiresAt: new Date(kept.expiresAt).toISOString() };
        }
        previews.set(item.file.id, { url: item.previewUrl, expiresAt: Date.parse(item.previewUrlExpiresAt) });
        return item;
    });
}

/** A link that didn't load: the next answer brings a new one. */
export function forgetPreview(fileId: number) {
    previews.delete(fileId);
}

// ---- the cached content ----

/** A project's drafts, by section, with the storage figures and what the person may do. */
export function usePortalContent(projectId: number) {
    return useQuery({
        queryKey: contentKey(projectId),
        queryFn: async () => {
            const content = (await http.get<PortalContent>(contentBase(projectId))).data;
            return { ...content, items: steadyLinks(content.items) };
        },
    });
}

function patchContent(queryClient: QueryClient, projectId: number, change: (content: PortalContent) => PortalContent) {
    queryClient.setQueryData<PortalContent>(contentKey(projectId), (content) => (content ? change(content) : content));
}

/** An item that was added, replaced, renamed or moved goes in its place, with the usage when the answer carried it. */
export function applyItem(queryClient: QueryClient, projectId: number, item: PortalContentItem, usage?: PortalUsage) {
    const [steady] = steadyLinks([item]);
    patchContent(queryClient, projectId, (content) => ({
        ...content,
        usage: usage ?? content.usage,
        items: [...content.items.filter((i) => i.id !== steady.id), steady].sort(bySectionThenOrder),
    }));
}

function removeItem(queryClient: QueryClient, projectId: number, itemId: number, usage: PortalUsage) {
    patchContent(queryClient, projectId, (content) => ({ ...content, usage, items: content.items.filter((i) => i.id !== itemId) }));
}

/** Whether an error says the cached content is out of date; if so it is loaded again. */
export function refreshIfOutdated(queryClient: QueryClient, projectId: number, error: unknown) {
    const { status, code } = toApiError(error);
    if (status === 404 || LOCKED_CODES.includes(code)) void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
}

// ---- changes ----

type ItemChange = { itemId: number; title?: string; section?: PortalSection };

/** Renames an item or moves it to another section (it goes to the end there). */
export function useUpdateItem(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ itemId, ...change }: ItemChange) =>
            (await http.put<PortalContentItem>(`${contentBase(projectId)}/items/${itemId}`, change)).data,
        onSuccess: (item) => applyItem(queryClient, projectId, item),
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

export function useDeleteItem(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => ({
            itemId,
            usage: (await http.delete<{ usage: PortalUsage }>(`${contentBase(projectId)}/items/${itemId}`)).data.usage,
        }),
        onSuccess: ({ itemId, usage }) => removeItem(queryClient, projectId, itemId, usage),
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

/** A short-lived link to the file: shown in the browser (`inline`) or saved. */
export async function getContentLink(projectId: number, itemId: number, inline: boolean): Promise<ContentLink> {
    return (await http.get<ContentLink>(`${contentBase(projectId)}/items/${itemId}/link`, { params: { inline } })).data;
}
