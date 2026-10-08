import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toApiError } from "@/api/errors";
import { useEndConversation, type AskBody, type ProtonChoice, type ProtonQuickReplyOption } from "./protonApi";
import { emptyChat, type ProtonTurn } from "./protonChat";
import { answered, asking, changeChat, failed, heard, stopped, useProton, wrote } from "./protonStore";
import { streamQuestion } from "./protonStream";
import { useRunProtonCommands } from "./uiCommands";
import { useProtonPageContext } from "./useProtonPageContext";

type Ask = Omit<AskBody, "conversationId" | "page">;

const ROLLED_OVER = "Our chat was getting long, so I kept a short summary of it and carried on.";
const STOPPED = "Stopped. Nothing from that answer was kept.";

export type ProtonConversation = ReturnType<typeof useProtonConversation>;

/**
 * Asking Proton, from wherever the person is, with the answer arriving as it is written. It runs in the host that is
 * always mounted, so an answer that comes back after the panel was closed (or while the person moved to another
 * page) still lands in the chat. Stop ends it: the API then keeps nothing of it.
 */
export function useProtonConversation() {
    const queryClient = useQueryClient();
    const end = useEndConversation();
    const page = useProtonPageContext();
    const run = useRunProtonCommands();
    const { chat, askedAt } = useProton();
    const running = useRef<AbortController | null>(null);

    const add = (...turns: ProtonTurn[]) => changeChat((c) => ({ ...c, turns: [...c.turns, ...turns] }));

    const send = async (conversationId: string | null, body: Ask, retried = false) => {
        asking();
        const controller = new AbortController();
        running.current = controller;
        try {
            const reply = await streamQuestion({ conversationId, page, ...body }, { onStatus: heard, onDelta: wrote }, controller.signal);
            queryClient.setQueryData(["proton", "usage"], reply.usage);
            const did = run(reply.uiCommands);
            changeChat((c) => ({
                ...c,
                conversationId: reply.conversationId,
                turns: [
                    ...c.turns,
                    ...(reply.rolledOver ? [{ from: "note", text: ROLLED_OVER } as const] : []),
                    {
                        from: "proton", text: reply.reply, refs: reply.refs, sources: reply.sources, action: reply.pendingAction,
                        choices: reply.choices, quickReplies: reply.quickReplies, suggestions: reply.suggestions, did,
                    },
                ],
            }));
            answered(reply.reply, did?.startsWith("Opened ") === true);
        } catch (error) {
            if (controller.signal.aborted) {
                stopped();
                add({ from: "note", text: STOPPED });
                return;
            }

            const failure = toApiError(error);
            if (failure.code !== "proton_conversation_ended" || conversationId == null) {
                failed();
                add({ from: "error", text: failure.message });
                return;
            }

            // The server no longer has the chat: carry on in a new one. A typed question is simply asked again
            // there; a button belonged to the old chat, so the person asks again in their own words.
            changeChat((c) => ({ ...c, conversationId: null }));
            add({ from: "note", text: body.text && !retried ? failure.message : `${failure.message} Could you ask that again?` });
            if (body.text && !retried) await send(null, { text: body.text }, true);
            else failed();
        } finally {
            if (running.current === controller) running.current = null;
        }
    };

    const pending = askedAt != null;
    const submit = (shown: string, body: Ask) => {
        if (pending) return;
        add({ from: "you", text: shown });
        void send(chat.conversationId, body);
    };

    return {
        pending,
        question: (text: string) => submit(text, { text }),
        // a button sends only what it is; the API checks it was offered and writes the question itself
        pick: (choice: ProtonChoice) => submit(choice.label, { choice: { type: choice.type, id: choice.id } }),
        reply: (option: ProtonQuickReplyOption) => submit(option.label, { reply: option.reply }),
        suggest: (suggestion: string, index: number) => submit(suggestion, { suggestion: index }),
        stop: () => running.current?.abort(),
        startOver: () => {
            running.current?.abort();
            if (chat.conversationId) end.mutate(chat.conversationId);
            changeChat(() => emptyChat);
        },
    };
}
