import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

export type ProtonReply = Schemas["ProtonReplyResponse"];
export type ProtonPendingAction = Schemas["ProtonPendingAction"];
export type ProtonOutcome = Schemas["ProtonActionOutcomeResponse"];
export type ProtonActionSummary = Schemas["ProtonActionSummaryResponse"];
export type ProtonMemory = Schemas["ProtonMemoryResponse"];
export type ProtonRef = Schemas["ProtonRef"];
export type ProtonChoice = Schemas["ProtonChoice"];
export type ProtonQuickReplyOption = Schemas["ProtonQuickReplyOption"];
export type ProtonBriefing = Schemas["ProtonBriefingResponse"];
export type ProtonUsage = Schemas["ProtonUsageResponse"];
export type ProtonVoiceSession = Schemas["ProtonVoiceSessionResponse"];

/**
 * A question, or one of the buttons of the last reply, with the page the person is on. A button sends only what it
 * is (a record, a fixed reply, a suggestion's place in the list): the API checks it was offered and writes the text.
 */
export type AskBody = {
    conversationId: string | null;
    text?: string;
    page?: Schemas["ProtonPageContext"] | null;
    choice?: { type: Schemas["ProtonRefType"]; id: number };
    reply?: Schemas["ProtonQuickReply"];
    suggestion?: number;
    /** A question said in a voice session: the session, and the voice model's id for this request (asked once). */
    voice?: { sessionId: string; delegationId: string };
};

// every key starts with "proton"
const protonKey = ["proton"] as const;

/** The person's question allowance this month (never money), and whether Proton can answer now. */
export function useProtonUsage(enabled = true) {
    return useQuery({
        queryKey: [...protonKey, "usage"],
        queryFn: async () => (await http.get<ProtonUsage>("/proton/usage")).data,
        enabled,
    });
}

/**
 * What may need the person's attention, for the greeting: no model call and no question used. Asked again at most
 * every five minutes.
 */
export function useProtonBriefing(enabled = true) {
    return useQuery({
        queryKey: [...protonKey, "briefing"],
        queryFn: async () => (await http.get<ProtonBriefing>("/proton/briefing")).data,
        staleTime: 5 * 60_000,
        enabled,
    });
}

/**
 * Confirms or cancels a proposed change: only its id and conversation go to the API, which runs the stored change
 * (or refuses it) itself. A confirmed change can touch anything Proton shows, so every cached screen is refreshed.
 */
export function useDecideAction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ action, conversationId, decision, typed }: {
            action: ProtonPendingAction; conversationId: string; decision: "confirm" | "cancel"; typed?: string;
        }) => (await http.post<ProtonOutcome>(`/proton/actions/${action.id}/${decision}`, { conversationId, ...(typed != null && { typed }) })).data,
        onSettled: (_outcome, _error, { decision }) => {
            if (decision === "confirm") void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== protonKey[0] });
            void queryClient.invalidateQueries({ queryKey: [...protonKey, "actions"] });
        },
    });
}

/** The person's own proposals and what became of them: a card brought back after a reload reads its status here. */
export function useMyProtonActions(enabled: boolean) {
    return useQuery({
        queryKey: [...protonKey, "actions"],
        queryFn: async () => (await http.get<ProtonActionSummary[]>("/proton/actions")).data,
        enabled,
    });
}

/** Everything Proton proposed, to whom, and what was confirmed: for those who manage Proton (proton_budget:manage). */
export function useAllProtonActions() {
    return useQuery({
        queryKey: [...protonKey, "actions", "all"],
        queryFn: async () => (await http.get<ProtonActionSummary[]>("/proton/actions/all")).data,
    });
}

/** What Proton remembers for the person between chats. */
export function useProtonMemories() {
    return useQuery({
        queryKey: [...protonKey, "memories"],
        queryFn: async () => (await http.get<ProtonMemory[]>("/proton/memories")).data,
    });
}

/** Saves words the person typed in this chat; the API checks they are theirs and only a preference. */
export function useRemember() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: { conversationId: string; text: string }) => (await http.post<ProtonMemory>("/proton/memories", body)).data,
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...protonKey, "memories"] }),
    });
}

export function useForgetMemory() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/proton/memories/${id}`); },
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...protonKey, "memories"] }),
    });
}

/**
 * Starts a voice session: the API asks the provider for one with the browser's WebRTC offer and returns its answer.
 * The provider key never comes to the browser.
 */
export async function startVoiceSession(body: { conversationId: string | null; sdp: string }) {
    return (await http.post<ProtonVoiceSession>("/proton/voice/sessions", body)).data;
}

/**
 * Tells the API the person ended their voice session, so the server closes it with the provider even if the browser
 * couldn't. With keepalive it still goes out while the page is being left.
 */
export function endVoiceSession(sessionId: string, token: string | null) {
    return fetch(`/api/proton/voice/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: "{}",
    }).catch(() => undefined);
}

export type ProtonChatSummary = Schemas["ProtonConversationSummaryResponse"];
export type ProtonSavedChat = Schemas["ProtonConversationResponse"];
type ProtonChatPage = Schemas["PagedResponseOfProtonConversationSummaryResponse"];

const chatsKey = [...protonKey, "chats"] as const;

/** The person's saved chats, most recently used first, optionally by title. */
export function useProtonChats(search: string, enabled = true) {
    return useQuery({
        queryKey: [...chatsKey, "list", search],
        queryFn: async () => (await http.get<ProtonChatPage>("/proton/conversations", { params: { search: search || undefined, pageSize: 50 } })).data,
        enabled,
    });
}

/** One saved chat, as the person saw it. */
export async function fetchProtonChat(id: string) {
    return (await http.get<ProtonSavedChat>(`/proton/conversations/${id}`)).data;
}

/** Something about the person's chats changed: the list is read again. */
export function useRefreshChats() {
    const queryClient = useQueryClient();
    return () => void queryClient.invalidateQueries({ queryKey: chatsKey });
}

export function useRenameChat() {
    const refresh = useRefreshChats();
    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }) => (await http.patch<ProtonChatSummary>(`/proton/conversations/${id}`, { title })).data,
        onSuccess: refresh,
    });
}

/** Deletes one of the person's chats, saved and held, with its words. */
export function useDeleteChat() {
    const refresh = useRefreshChats();
    return useMutation({
        mutationFn: async (id: string) => { await http.delete(`/proton/conversations/${id}`); },
        onSuccess: refresh,
    });
}

export type ProtonSource = Schemas["ProtonSourceResponse"];
export type ProtonBudget = Schemas["ProtonBudgetResponse"];

/** This month's estimated cost against the budget, and where it went: super admins only (proton_budget:manage). */
export function useProtonBudget() {
    return useQuery({
        queryKey: [...protonKey, "budget"],
        queryFn: async () => (await http.get<ProtonBudget>("/proton/budget")).data,
    });
}

/** Adds to this month's budget; the API answers with the budget as it now stands. */
export function useTopUpBudget() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: { amountUsd: number; note: string | null }) =>
            (await http.post<ProtonBudget>("/proton/budget/top-ups", body)).data,
        onSuccess: (budget) => {
            queryClient.setQueryData([...protonKey, "budget"], budget);
            void queryClient.invalidateQueries({ queryKey: [...protonKey, "usage"] });
        },
    });
}
