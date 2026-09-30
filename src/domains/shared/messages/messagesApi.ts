import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

export type Conversation = Schemas["ConversationResponse"];
export type Contact = Schemas["ContactResponse"];
export type Message = Schemas["MessageResponse"];

/** A chat: a team's group chat, or the direct chat with one person. */
export type Chat = { kind: "group"; teamId: number } | { kind: "dm"; userId: number };

export const chatKey = (chat: Chat) => (chat.kind === "group" ? `group-${chat.teamId}` : `dm-${chat.userId}`);
const chatPath = (chat: Chat) => (chat.kind === "group" ? `/messages/teams/${chat.teamId}` : `/messages/direct/${chat.userId}`);
/** A chat's address on the messages page: ?group=4 or ?with=12. */
export const chatQuery = (c: Conversation) => (c.type === "group" && c.team ? `group=${c.team.id}` : c.person ? `with=${c.person.id}` : "");
export const chatOf = (c: Conversation): Chat | null =>
    c.type === "group" && c.team ? { kind: "group", teamId: c.team.id } : c.person ? { kind: "dm", userId: c.person.id } : null;

// every key starts with "messages", so the live connection's signal refreshes all of them
const messagesKey = ["messages"] as const;

/** Every team chat the person is in, and their direct chats, newest first. */
export function useConversations(enabled = true) {
    return useQuery({
        queryKey: [...messagesKey, "conversations"],
        queryFn: async () => (await http.get<Conversation[]>("/messages/conversations")).data,
        enabled,
    });
}

/** Everyone they may message directly. */
export function useContacts() {
    return useQuery({
        queryKey: [...messagesKey, "contacts"],
        queryFn: async () => (await http.get<Contact[]>("/messages/contacts")).data,
        staleTime: 5 * 60_000,
    });
}

/** A team chat's members, who can be mentioned in it. */
export function useTeamMembers(teamId: number | null) {
    return useQuery({
        queryKey: [...messagesKey, "members", teamId],
        queryFn: async () => (await http.get<Contact[]>(`/messages/teams/${teamId}/members`)).data,
        enabled: teamId != null,
        staleTime: 5 * 60_000,
    });
}

/** A chat's messages: the newest page, and older ones on request. Each page is oldest first. */
export function useThread(chat: Chat | null) {
    return useInfiniteQuery({
        queryKey: [...messagesKey, "thread", chat ? chatKey(chat) : null],
        queryFn: async ({ pageParam }) =>
            (await http.get<Schemas["MessagePageResponse"]>(chatPath(chat!), { params: { before: pageParam, limit: 50 } })).data,
        initialPageParam: null as number | null,
        getNextPageParam: (page) => (page.hasMore && page.items.length ? page.items[0].id : undefined),
        enabled: chat != null,
    });
}

/** Marks a chat read up to now; the badge comes back with the answer. */
export function useMarkChatRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (chat: Chat) => (await http.post<Schemas["MessagesBadgeResponse"]>(`${chatPath(chat)}/read`)).data,
        onSuccess: (badge) => {
            queryClient.setQueryData([...messagesKey, "badge"], badge);
            void queryClient.invalidateQueries({ queryKey: [...messagesKey, "conversations"] });
        },
    });
}

export function useSendMessage(chat: Chat | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: Schemas["SendMessageRequest"]) => (await http.post<Message>(chatPath(chat!), body)).data,
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: messagesKey, predicate: (q) => q.queryKey[1] !== "contacts" && q.queryKey[1] !== "members" }); },
    });
}

/** Who is online now (for the dots beside names). Nothing says when it changes, so it is asked again each minute. */
export function usePresence() {
    return useQuery({
        queryKey: ["presence"],
        queryFn: async () => new Set((await http.get<Schemas["PresenceResponse"]>("/presence")).data.online),
        refetchInterval: 60_000,
    });
}
