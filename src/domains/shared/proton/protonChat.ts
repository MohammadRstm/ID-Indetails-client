import { onSessionReset } from "@/app/session/sessionReset";
import type { ProtonChoice, ProtonPendingAction, ProtonQuickReplyOption, ProtonRef, ProtonSource } from "./protonApi";

/** Where a proposed change stands in the chat. Only "open" can still be confirmed. */
export type ActionState =
    | { kind: "open" }
    | { kind: "done"; message: string }
    | { kind: "cancelled" }
    | { kind: "failed"; message: string }
    /** Brought back after a reload: the card asks the API what became of it, and stays closed until it knows. */
    | { kind: "closed" }
    | { kind: "replaced" }
    | { kind: "expired" };

export type ProtonTurn =
    | { from: "you"; text: string }
    | {
        from: "proton";
        text: string;
        refs: ProtonRef[];
        sources: ProtonSource[];
        /** The changes proposed in this reply, each waiting for its own Confirm. */
        cards: ProtonPendingAction[];
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

/** The chat, kept in protonStore so closing the panel or changing page doesn't lose it. */
export type ProtonChat = {
    conversationId: string | null;
    turns: ProtonTurn[];
    actions: Record<string, ActionState>;
};

export const emptyChat: ProtonChat = { conversationId: null, turns: [], actions: {} };

/** The cards of the newest reply that proposed any. */
export function newestCards(chat: ProtonChat): ProtonPendingAction[] {
    const turn = chat.turns.findLast((t) => t.from === "proton" && t.cards.length > 0);
    return turn?.from === "proton" ? turn.cards : [];
}

/*
 * The visible chat survives a reload of the tab: it is kept in sessionStorage (this tab only) under the person's id,
 * and dropped when they sign out, their session ends, or someone else signs in. The server keeps the conversation
 * itself; when it no longer has it, the next question starts a new one.
 */
const PREFIX = "proton:chat:";

const keyOf = (userId: number) => `${PREFIX}${userId}`;

/** The person's chat as this tab last showed it. Cards that were still open come back closed until the API says otherwise. */
export function loadChat(userId: number): ProtonChat {
    try {
        const raw = sessionStorage.getItem(keyOf(userId));
        if (!raw) return emptyChat;
        const stored = JSON.parse(raw) as ProtonChat & { userId?: number };
        if (stored.userId !== userId || !Array.isArray(stored.turns)) return emptyChat;
        const actions = { ...stored.actions };
        // a chat kept before a reply could carry several cards had one "action"
        const turns = stored.turns.map((turn): ProtonTurn => {
            if (turn.from !== "proton" || Array.isArray(turn.cards)) return turn;
            const { action } = turn as unknown as { action?: ProtonPendingAction | null };
            return { ...turn, cards: action ? [action] : [] };
        });
        for (const turn of turns) {
            if (turn.from !== "proton") continue;
            for (const card of turn.cards) {
                if ((actions[card.id]?.kind ?? "open") === "open") actions[card.id] = { kind: "closed" };
            }
        }
        return { conversationId: stored.conversationId, turns, actions };
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
