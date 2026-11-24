import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";

export type Contact = Schemas["ContactResponse"];
export type Message = Schemas["MessageResponse"];
export type Receipt = Schemas["MessageReceiptResponse"];
export type Receipts = Schemas["MessageReceiptsResponse"];

// Custom chat groups came with the API's MR-Chat-Groups: these follow its shapes until `npm run api:types` is run
// against an API that has them, which then gives the same types from schema.d.ts.
/** A custom chat group as its members see it in their chats. */
export type ChatGroup = { id: number; name: string; photoFileId: number | null; memberCount: number };
/** A custom group for whoever manages groups, with its active members and whether the viewer is one of them. */
export type ChatGroupDetail = { id: number; name: string; photoFileId: number | null; members: Contact[]; isMember: boolean; createdAt: string };
export type Conversation = Omit<Schemas["ConversationResponse"], "type"> & {
    type: Schemas["ConversationResponse"]["type"] | "custom_group";
    group?: ChatGroup | null;
};

/** A message that is a custom group's grey line: what changed in it, the words after its sender's name. */
export const isGroupEvent = (m: Message) => m.kind === "group_event";

/**
 * A chat: a team's group chat, the direct chat with one person, Announcements, which everyone reads, or a custom
 * group a super admin made of whoever they picked.
 */
export type Chat = { kind: "group"; teamId: number } | { kind: "dm"; userId: number } | { kind: "announcements" } | { kind: "custom"; groupId: number };

export const chatKey = (chat: Chat) =>
    chat.kind === "group" ? `group-${chat.teamId}` : chat.kind === "dm" ? `dm-${chat.userId}` : chat.kind === "custom" ? `custom-${chat.groupId}` : "announcements";
const chatPath = (chat: Chat) =>
    chat.kind === "group" ? `/messages/teams/${chat.teamId}` : chat.kind === "dm" ? `/messages/direct/${chat.userId}`
        : chat.kind === "custom" ? `/messages/groups/${chat.groupId}` : "/messages/announcements";
/** A chat's address on the messages page: ?group=4, ?with=12, ?custom=7 or ?announcements=1. */
export const chatQuery = (c: Conversation) =>
    c.type === "announcements" ? "announcements=1" : c.type === "group" && c.team ? `group=${c.team.id}`
        : c.type === "custom_group" && c.group ? `custom=${c.group.id}` : c.person ? `with=${c.person.id}` : "";
export const chatOf = (c: Conversation): Chat | null =>
    c.type === "announcements" ? { kind: "announcements" }
        : c.type === "group" && c.team ? { kind: "group", teamId: c.team.id }
            : c.type === "custom_group" && c.group ? { kind: "custom", groupId: c.group.id }
                : c.person ? { kind: "dm", userId: c.person.id } : null;

// every key starts with "messages", so the live connection's signal refreshes all of them
const messagesKey = ["messages"] as const;

/** Announcements first, then every team chat and custom group the person is in and their direct chats, newest first. */
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

/**
 * Who has seen a message, who has received it, and who hasn't: for its sender, the super admins in team chats and
 * whoever announces in Announcements. The live connection's "receipts" signal reloads it.
 */
export function useMessageReceipts(messageId: number | null) {
    return useQuery({
        queryKey: [...messagesKey, "receipts", messageId],
        queryFn: async () => (await http.get<Receipts>(`/messages/${messageId}/receipts`)).data,
        enabled: messageId != null,
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

/** Whether its sender may delete it: any message but a shared work comment, which belongs to the comment. */
export function canDeleteMessage(m: Message): boolean {
    return m.kind === "text";
}

type Attachment = Message["attachments"][number];

/** What each file of a message is called in its menu: "photo", "video", "voice note" or "document", numbered when there are several of a kind. */
export function fileLabels(files: Attachment[]): { file: Attachment; label: string }[] {
    const kindOf = (f: Attachment) => (f.kind === "audio" || f.mimeType.startsWith("audio/") ? "voice note"
        : f.kind === "video" || f.mimeType.startsWith("video/") ? "video"
            : f.kind === "document" ? "document" : "photo");
    return files.map((file, i) => {
        const kind = kindOf(file);
        const same = files.filter((f) => kindOf(f) === kind);
        return { file, label: same.length > 1 ? `${kind} ${files.slice(0, i + 1).filter((f) => kindOf(f) === kind).length}` : kind };
    });
}

/** Deletes the caller's own message for everyone, its files too (`DELETE /api/messages/{id}`). */
export function useDeleteMessage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (messageId: number) => { await http.delete(`/messages/${messageId}`); },
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

/** A custom group's active members: who can be mentioned in it, and who the manage window lists. */
export function useGroupMembers(groupId: number | null) {
    return useQuery({
        queryKey: [...messagesKey, "members", "custom", groupId],
        queryFn: async () => (await http.get<Contact[]>(`/messages/groups/${groupId}/members`)).data,
        enabled: groupId != null,
    });
}

/** Every custom group, with its members, for whoever manages groups (message:manage_groups). */
export function useManagedGroups(enabled = true) {
    return useQuery({
        queryKey: [...messagesKey, "groups"],
        queryFn: async () => (await http.get<ChatGroupDetail[]>("/messages/groups")).data,
        enabled,
    });
}

/** Every active member of staff, of any business: who can be put in a group. */
export function useGroupCandidates(enabled = true) {
    return useQuery({
        queryKey: [...messagesKey, "groups", "people"],
        queryFn: async () => (await http.get<Contact[]>("/messages/groups/people")).data,
        enabled,
        staleTime: 5 * 60_000,
    });
}

/** Changing a group changes the chats, the members and the managing list: everything under "messages" but the contacts. */
function useGroupChange<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        // waited for, so a window that closes on success finds the chats already reloaded
        onSuccess: () => queryClient.invalidateQueries({ queryKey: messagesKey, predicate: (q) => q.queryKey[1] !== "contacts" }),
    });
}

export function useCreateGroup() {
    return useGroupChange(async (body: { name: string; memberIds: number[] }) => (await http.post<ChatGroupDetail>("/messages/groups", body)).data);
}

export function useRenameGroup(groupId: number) {
    return useGroupChange(async (name: string) => (await http.put<ChatGroupDetail>(`/messages/groups/${groupId}`, { name })).data);
}

export function useAddGroupMembers(groupId: number) {
    return useGroupChange(async (userIds: number[]) => (await http.post<ChatGroupDetail>(`/messages/groups/${groupId}/members`, { userIds })).data);
}

export function useRemoveGroupMember(groupId: number) {
    return useGroupChange(async (userId: number) => (await http.delete<ChatGroupDetail>(`/messages/groups/${groupId}/members/${userId}`)).data);
}

/** A photo from an upload, or null to go back to the people icon. */
export function useSetGroupPhoto(groupId: number) {
    return useGroupChange(async (fileId: number | null) =>
        (fileId == null
            ? await http.delete<ChatGroupDetail>(`/messages/groups/${groupId}/photo`)
            : await http.put<ChatGroupDetail>(`/messages/groups/${groupId}/photo`, { fileId })).data);
}

/** Deletes the group for everyone, its whole history with it. */
export function useDeleteGroup(groupId: number) {
    return useGroupChange(async () => { await http.delete(`/messages/groups/${groupId}`); });
}

/** The person leaves a group they are in: it goes from their chats, history included. */
export function useLeaveGroup(groupId: number) {
    return useGroupChange(async () => { await http.post(`/messages/groups/${groupId}/leave`); });
}
