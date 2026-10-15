import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toApiError } from "@/api/errors";
import { http } from "@/api/http";
import { toast } from "@/shared/components/Feedback/toast";

/** The three places a project's files are sorted into. */
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
 * from what clients see. Removed: clients still see it until the next publish (it was deleted, or taken off the
 * client's files).
 */
export type ItemState = "new" | "changed" | "unchanged" | "removed";

/** What both tabs know of a project's file: its card's picture, title and facts. */
export type FileItem = {
    id: number;
    section: PortalSection;
    title: string;
    sortOrder: number;
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
    /** Who uploaded its current file. */
    uploadedBy: PersonRef | null;
};

/** A file chosen for the client (or still published), as the Client portal tab shows it. */
export type PortalContentItem = FileItem & {
    /** Everything but "unchanged". */
    isDraft: boolean;
    state: ItemState;
};

/** A draft hero image; its link may be relative (development). */
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
    /** False when file storage isn't set up: no hero uploads. */
    storageReady: boolean;
    /** Holds client_portal:manage: chooses the client's files, the hero and the introduction, and publishes. */
    canManage: boolean;
    /** canManage, and the project isn't archived. */
    canEdit: boolean;
    readOnlyReason: string | null;
    usage: PortalUsage;
    /** Lower case, without the dot. */
    acceptedExtensions: string[];
    /** The client's files (chosen, or still published), ordered by section, then sort order, then id; removed ones included. */
    items: PortalContentItem[];
    /** Goes up on every change that touches the client: sent back with publish and discard. */
    revision: number;
    publication: { publishedAt: string | null; publishedBy: PersonRef | null };
    changes: PortalChanges;
    hasUnpublishedChanges: boolean;
    canPublish: boolean;
    canDiscard: boolean;
    /** The first of the draft hero images, or null. */
    hero: PortalHero | null;
    /** The draft hero images, in order: the first is the big one on the client's page. */
    heroes: PortalHero[];
    /** The introduction for the client: plain text. */
    summary: string | null;
};

export type ContentLink = { url: string; expiresAt: string };

export const PORTAL_SECTIONS: PortalSection[] = ["presentation", "model", "drawing"];
export const SECTION_LABEL: Record<PortalSection, string> = { presentation: "Presentation", model: "3D", drawing: "Drawings" };
/** What a hero image may be (the API refuses the others). */
export const HERO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
/** The most hero images a project's page has. */
export const MAX_HEROES = 12;
export const SUMMARY_MAX = 2000;

/**
 * The API's answers that say the project's files can no longer be changed: the page's `canEdit` is out of date, so it
 * is loaded again.
 */
export const LOCKED_CODES = ["portal_content_read_only", "portal_project_not_eligible"];

export const contentBase = (projectId: number) => `/projects/${projectId}/portal/content`;
export const contentKey = (projectId: number) => ["portal-content", projectId] as const;
/** The staff preview of what clients would get (PresentationPreview keeps it). */
export const previewKey = (projectId: number) => ["portal-preview", projectId] as const;

/** Ascending sort order, then id: the order of cards in a section. */
export const byOrder = (a: FileItem, b: FileItem) => a.sortOrder - b.sortOrder || a.id - b.id;

export const bySectionThenOrder = (a: FileItem, b: FileItem) =>
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
 * again. A file keeps the link it was first shown with while more than 10 minutes of it remain, in either tab.
 */
export function steadyLinks<T extends FileItem>(items: T[]): T[] {
    return items.map((item) => {
        if (!item.previewUrl || !item.previewUrlExpiresAt) return item;
        const link = keep(previews, item.file.id, item.previewUrl, item.previewUrlExpiresAt);
        return link.url === item.previewUrl ? item : { ...item, previewUrl: link.url, previewUrlExpiresAt: link.expiresAt };
    });
}

function steadyHero(hero: PortalHero): PortalHero {
    if (!hero.url || !hero.urlExpiresAt) return hero;
    const link = keep(heroes, hero.fileId, hero.url, hero.urlExpiresAt);
    return link.url === hero.url ? hero : { ...hero, url: link.url, urlExpiresAt: link.expiresAt };
}

const steadyContent = (content: PortalContent): PortalContent => ({
    ...content,
    items: steadyLinks(content.items),
    hero: content.hero && steadyHero(content.hero),
    heroes: content.heroes.map(steadyHero),
});

/** A link that didn't load: the next answer brings a new one. */
export function forgetPreview(fileId: number) {
    previews.delete(fileId);
    heroes.delete(fileId);
}

/** A short-lived link to a file, from either tab's address (`base`): shown in the browser (`inline`) or saved. */
export async function getContentLink(base: string, itemId: number, inline: boolean): Promise<ContentLink> {
    return (await http.get<ContentLink>(`${base}/items/${itemId}/link`, { params: { inline } })).data;
}

// ---- the cached content ----

/** The client's files by section, with the hero, the introduction, what is unpublished and what the person may do. */
export function usePortalContent(projectId: number, enabled = true) {
    return useQuery({
        queryKey: contentKey(projectId),
        queryFn: async () => steadyContent((await http.get<PortalContent>(contentBase(projectId))).data),
        enabled,
    });
}

/** The API's answer to a change is the whole content: it replaces the cached one; the preview and the activity feed follow. */
function putContent(queryClient: QueryClient, projectId: number, content: PortalContent) {
    queryClient.setQueryData(contentKey(projectId), steadyContent(content));
    void queryClient.invalidateQueries({ queryKey: previewKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
}

/** Whether an error says the cached content is out of date; if so it is loaded again. */
function refreshIfOutdated(queryClient: QueryClient, projectId: number, error: unknown) {
    const { status, code } = toApiError(error);
    if (status === 404 || LOCKED_CODES.includes(code)) void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
}

// ---- the hero, the introduction, publishing: each answers the whole content ----

function useChange<V = void>(projectId: number, request: (variables: V) => Promise<PortalContent>, onError?: (error: unknown) => unknown) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: (content) => putContent(queryClient, projectId, content),
        onError: onError ?? ((error: unknown) => refreshIfOutdated(queryClient, projectId, error)),
    });
}

/**
 * The hero images were changed meanwhile, here or by someone else (the image is one already, there are 12, the order
 * sent wasn't the whole list): the content is loaded again. Anything else is handled as for any change.
 */
const HERO_OUTDATED = ["portal_hero_already_added", "portal_hero_limit", "portal_order_stale"];

function useHeroChange<V>(projectId: number, request: (variables: V) => Promise<PortalContent>) {
    const queryClient = useQueryClient();
    return useChange(projectId, request, (error: unknown) => {
        if (HERO_OUTDATED.includes(toApiError(error).code)) void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
        else refreshIfOutdated(queryClient, projectId, error);
    });
}

/** An image of the client's files is added at the end of the hero images. */
export function useAddHero(projectId: number) {
    return useHeroChange(projectId, async (itemId: number) => (await http.post<PortalContent>(`${contentBase(projectId)}/heroes`, { itemId })).data);
}

/** A hero image is taken off (the file stays in Project files). */
export function useRemoveHero(projectId: number) {
    return useHeroChange(projectId, async (fileId: number) => (await http.delete<PortalContent>(`${contentBase(projectId)}/heroes/${fileId}`)).data);
}

/** The hero images' new order: all of them, by their files. */
export function useOrderHeroes(projectId: number) {
    return useHeroChange(projectId, async (fileIds: number[]) => (await http.put<PortalContent>(`${contentBase(projectId)}/heroes/order`, { fileIds })).data);
}

/** The introduction for the client; null (or nothing but spaces) takes it away. */
export function useSetSummary(projectId: number) {
    return useChange(projectId, async (summary: string | null) => (await http.put<PortalContent>(`${contentBase(projectId)}/summary`, { summary })).data);
}

/**
 * What the client gets changed since the person looked (their revision is out of date), or there is nothing to put
 * back yet: the content is loaded again, and the person is told. Anything else is handled as for any change.
 */
async function revisionRefused(queryClient: QueryClient, projectId: number, error: unknown) {
    const { code } = toApiError(error);
    if (code !== "portal_revision_stale" && code !== "portal_never_published") return refreshIfOutdated(queryClient, projectId, error);
    await queryClient.refetchQueries({ queryKey: contentKey(projectId) });
    if (code === "portal_revision_stale") toast({ text: "Someone changed the drafts since you looked. Check what's new and publish again.", icon: "alert" });
}

/** Makes the client's files, the hero and the introduction what clients see. It is given the revision the person looked at. */
export function usePublish(projectId: number) {
    const queryClient = useQueryClient();
    const publish = async (expectedRevision: number) =>
        (await http.post<PortalContent>(`${contentBase(projectId)}/publish`, { expectedRevision })).data;
    return useChange(projectId, publish, (error: unknown) => revisionRefused(queryClient, projectId, error));
}

/** Puts the client's choices back to what clients see: which files they get, the hero and the introduction. */
export function useDiscard(projectId: number) {
    const queryClient = useQueryClient();
    const discard = async (expectedRevision: number) =>
        (await http.post<PortalContent>(`${contentBase(projectId)}/discard`, { expectedRevision })).data;
    return useChange(projectId, discard, (error: unknown) => revisionRefused(queryClient, projectId, error));
}
