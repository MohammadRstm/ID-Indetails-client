import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef } from "react";
import { toApiError } from "@/api/errors";
import { fetchProtonChat, useRefreshChats, type AskBody, type ProtonChoice, type ProtonQuickReplyOption } from "./protonApi";
import { chatOf, emptyChat, type ProtonTurn } from "./protonChat";
import { parseBlocks } from "./protonFigures";
import { answered, asking, changeChat, currentChat, failed, heard, stopped, useProton, wrote } from "./protonStore";
import { streamQuestion } from "./protonStream";
import { startVoice, tellVoiceAnswer, type VoiceAnswer } from "./protonVoice";
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
    const refreshChats = useRefreshChats();
    const page = useProtonPageContext();
    const run = useRunProtonCommands();
    const { chat, askedAt } = useProton();
    const running = useRef<AbortController | null>(null);
    const settled = useRef<Promise<unknown>>(Promise.resolve());
    // a voice conversation asks long after the render that started it: it reads the page and the runner as they are now
    const latest = useRef({ page, run });
    useLayoutEffect(() => { latest.current = { page, run }; });

    const add = (...turns: ProtonTurn[]) => changeChat((c) => ({ ...c, turns: [...c.turns, ...turns] }));

    const send = async (conversationId: string | null, body: Ask, retried = false): Promise<VoiceAnswer> => {
        asking();
        const controller = new AbortController();
        running.current = controller;
        try {
            const reply = await streamQuestion({ conversationId, page: latest.current.page, ...body }, { onStatus: heard, onDelta: wrote }, controller.signal);
            queryClient.setQueryData(["proton", "usage"], reply.usage);
            const did = latest.current.run(reply.uiCommands);
            changeChat((c) => ({
                ...c,
                conversationId: reply.conversationId,
                turns: [
                    ...c.turns,
                    ...(reply.rolledOver ? [{ from: "note", text: ROLLED_OVER } as const] : []),
                    {
                        from: "proton", text: reply.reply, refs: reply.refs, sources: reply.sources, cards: reply.pendingActions,
                        choices: reply.choices, quickReplies: reply.quickReplies, suggestions: reply.suggestions, did, blocks: parseBlocks(reply.blocks),
                    },
                ],
            }));
            answered(reply.reply, did?.startsWith("Opened ") === true);
            // the answer was saved with the chat: the list of chats shows it
            refreshChats();
            return { kind: "answer", reply };
        } catch (error) {
            if (controller.signal.aborted) {
                stopped();
                add({ from: "note", text: STOPPED });
                return { kind: "replaced" };
            }

            const failure = toApiError(error);
            // a spoken question belongs to its voice session's conversation: it isn't asked again in a new one
            if (failure.code !== "proton_conversation_ended" || conversationId == null || body.voice) {
                failed();
                add({ from: "error", text: failure.message });
                return { kind: "failed", message: failure.message, code: failure.code };
            }

            // The server no longer has the chat: carry on in a new one. A typed question is simply asked again
            // there; a button belonged to the old chat, so the person asks again in their own words.
            changeChat((c) => ({ ...c, conversationId: null }));
            add({ from: "note", text: body.text && !retried ? failure.message : `${failure.message} Could you ask that again?` });
            if (body.text && !retried) return await send(null, { text: body.text }, true);
            failed();
            return { kind: "failed", message: failure.message, code: failure.code };
        } finally {
            if (running.current === controller) running.current = null;
        }
    };

    const pending = askedAt != null;
    const submit = (shown: string, body: Ask) => {
        if (pending || chat.locked) return;
        add({ from: "you", text: shown });
        const answer = send(chat.conversationId, body);
        settled.current = answer;
        // in a voice conversation, an answer to a button or a typed question is said aloud as well
        void answer.then((a) => tellVoiceAnswer(`The person ${body.text != null ? "typed" : "picked"} on screen: "${shown}". Proton answered on screen.`, a));
    };

    /**
     * A question the person said: it goes to the chat like a typed one. Said while an answer is still coming, it
     * replaces that answer (the person corrected or moved on), the same as pressing Stop.
     */
    const say = async (text: string, voice: { sessionId: string; delegationId: string }): Promise<VoiceAnswer> => {
        if (running.current) {
            running.current.abort();
            await settled.current;
        }

        add({ from: "you", text });
        const answer = send(currentChat().conversationId, { text, voice });
        settled.current = answer;
        return answer;
    };

    return {
        pending,
        question: (text: string) => submit(text, { text }),
        // a button sends only what it is; the API checks it was offered and writes the question itself
        pick: (choice: ProtonChoice) => submit(choice.label, { choice: { type: choice.type, id: choice.id } }),
        reply: (option: ProtonQuickReplyOption) => submit(option.label, { reply: option.reply }),
        suggest: (suggestion: string, index: number) => submit(suggestion, { suggestion: index }),
        stop: () => running.current?.abort(),
        talk: () => startVoice({
            conversationId: currentChat().conversationId,
            ask: say,
            onConversation: (conversationId) => changeChat((c) => (c.conversationId === conversationId ? c : { ...c, conversationId })),
        }),
        // a new chat; the one before stays among the saved chats
        startOver: () => {
            running.current?.abort();
            changeChat(() => emptyChat);
        },
        /** Shows a saved chat, to read and carry on. Rejects with the API's error when it can't be read. */
        open: async (id: string) => {
            if (currentChat().conversationId === id) return;
            const saved = await fetchProtonChat(id);
            running.current?.abort();
            changeChat(() => chatOf(saved));
        },
    };
}
