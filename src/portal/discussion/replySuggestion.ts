import { useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import type { PortalChatMessage } from "./discussionTypes";

export type ReplySuggestion = Schemas["ProtonReplySuggestion"];

/**
 * The reply Proton suggests to the latest message of a project's chat, when it is a client's: asked once per message,
 * and kept while the chat is open. `enabled` is the team side's own decision (the company's and the person's switches,
 * and proton:use); the server checks them all again, and says why when there is none.
 */
export function useReplySuggestion(projectId: number, newest: PortalChatMessage | undefined, enabled: boolean): string | null {
    const replyTo = enabled && newest && !newest.deleted && newest.author.kind === "client" ? newest.id : null;
    const query = useQuery({
        queryKey: ["proton", "reply-suggestion", projectId, replyTo],
        queryFn: async () => (await http.post<ReplySuggestion>("/proton/reply-suggestions", { projectId })).data,
        enabled: replyTo != null,
        staleTime: Infinity,
        gcTime: 10 * 60_000,
        retry: false,
    });
    return replyTo != null ? query.data?.text ?? null : null;
}
