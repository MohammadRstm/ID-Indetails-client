import { onSessionReset } from "@/app/session/sessionReset";
import type { ProtonChoice, ProtonPendingAction, ProtonQuickReplyOption, ProtonRef, ProtonSource } from "./protonApi";

/** Where a proposed change stands in the chat. Only "open" can still be confirmed. */
export type ActionState =
    | { kind: "open" }
    | { kind: "done"; message: string }
    | { kind: "cancelled" }
    | { kind: "failed"; message: string }
    /** Brought back after a reload: its status isn't known here, so it can't be confirmed from this card. */
    | { kind: "closed" };

export type ProtonTurn =
    | { from: "you"; text: string }
    | {
        from: "proton";
        text: string;
        refs: ProtonRef[];
        sources: ProtonSource[];
        action: ProtonPendingAction | null;
        /** Options to pick from; only the newest reply's can still be picked, and so for the replies below. */
        choices: ProtonChoice[];
        quickReplies: ProtonQuickReplyOption[];
        suggestions: string[];
        /** What the app did for this reply ("Opened Villa Mounir."), if anything. */
        did: string | null;
    }
    /** A quiet line from the app about the chat itself (a fresh start, a summary). */
    | { from: "note"; text: string }
    | { from: "error"; text: string };

/** The chat, kept by its owner (the top bar) so closing the panel doesn't lose it. */
export type ProtonChat = {
    conversationId: string | null;
    turns: ProtonTurn[];
    actions: Record<string, ActionState>;
};

export const emptyChat: ProtonChat = { conversationId: null, turns: [], actions: {} };

/*
 * The visible chat survives a reload of the tab: it is kept in sessionStorage (this tab only) under the person's id,
 * and dropped when they sign out, their session ends, or someone else signs in. The server keeps the conversation
 * itself; when it no longer has it, the next question starts a new one.
 */
const PREFIX = "proton:chat:";

const keyOf = (userId: number) => `${PREFIX}${userId}`;

/** The person's chat as this tab last showed it. Cards that were still open come back closed: their status isn't known here. */
export function loadChat(userId: number): ProtonChat {
    try {
        const raw = sessionStorage.getItem(keyOf(userId));
        if (!raw) return emptyChat;
        const stored = JSON.parse(raw) as ProtonChat & { userId?: number };
        if (stored.userId !== userId || !Array.isArray(stored.turns)) return emptyChat;
        const actions = { ...stored.actions };
        for (const turn of stored.turns) {
            if (turn.from === "proton" && turn.action && (actions[turn.action.id]?.kind ?? "open") === "open") {
                actions[turn.action.id] = { kind: "closed" };
            }
        }
        return { conversationId: stored.conversationId, turns: stored.turns, actions };
    } catch {
        return emptyChat;
    }
}

export function saveChat(userId: number, chat: ProtonChat) {
    try {
        if (chat.turns.length === 0) sessionStorage.removeItem(keyOf(userId));
        else sessionStorage.setItem(keyOf(userId), JSON.stringify({ ...chat, userId }));
    } catch {
        // storage full or blocked: the chat still works, it just won't survive a reload
    }
}

export function clearChats() {
    try {
        for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
        }
    } catch {
        // nothing stored, nothing to clear
    }
}

onSessionReset(clearChats);
