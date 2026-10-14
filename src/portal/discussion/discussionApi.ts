import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { AxiosInstance } from "axios";
import { useRef } from "react";
import type { CommentThread, DiscussionSummary, Draft, MessagePage, PortalChatMessage, PortalComment } from "./discussionTypes";

/*
 * The project discussion's calls, for the client's portal and for the staff alike. The two sides ask the same questions
 * of different addresses with different tokens, so a Discussion says which side it is, which axios instance to use and
 * where the project's discussion lives. The portal never imports the staff instance: the staff page builds its own
 * Discussion (staffDiscussion.ts) and the portal page its own (clientDiscussion.ts).
 */

export type DiscussionSide = "staff" | "client";

export type Discussion = {
    side: DiscussionSide;
    http: AxiosInstance;
    /** Where a project's discussion is, relative to the instance's base address. */
    base: (projectId: number) => string;
};

/** How many chat messages one page asks for. */
export const PAGE_SIZE = 30;

// The live signals refresh these exact keys, so they are the same on both sides of the app.
export const summaryKey = (side: DiscussionSide, projectId: number) => ["portal-discussion", side, projectId] as const;
export const messagesKey = (side: DiscussionSide, projectId: number) => ["portal-discussion", side, projectId, "messages"] as const;
export const threadKey = (side: DiscussionSide, projectId: number, itemId: number) => ["portal-discussion", side, projectId, "thread", itemId] as const;

type Pages = InfiniteData<MessagePage, number | undefined>;

/** The project's discussion at a glance: who takes part, what is unread, which files have comments. A 404 means this person doesn't take part. */
export function useDiscussionSummary(d: Discussion, projectId: number, options: { enabled?: boolean; retry?: false } = {}) {
    return useQuery({
        queryKey: summaryKey(d.side, projectId),
        queryFn: async () => (await d.http.get<DiscussionSummary>(d.base(projectId))).data,
        enabled: options.enabled ?? true,
        // (leaving retry out keeps the app's own rule: not for a 4xx)
        ...(options.retry === false ? { retry: false as const } : {}),
    });
}

/** The chat: the newest page first, then older ones as they are asked for. */
export function useChatMessages(d: Discussion, projectId: number) {
    return useInfiniteQuery({
        queryKey: messagesKey(d.side, projectId),
        initialPageParam: undefined as number | undefined,
        queryFn: async ({ pageParam }) =>
            (await d.http.get<MessagePage>(`${d.base(projectId)}/messages`, { params: { before: pageParam, limit: PAGE_SIZE } })).data,
        getNextPageParam: (last) => (last.hasMore && last.messages.length > 0 ? last.messages[0].id : undefined),
    });
}

/** One file's comments. */
export function useCommentThread(d: Discussion, projectId: number, itemId: number, enabled = true) {
    return useQuery({
        queryKey: threadKey(d.side, projectId, itemId),
        queryFn: async () => (await d.http.get<CommentThread>(`${d.base(projectId)}/comments/${itemId}`)).data,
        enabled,
    });
}

// ---- keeping the cache in step with what was written ----

/** The summary's counts move with every write: ask for it again. The chat and the threads are set from the answers. */
function refreshSummary(queryClient: QueryClient, d: Discussion, projectId: number) {
    return queryClient.invalidateQueries({ queryKey: summaryKey(d.side, projectId), exact: true });
}

/** A message that was sent or edited, in the newest page or in place. A chat that isn't loaded yet is asked for instead. */
function putMessage(queryClient: QueryClient, d: Discussion, projectId: number, message: PortalChatMessage) {
    const key = messagesKey(d.side, projectId);
    if (!queryClient.getQueryData<Pages>(key)?.pages.length) {
        void queryClient.invalidateQueries({ queryKey: key, exact: true });
        return;
    }
    queryClient.setQueryData<Pages>(key, (data) => {
        if (!data || data.pages.length === 0) return data;
        const known = data.pages.some((page) => page.messages.some((m) => m.id === message.id));
        const pages = known
            ? data.pages.map((page) => ({ ...page, messages: page.messages.map((m) => (m.id === message.id ? message : m)) }))
            : data.pages.map((page, i) => (i === 0 ? { ...page, messages: [...page.messages, message] } : page));
        return { ...data, pages };
    });
}

/** A comment that was added, edited or deleted. A thread that isn't loaded yet is asked for instead. */
function putComment(queryClient: QueryClient, d: Discussion, projectId: number, comment: PortalComment) {
    const key = threadKey(d.side, projectId, comment.itemId);
    if (!queryClient.getQueryData<CommentThread>(key)) {
        void queryClient.invalidateQueries({ queryKey: key, exact: true });
        return;
    }
    queryClient.setQueryData<CommentThread>(key, (thread) => {
        if (!thread) return thread;
        const known = thread.comments.some((c) => c.id === comment.id);
        return { ...thread, comments: known ? thread.comments.map((c) => (c.id === comment.id ? comment : c)) : [...thread.comments, comment] };
    });
}

// ---- writing ----

/**
 * Sends a chat message. Each message has its own clientToken, and sending the same words again after a failure is a retry
 * of that message (the same token), so nothing is ever sent twice.
 */
export function useSendMessage(d: Discussion, projectId: number) {
    const queryClient = useQueryClient();
    const failed = useRef<{ key: string; token: string } | null>(null);
    return useMutation({
        mutationFn: async (draft: Draft) => {
            const key = JSON.stringify(draft);
            const token = failed.current?.key === key ? failed.current.token : crypto.randomUUID();
            failed.current = { key, token };
            const { data } = await d.http.post<PortalChatMessage>(`${d.base(projectId)}/messages`, { ...draft, clientToken: token });
            failed.current = null;
            return data;
        },
        onSuccess: (message) => {
            putMessage(queryClient, d, projectId, message);
            void refreshSummary(queryClient, d, projectId);
        },
    });
}

export function useEditMessage(d: Discussion, projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ messageId, ...draft }: Draft & { messageId: number }) =>
            (await d.http.put<PortalChatMessage>(`${d.base(projectId)}/messages/${messageId}`, draft)).data,
        onSuccess: (message) => {
            putMessage(queryClient, d, projectId, message);
            void refreshSummary(queryClient, d, projectId);
        },
    });
}

/** Adds a comment on a file; a failed one is retried with the same clientToken, as a chat message is. */
export function useAddComment(d: Discussion, projectId: number) {
    const queryClient = useQueryClient();
    const failed = useRef<{ key: string; token: string } | null>(null);
    return useMutation({
        mutationFn: async (comment: Draft & { itemId: number }) => {
            const key = JSON.stringify(comment);
            const token = failed.current?.key === key ? failed.current.token : crypto.randomUUID();
            failed.current = { key, token };
            const { data } = await d.http.post<PortalComment>(`${d.base(projectId)}/comments`, { ...comment, clientToken: token });
            failed.current = null;
            return data;
        },
        onSuccess: (comment) => {
            putComment(queryClient, d, projectId, comment);
            void refreshSummary(queryClient, d, projectId);
        },
    });
}

export function useEditComment(d: Discussion, projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ commentId, ...draft }: Draft & { commentId: number }) =>
            (await d.http.put<PortalComment>(`${d.base(projectId)}/comments/${commentId}`, draft)).data,
        onSuccess: (comment) => {
            putComment(queryClient, d, projectId, comment);
            void refreshSummary(queryClient, d, projectId);
        },
    });
}

/** Deletes one of your own comments: it stays in its thread as "Comment deleted". */
export function useDeleteComment(d: Discussion, projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (commentId: number) => (await d.http.delete<PortalComment>(`${d.base(projectId)}/comments/${commentId}`)).data,
        onSuccess: (comment) => {
            putComment(queryClient, d, projectId, comment);
            void refreshSummary(queryClient, d, projectId);
        },
    });
}

/**
 * Moves the read markers forward to what has been seen: the chat's, and one file's comments (each file has its own, so
 * reading one leaves the others new). The answer is the new summary.
 */
export function useMarkRead(d: Discussion, projectId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (seen: { lastMessageId: number } | { itemId: number; lastCommentId: number }) =>
            (await d.http.post<DiscussionSummary>(`${d.base(projectId)}/read`, seen)).data,
        onSuccess: (summary) => {
            queryClient.setQueryData(summaryKey(d.side, projectId), summary);
        },
    });
}
