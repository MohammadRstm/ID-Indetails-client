import { useSyncExternalStore } from "react";
import { onSessionReset } from "@/app/session/sessionReset";
import { setAssistantOpen } from "@/shared/components/Overlays/assistantLayer";
import { emptyChat, loadChat, saveChat, type ProtonChat } from "./protonChat";

/*
 * Proton lives outside any one page: this holds the chat, whether the panel is open, the answer being written, and
 * what the blob is doing, and <ProtonHost /> shows it. A reply that arrives after the panel was closed lands here,
 * and the blob says so.
 */

export type ProtonState = {
    userId: number | null;
    chat: ProtonChat;
    open: boolean;
    /** When the question being answered was sent. */
    askedAt: number | null;
    /** What Proton is doing for it, in the server's words ("Comparing the hours…"). */
    status: string | null;
    /** The answer as it is being written, by the model call writing it: a later call's text replaces an earlier one's. */
    draft: { trip: number; text: string } | null;
    /** The blob talks while text is arriving, and a moment after. */
    talkingUntil: number;
    /** How loudly: more text in one go, a bigger breath. */
    voice: number;
    /** The newest reply, read out to screen readers once it is in. */
    announce: string | null;
    errorUntil: number;
    happyUntil: number;
    /** Replies that arrived while the panel was closed. */
    unseen: number;
    /** The start of the newest unseen reply, shown beside the closed blob for a moment. */
    peek: string | null;
    /** How many replies opened a page: on a phone the sheet folds down after one, to show the page. */
    navigations: number;
};

const ERROR_MS = 3_000;
const HAPPY_MS = 2_500;
/** A pause in the text longer than this, and the blob stops talking. */
const TALK_TAIL_MS = 450;
const PEEK_LENGTH = 90;

const initial: ProtonState = {
    userId: null, chat: emptyChat, open: false, askedAt: null, status: null, draft: null, talkingUntil: 0, voice: 0, announce: null,
    errorUntil: 0, happyUntil: 0, unseen: 0, peek: null, navigations: 0,
};

let state = initial;
const listeners = new Set<() => void>();

function set(next: Partial<ProtonState>) {
    const chatChanged = next.chat !== undefined && next.chat !== state.chat;
    state = { ...state, ...next };
    if (chatChanged && state.userId != null) saveChat(state.userId, state.chat);
    if (next.open !== undefined) setAssistantOpen(state.open);
    listeners.forEach((l) => l());
}

export function useProton(): ProtonState {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => state,
    );
}

/** The chat belongs to the person signed in: someone else starts from their own. */
export function startFor(userId: number) {
    if (state.userId === userId) return;
    state = { ...initial, userId, chat: loadChat(userId) };
    setAssistantOpen(false);
    listeners.forEach((l) => l());
}

export const openProton = () => set({ open: true, unseen: 0, peek: null });
export const closeProton = () => set({ open: false });
export const toggleProton = () => (state.open ? closeProton() : openProton());

export const changeChat = (update: (chat: ProtonChat) => ProtonChat) => set({ chat: update(state.chat) });

/** The chat as it is now, for work that outlives a render (a voice conversation). */
export const currentChat = () => state.chat;

export const asking = () => set({ askedAt: Date.now(), status: null, draft: null });

export const heard = (status: string) => set({ status });

/** A piece of the answer arrived: the blob talks, a little louder for a bigger piece. */
export function wrote(trip: number, text: string) {
    const draft = state.draft?.trip === trip ? { trip, text: state.draft.text + text } : { trip, text };
    set({ draft, talkingUntil: Date.now() + TALK_TAIL_MS, voice: Math.min(1, Math.max(0.3, text.length / 24)) });
}

/** The reply is in: if nobody is looking, it waits as unseen. */
export function answered(text: string, navigated: boolean) {
    set({
        askedAt: null,
        status: null,
        draft: null,
        announce: text,
        talkingUntil: Date.now() + TALK_TAIL_MS,
        navigations: state.navigations + (navigated ? 1 : 0),
        unseen: state.open ? 0 : state.unseen + 1,
        peek: state.open ? null : text.length > PEEK_LENGTH ? `${text.slice(0, PEEK_LENGTH).trimEnd()}…` : text,
    });
}

export const failed = () => set({ askedAt: null, status: null, draft: null, errorUntil: Date.now() + ERROR_MS });

/** The person stopped the answer: nothing of it is kept. */
export const stopped = () => set({ askedAt: null, status: null, draft: null, talkingUntil: 0 });

/*
 * How loudly the voice model speaks, read by the blob's animation each frame. Kept out of the store's state: it
 * changes every frame while the voice speaks, and nothing on screen but the blob's mouth depends on it.
 */
let speech = { until: 0, level: 0 };

/** The voice model is speaking this loudly: the blob's mouth follows it, without re-rendering anything. */
export const spoke = (level: number) => {
    speech = { until: Date.now() + 150, level: Math.min(1, Math.max(0.3, level)) };
};

/** A confirmed change went through. */
export const celebrate = () => set({ happyUntil: Date.now() + HAPPY_MS });

export const dismissPeek = () => set({ peek: null });

/** How loudly the blob talks at `now`, read by its animation each frame: the voice speaking, or text arriving. */
export const voiceAt = (now: number) => (now < speech.until ? speech.level : now < state.talkingUntil ? state.voice : 0);

/** The chat goes with the person. */
export function resetProton() {
    state = { ...initial };
    setAssistantOpen(false);
    listeners.forEach((l) => l());
}

onSessionReset(resetProton);
