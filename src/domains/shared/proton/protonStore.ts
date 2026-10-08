import { useSyncExternalStore } from "react";
import { onSessionReset } from "@/app/session/sessionReset";
import { setAssistantOpen } from "@/shared/components/Overlays/assistantLayer";
import { talkDuration } from "./blob/talkPlan";
import { emptyChat, loadChat, saveChat, type ProtonChat } from "./protonChat";

/*
 * Proton lives outside any one page: this holds the chat, whether the panel is open, and what the blob is doing, and
 * <ProtonHost /> shows it. A reply that arrives after the panel was closed lands here, and the blob says so.
 */

export type ProtonState = {
    userId: number | null;
    chat: ProtonChat;
    open: boolean;
    /** When the question being answered was sent. */
    askedAt: number | null;
    /** The reply being said, for the blob's talking. */
    saying: { text: string; until: number } | null;
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
const PEEK_LENGTH = 90;

const initial: ProtonState = {
    userId: null, chat: emptyChat, open: false, askedAt: null, saying: null, errorUntil: 0, happyUntil: 0, unseen: 0, peek: null, navigations: 0,
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

export const asking = () => set({ askedAt: Date.now() });

/** A reply arrived: the blob says it, and if nobody is looking, it waits as unseen. */
export function answered(text: string, navigated: boolean) {
    const now = Date.now();
    set({
        askedAt: null,
        navigations: state.navigations + (navigated ? 1 : 0),
        saying: { text, until: now + talkDuration(text) },
        unseen: state.open ? 0 : state.unseen + 1,
        peek: state.open ? null : text.length > PEEK_LENGTH ? `${text.slice(0, PEEK_LENGTH).trimEnd()}…` : text,
    });
}

export const failed = () => set({ askedAt: null, errorUntil: Date.now() + ERROR_MS });

/** A confirmed change went through. */
export const celebrate = () => set({ happyUntil: Date.now() + HAPPY_MS });

export const dismissPeek = () => set({ peek: null });

/** The chat goes with the person. */
export function resetProton() {
    state = { ...initial };
    setAssistantOpen(false);
    listeners.forEach((l) => l());
}

onSessionReset(resetProton);
