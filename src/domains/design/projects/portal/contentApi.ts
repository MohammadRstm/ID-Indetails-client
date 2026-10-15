import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { errorMessage, toApiError } from "@/api/errors";
import { http } from "@/api/http";
import { toast } from "@/shared/components/Feedback/toast";

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

/**
 * Where an item stands against what clients see. New: never published. Changed: its file, title or section differs
 * from what clients see. Removed: deleted in the draft, which clients still see until the next publish.
 */
export type ItemState = "new" | "changed" | "unchanged" | "removed";

export type PortalContentItem = {
    id: number;
    section: PortalSection;
    title: string;
    sortOrder: number;
    /** Everything but "unchanged". */
    isDraft: boolean;
    state: ItemState;
    /** This item's file is the draft hero image. */
    isHero: boolean;
    /** Only an image (jpg, png or webp) can be the hero. */
    canBeHero: boolean;
    file: PortalContentFile;
    /** A signed link for an image or a video; may be relative (development). */
    previewUrl: string | null;
    previewUrlExpiresAt: string | null;
    createdAt: string;
    updatedAt: string;
    updatedBy: PersonRef | null;
};

/** The draft hero image; its link may be relative (development). */
export type PortalHero = { fileId: number; name: string; url: string | null; urlExpiresAt: string | null };

/** What publishing now would change for clients. */
export type PortalChanges = {
    added: number;
    updated: number;
    removed: number;
    /** The sections whose order differs from what clients see. */
    reordered: PortalSection[];
    heroChanged: boolean;
    summaryChanged: boolean;
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
    /** Every section, ordered by section, then sort order, then id; removed items included. */
    items: PortalContentItem[];
    /** Goes up on every draft change: sent back with publish and discard. */
    revision: number;
    publication: { publishedAt: string | null; publishedBy: PersonRef | null };
    changes: PortalChanges;
    hasUnpublishedChanges: boolean;
    canPublish: boolean;
    canDiscard: boolean;
    hero: PortalHero | null;
    /** The introduction for the client: plain text. */
    summary: string | null;
};

export type ContentLink = { url: string; expiresAt: string };

export const PORTAL_SECTIONS: PortalSection[] = ["presentation", "model", "drawing"];
export const SECTION_LABEL: Record<PortalSection, string> = { presentation: "Presentation", model: "3D", drawing: "Drawings" };
/** What a hero image may be (the API refuses the others). */
export const HERO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
export const SUMMARY_MAX = 2000;

/**
 * The API's answers that say the project's content can no longer be changed: the page's `canEdit` is out of date,
 * so it is loaded again.
 */
const LOCKED_CODES = ["portal_content_read_only", "portal_project_not_eligible"];

export const contentBase = (projectId: number) => `/projects/${projectId}/portal/content`;
export const contentKey = (projectId: number) => ["portal-content", projectId] as const;
/** The staff preview of what clients would get (PresentationPreview keeps it). */
export const previewKey = (projectId: number) => ["portal-preview", projectId] as const;

/** Ascending sort order, then id: the order of cards in a section. */
export const byOrder = (a: PortalContentItem, b: PortalContentItem) => a.sortOrder - b.sortOrder || a.id - b.id;

const bySectionThenOrder = (a: PortalContentItem, b: PortalContentItem) =>
    PORTAL_SECTIONS.indexOf(a.section) - PORTAL_SECTIONS.indexOf(b.section) || byOrder(a, b);

// ---- preview links ----

const KEEP_LINK_MS = 10 * 60_000;
type Kept = { url: string; expiresAt: number };
const previews = new Map<number, Kept>();
const heroes = new Map<number, Kept>();

/** The link a file is shown with: the one it was first shown with, while more than 10 minutes of it remain. */
function keep(store: Map<number, Kept>, fileId: number, url: string, expiresAt: string): { url: string; expiresAt: string } {
    const kept = store.get(fileId);
    if (kept && kept.expiresAt - Date.now() > KEEP_LINK_MS) return { url: kept.url, expiresAt: new Date(kept.expiresAt).toISOString() };
    store.set(fileId, { url, expiresAt: Date.parse(expiresAt) });
    return { url, expiresAt };
}

/**
 * Every answer carries new signed links, and a new link is a new address for the browser: each image would load
 * again. A file keeps the link it was first shown with while more than 10 minutes of it remain.
 */
function steadyLinks(items: PortalContentItem[]): PortalContentItem[] {
    return items.map((item) => {
        if (!item.previewUrl || !item.previewUrlExpiresAt) return item;
        const link = keep(previews, item.file.id, item.previewUrl, item.previewUrlExpiresAt);
        return link.url === item.previewUrl ? item : { ...item, previewUrl: link.url, previewUrlExpiresAt: link.expiresAt };
    });
}

function steadyHero(hero: PortalHero | null): PortalHero | null {
    if (!hero?.url || !hero.urlExpiresAt) return hero;
    const link = keep(heroes, hero.fileId, hero.url, hero.urlExpiresAt);
    return link.url === hero.url ? hero : { ...hero, url: link.url, urlExpiresAt: link.expiresAt };
}

const steadyContent = (content: PortalContent): PortalContent => ({ ...content, items: steadyLinks(content.items), hero: steadyHero(content.hero) });

/** A link that didn't load: the next answer brings a new one. */
export function forgetPreview(fileId: number) {
    previews.delete(fileId);
    heroes.delete(fileId);
}

// ---- the cached content ----

/** A project's drafts, by section, with the storage figures, what is unpublished and what the person may do. */
export function usePortalContent(projectId: number) {
    return useQuery({
        queryKey: contentKey(projectId),
        queryFn: async () => steadyContent((await http.get<PortalContent>(contentBase(projectId))).data),
    });
}

function patchContent(queryClient: QueryClient, projectId: number, change: (content: PortalContent) => PortalContent) {
    queryClient.setQueryData<PortalContent>(contentKey(projectId), (content) => (content ? change(content) : content));
}

/** The previews and the activity feed show what the drafts hold: they are loaded again. */
function refreshDependents(queryClient: QueryClient, projectId: number) {
    void queryClient.invalidateQueries({ queryKey: previewKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
}

/** The counts and states (what is new, changed or removed) move with every change: the drafts are loaded again. */
function refreshContent(queryClient: QueryClient, projectId: number) {
    void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: previewKey(projectId) });
}

/** The API's answer to a change is the whole content: it replaces the cached one. */
function putContent(queryClient: QueryClient, projectId: number, content: PortalContent) {
    queryClient.setQueryData(contentKey(projectId), steadyContent(content));
    refreshDependents(queryClient, projectId);
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

/** A file that was never published is gone; a published one stays, as removed, until the next publish. */
function removeItem(queryClient: QueryClient, projectId: number, itemId: number, usage: PortalUsage) {
    patchContent(queryClient, projectId, (content) => ({
        ...content,
        usage,
        items: content.items.flatMap((i) => (i.id !== itemId ? [i] : i.state === "new" ? [] : [{ ...i, state: "removed" as const }])),
    }));
}

/** Whether an error says the cached content is out of date; if so it is loaded again. */
export function refreshIfOutdated(queryClient: QueryClient, projectId: number, error: unknown) {
    const { status, code } = toApiError(error);
    if (status === 404 || LOCKED_CODES.includes(code)) void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
}

// ---- changes to a file ----

type ItemChange = { itemId: number; title?: string; section?: PortalSection };

/** Renames an item or moves it to another section (it goes to the end there). */
export function useUpdateItem(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ itemId, ...change }: ItemChange) =>
            (await http.put<PortalContentItem>(`${contentBase(projectId)}/items/${itemId}`, change)).data,
        onSuccess: (item) => {
            applyItem(queryClient, projectId, item);
            refreshContent(queryClient, projectId);
        },
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
        onSuccess: ({ itemId, usage }) => {
            removeItem(queryClient, projectId, itemId, usage);
            refreshContent(queryClient, projectId);
        },
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

/** A short-lived link to the file: shown in the browser (`inline`) or saved. */
export async function getContentLink(projectId: number, itemId: number, inline: boolean): Promise<ContentLink> {
    return (await http.get<ContentLink>(`${contentBase(projectId)}/items/${itemId}/link`, { params: { inline } })).data;
}

// ---- the hero, the introduction, undo, publishing: each answers the whole content ----

function useChange<V = void>(projectId: number, request: (variables: V) => Promise<PortalContent>, onError?: (error: unknown) => unknown) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: (content) => putContent(queryClient, projectId, content),
        onError: onError ?? ((error: unknown) => refreshIfOutdated(queryClient, projectId, error)),
    });
}

/** An image of the drafts becomes the hero image. */
export function useSetHero(projectId: number) {
    return useChange(projectId, async (itemId: number) => (await http.put<PortalContent>(`${contentBase(projectId)}/hero`, { itemId })).data);
}

export function useClearHero(projectId: number) {
    return useChange(projectId, async () => (await http.delete<PortalContent>(`${contentBase(projectId)}/hero`)).data);
}

/** The introduction for the client; null (or nothing but spaces) takes it away. */
export function useSetSummary(projectId: number) {
    return useChange(projectId, async (summary: string | null) => (await http.put<PortalContent>(`${contentBase(projectId)}/summary`, { summary })).data);
}

/** Takes back the removal of a published file. */
export function useRestoreItem(projectId: number) {
    return useChange(projectId, async (itemId: number) => (await http.post<PortalContent>(`${contentBase(projectId)}/items/${itemId}/restore`)).data);
}

/**
 * The drafts changed since the person looked (their revision is out of date), or there is nothing to put back yet:
 * the drafts are loaded again, and the person is told. Anything else is handled as for any change.
 */
async function revisionRefused(queryClient: QueryClient, projectId: number, error: unknown) {
    const { code } = toApiError(error);
    if (code !== "portal_revision_stale" && code !== "portal_never_published") return refreshIfOutdated(queryClient, projectId, error);
    await queryClient.refetchQueries({ queryKey: contentKey(projectId) });
    if (code === "portal_revision_stale") toast({ text: "Someone changed the drafts since you looked. Check what's new and publish again.", icon: "alert" });
}

/** Makes the drafts what clients see. It is given the revision the person looked at. */
export function usePublish(projectId: number) {
    const queryClient = useQueryClient();
    const publish = async (expectedRevision: number) =>
        (await http.post<PortalContent>(`${contentBase(projectId)}/publish`, { expectedRevision })).data;
    return useChange(projectId, publish, (error: unknown) => revisionRefused(queryClient, projectId, error));
}

/** Puts the drafts back to what clients see; files that were never published are deleted. */
export function useDiscard(projectId: number) {
    const queryClient = useQueryClient();
    const discard = async (expectedRevision: number) =>
        (await http.post<PortalContent>(`${contentBase(projectId)}/discard`, { expectedRevision })).data;
    return useChange(projectId, discard, (error: unknown) => revisionRefused(queryClient, projectId, error));
}

// ---- the order of a section ----

type Order = { id: number; sortOrder: number }[];
type NewOrder = { section: PortalSection; itemIds: number[]; before: Order };

const orderOf = (content: PortalContent | undefined, section: PortalSection): Order =>
    (content?.items ?? []).filter((i) => i.section === section).map((i) => ({ id: i.id, sortOrder: i.sortOrder }));

/** Gives the section's cards the order of `itemIds`; the ones it doesn't list (removed ones) stay where they were. */
function applyOrder(queryClient: QueryClient, projectId: number, itemIds: number[]) {
    patchContent(queryClient, projectId, (content) => ({
        ...content,
        items: content.items.map((i) => (itemIds.includes(i.id) ? { ...i, sortOrder: itemIds.indexOf(i.id) } : i)).sort(bySectionThenOrder),
    }));
}

function restoreOrder(queryClient: QueryClient, projectId: number, before: Order) {
    patchContent(queryClient, projectId, (content) => ({
        ...content,
        items: content.items.map((i) => ({ ...i, sortOrder: before.find((b) => b.id === i.id)?.sortOrder ?? i.sortOrder })).sort(bySectionThenOrder),
    }));
}

/**
 * A section's new order. It shows at once; the API's answer replaces it. If the API refuses it, the old order comes
 * back, and the person is told: because someone changed the section meanwhile (it is loaded again), or why not.
 * Answers whether the order was saved.
 */
export function useReorder(projectId: number) {
    const queryClient = useQueryClient();
    const save = useMutation({
        mutationFn: async ({ section, itemIds }: NewOrder) =>
            (await http.put<PortalContent>(`${contentBase(projectId)}/sections/${section}/order`, { itemIds })).data,
        onSuccess: (content) => putContent(queryClient, projectId, content),
        onError: async (error, { before }) => {
            restoreOrder(queryClient, projectId, before);
            if (toApiError(error).code === "portal_order_stale") {
                await queryClient.refetchQueries({ queryKey: contentKey(projectId) });
                toast({ text: "Someone changed this section, so your move wasn't saved.", icon: "alert" });
                return;
            }
            toast({ text: "The new order wasn't saved", sub: errorMessage(error), icon: "alert" });
            refreshIfOutdated(queryClient, projectId, error);
        },
    });

    return async function reorder(section: PortalSection, itemIds: number[]): Promise<boolean> {
        const before = orderOf(queryClient.getQueryData<PortalContent>(contentKey(projectId)), section);
        applyOrder(queryClient, projectId, itemIds);
        try {
            await save.mutateAsync({ section, itemIds, before });
            return true;
        } catch {
            // the old order is back, and the person was told
            return false;
        }
    };
}
