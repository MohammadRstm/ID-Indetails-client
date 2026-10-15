import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { errorMessage, toApiError } from "@/api/errors";
import { http } from "@/api/http";
import { toast } from "@/shared/components/Feedback/toast";
import {
    bySectionThenOrder,
    contentKey,
    LOCKED_CODES,
    previewKey,
    steadyLinks,
    type FileItem,
    type ItemState,
    type PersonRef,
    type PortalSection,
    type PortalUsage,
} from "./contentApi";

/*
 * A project's files (the Project files tab): everyone who sees the project uploads to them; a file's uploader or a
 * project_files:manage holder changes it; managers set the order; client_portal:manage holders choose which go to the
 * client. Each file has comments of its own.
 */

/** How many comments a file has, and how many of them aren't fixed. */
export type FileComments = { total: number; open: number };

export type ProjectFile = FileItem & {
    /** Chosen for the client: it goes to them with the next publish. */
    forClient: boolean;
    /** Deleted, but clients still see it until the next publish. */
    removed: boolean;
    /** This person may rename, move, replace or delete it now (its uploader, or project_files:manage). */
    canEdit: boolean;
    comments: FileComments;
    /** Where it stands against what clients see; null when it isn't for the client and was never published. */
    clientState: ItemState | null;
};

export type ProjectFiles = {
    projectId: number;
    /** False when file storage isn't set up: no uploads. */
    storageReady: boolean;
    /** False when the project is archived: files can be viewed and downloaded only. */
    canEdit: boolean;
    readOnlyReason: string | null;
    /** Holds project_files:manage: changes anyone's files, sets the order and starts comments. */
    canManage: boolean;
    /** Holds client_portal:manage, on a client project that isn't archived: chooses the client's files. */
    canChooseForClient: boolean;
    isClientProject: boolean;
    usage: PortalUsage;
    /** Lower case, without the dot. */
    acceptedExtensions: string[];
    /** Every section, ordered by section, then sort order, then id; removed ones included. */
    items: ProjectFile[];
};

export type FileComment = {
    id: number;
    itemId: number;
    author: PersonRef;
    body: string;
    createdAt: string;
    editedAt: string | null;
    fixedAt: string | null;
    fixedBy: PersonRef | null;
    /** The author's own. */
    canEdit: boolean;
    canDelete: boolean;
    /** The file's uploader or project_files:manage. */
    canFix: boolean;
};

/** The longest comment, after trimming. */
export const COMMENT_MAX = 2000;

export const filesBase = (projectId: number) => `/projects/${projectId}/files`;
export const filesKey = (projectId: number) => ["project-files", projectId] as const;
const commentsKey = (projectId: number, itemId: number) => ["project-file-comments", projectId, itemId] as const;

const steadyFiles = (files: ProjectFiles): ProjectFiles => ({ ...files, items: steadyLinks(files.items) });

/** A project's files by section, with the storage figures and what the person may do. */
export function useProjectFiles(projectId: number, enabled = true) {
    return useQuery({
        queryKey: filesKey(projectId),
        queryFn: async () => steadyFiles((await http.get<ProjectFiles>(filesBase(projectId))).data),
        enabled,
    });
}

// ---- keeping the caches in step ----

function patchFiles(queryClient: QueryClient, projectId: number, change: (files: ProjectFiles) => ProjectFiles) {
    queryClient.setQueryData<ProjectFiles>(filesKey(projectId), (files) => (files ? change(files) : files));
}

/** What the client portal shows (its files, their states, the preview) may move with any change to the files. */
function refreshClientPortal(queryClient: QueryClient, projectId: number) {
    void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: previewKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
}

/** The API's answer to a change is all the files: it replaces the cached ones. */
function putFiles(queryClient: QueryClient, projectId: number, files: ProjectFiles) {
    queryClient.setQueryData(filesKey(projectId), steadyFiles(files));
    refreshClientPortal(queryClient, projectId);
}

/** A file that was added, replaced, renamed, moved or chosen goes in its place, with the usage when the answer carried it. */
export function applyFile(queryClient: QueryClient, projectId: number, item: ProjectFile, usage?: PortalUsage) {
    const [steady] = steadyLinks([item]);
    patchFiles(queryClient, projectId, (files) => ({
        ...files,
        usage: usage ?? files.usage,
        items: [...files.items.filter((i) => i.id !== steady.id), steady].sort(bySectionThenOrder),
    }));
    refreshClientPortal(queryClient, projectId);
}

/** Whether clients see a version of the file now: deleting it then leaves it with them until the next publish. */
export const isPublished = (item: ProjectFile) => item.clientState != null && item.clientState !== "new";

/** A file clients never saw is gone; one they see stays, as removed, until the next publish. */
function removeFile(queryClient: QueryClient, projectId: number, itemId: number, usage: PortalUsage) {
    patchFiles(queryClient, projectId, (files) => ({
        ...files,
        usage,
        items: files.items.flatMap((i) => (i.id !== itemId ? [i] : isPublished(i) ? [{ ...i, removed: true }] : [])),
    }));
}

/** Whether an error says the cached files are out of date; if so they are loaded again, with the client portal. */
export function refreshIfOutdated(queryClient: QueryClient, projectId: number, error: unknown) {
    const { status, code } = toApiError(error);
    if (status !== 404 && !LOCKED_CODES.includes(code)) return;
    void queryClient.invalidateQueries({ queryKey: filesKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: contentKey(projectId) });
}

// ---- changes to a file ----

type FileChange = { itemId: number; title?: string; section?: PortalSection };

/** Renames a file or moves it to another section (it goes to the end there). */
export function useUpdateFile(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ itemId, ...change }: FileChange) => (await http.put<ProjectFile>(`${filesBase(projectId)}/items/${itemId}`, change)).data,
        onSuccess: (item) => {
            applyFile(queryClient, projectId, item);
            // the other cards' places and states come from the API: the files are loaded again
            void queryClient.invalidateQueries({ queryKey: filesKey(projectId) });
        },
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

export function useDeleteFile(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => ({
            itemId,
            usage: (await http.delete<{ usage: PortalUsage }>(`${filesBase(projectId)}/items/${itemId}`)).data.usage,
        }),
        onSuccess: ({ itemId, usage }) => {
            removeFile(queryClient, projectId, itemId, usage);
            void queryClient.invalidateQueries({ queryKey: filesKey(projectId) });
            refreshClientPortal(queryClient, projectId);
        },
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

/** Takes back the deletion of a file clients still see. */
export function useRestoreFile(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (itemId: number) => (await http.post<ProjectFiles>(`${filesBase(projectId)}/items/${itemId}/restore`)).data,
        onSuccess: (files) => putFiles(queryClient, projectId, files),
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

/** Chooses a file for the client, or takes it off their files (from either tab). Clients see the change once it's published. */
export function useSetForClient(projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ itemId, forClient }: { itemId: number; forClient: boolean }) =>
            (await http.put<ProjectFile>(`${filesBase(projectId)}/items/${itemId}/for-client`, { forClient })).data,
        onSuccess: (item) => applyFile(queryClient, projectId, item),
        onError: (error) => refreshIfOutdated(queryClient, projectId, error),
    });
}

// ---- the order of a section ----

type Order = { id: number; sortOrder: number }[];
type NewOrder = { section: PortalSection; itemIds: number[]; before: Order };

const orderOf = (files: ProjectFiles | undefined, section: PortalSection): Order =>
    (files?.items ?? []).filter((i) => i.section === section).map((i) => ({ id: i.id, sortOrder: i.sortOrder }));

/** Gives the section's cards the order of `itemIds`; the ones it doesn't list (removed ones) stay where they were. */
function applyOrder(queryClient: QueryClient, projectId: number, itemIds: number[]) {
    patchFiles(queryClient, projectId, (files) => ({
        ...files,
        items: files.items.map((i) => (itemIds.includes(i.id) ? { ...i, sortOrder: itemIds.indexOf(i.id) } : i)).sort(bySectionThenOrder),
    }));
}

function restoreOrder(queryClient: QueryClient, projectId: number, before: Order) {
    patchFiles(queryClient, projectId, (files) => ({
        ...files,
        items: files.items.map((i) => ({ ...i, sortOrder: before.find((b) => b.id === i.id)?.sortOrder ?? i.sortOrder })).sort(bySectionThenOrder),
    }));
}

/**
 * A section's new order (project_files:manage). It shows at once; the API's answer replaces it. If the API refuses it,
 * the old order comes back, and the person is told: because someone changed the section meanwhile (it is loaded
 * again), or why not. Answers whether the order was saved.
 */
export function useReorder(projectId: number) {
    const queryClient = useQueryClient();
    const save = useMutation({
        mutationFn: async ({ section, itemIds }: NewOrder) =>
            (await http.put<ProjectFiles>(`${filesBase(projectId)}/sections/${section}/order`, { itemIds })).data,
        onSuccess: (files) => putFiles(queryClient, projectId, files),
        onError: async (error, { before }) => {
            restoreOrder(queryClient, projectId, before);
            if (toApiError(error).code === "portal_order_stale") {
                await queryClient.refetchQueries({ queryKey: filesKey(projectId) });
                toast({ text: "Someone changed this section, so your move wasn't saved.", icon: "alert" });
                return;
            }
            toast({ text: "The new order wasn't saved", sub: errorMessage(error), icon: "alert" });
            refreshIfOutdated(queryClient, projectId, error);
        },
    });

    return async function reorder(section: PortalSection, itemIds: number[]): Promise<boolean> {
        const before = orderOf(queryClient.getQueryData<ProjectFiles>(filesKey(projectId)), section);
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

// ---- a file's comments ----

/** A file's comments, oldest first. */
export function useFileComments(projectId: number, itemId: number) {
    return useQuery({
        queryKey: commentsKey(projectId, itemId),
        queryFn: async () => (await http.get<FileComment[]>(`${filesBase(projectId)}/items/${itemId}/comments`)).data,
    });
}

/** A comment that was written, edited, fixed or reopened goes in its place; the file's counts are loaded again. */
function useCommentChange<V>(projectId: number, itemId: number, request: (variables: V) => Promise<FileComment>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: (comment) => {
            queryClient.setQueryData<FileComment[]>(commentsKey(projectId, itemId), (list) => list && (list.some((c) => c.id === comment.id)
                ? list.map((c) => (c.id === comment.id ? comment : c))
                : [...list, comment]));
            void queryClient.invalidateQueries({ queryKey: filesKey(projectId) });
        },
    });
}

export function useAddComment(projectId: number, itemId: number) {
    return useCommentChange(projectId, itemId, async (body: string) =>
        (await http.post<FileComment>(`${filesBase(projectId)}/items/${itemId}/comments`, { body })).data);
}

export function useEditComment(projectId: number, itemId: number) {
    return useCommentChange(projectId, itemId, async ({ commentId, body }: { commentId: number; body: string }) =>
        (await http.put<FileComment>(`${filesBase(projectId)}/comments/${commentId}`, { body })).data);
}

/** Marks a comment fixed, or opens it again. */
export function useFixComment(projectId: number, itemId: number) {
    return useCommentChange(projectId, itemId, async ({ commentId, fixed }: { commentId: number; fixed: boolean }) =>
        (await http.put<FileComment>(`${filesBase(projectId)}/comments/${commentId}/fixed`, { fixed })).data);
}

/** Deletes one of your comments for good. */
export function useDeleteComment(projectId: number, itemId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (commentId: number) => {
            await http.delete(`${filesBase(projectId)}/comments/${commentId}`);
            return commentId;
        },
        onSuccess: (commentId) => {
            queryClient.setQueryData<FileComment[]>(commentsKey(projectId, itemId), (list) => list?.filter((c) => c.id !== commentId));
            void queryClient.invalidateQueries({ queryKey: filesKey(projectId) });
        },
    });
}
