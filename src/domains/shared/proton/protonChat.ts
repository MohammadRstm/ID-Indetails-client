import { onSessionReset } from "@/app/session/sessionReset";
import type { ProtonChoice, ProtonPendingAction, ProtonQuickReplyOption, ProtonRef, ProtonSavedChat, ProtonSource } from "./protonApi";
import { parseBlocks, type ProtonBlock } from "./protonFigures";

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
        /** Charts, tables and headline figures shown under the answer. */
        blocks: ProtonBlock[];
    }
    /** A quiet line from the app about the chat itself (a fresh start, a summary). */
    | { from: "note"; text: string }
    | { from: "error"; text: string };

/** The chat, kept in protonStore so closing the panel or changing page doesn't lose it. */
export type ProtonChat = {
    conversationId: string | null;
    turns: ProtonTurn[];
    actions: Record<string, ActionState>;
    /** A saved chat that can't be carried on (its owner's access changed since), and why: it is read, not continued. */
    locked?: string | null;
};

export const emptyChat: ProtonChat = { conversationId: null, turns: [], actions: {}, locked: null };

const CARD_STATES: Record<string, ActionState> = {
    succeeded: { kind: "done", message: "Done." },
    cancelled: { kind: "cancelled" },
    superseded: { kind: "replaced" },
    expired: { kind: "expired" },
};

/** A saved chat as the panel shows one: its messages as turns, and what became of each card. */
export function chatOf(saved: ProtonSavedChat): ProtonChat {
    const actions: Record<string, ActionState> = {};
    const turns = saved.messages.map((m): ProtonTurn => {
        if (m.role === "user") return { from: "you", text: m.text };
        for (const { card, status, message } of m.cards) {
            actions[card.id] = status === "pending" ? (saved.canContinue ? { kind: "open" } : { kind: "closed" })
                : status === "failed" ? { kind: "failed", message: message ?? "It couldn't be done." }
                : CARD_STATES[status] ?? { kind: "closed" };
        }
        return {
            from: "proton", text: m.text, refs: m.refs, sources: m.sources, cards: m.cards.map((c) => c.card),
            choices: [], quickReplies: [], suggestions: [], did: null, blocks: parseBlocks(m.blocks),
        };
    });
    const locked = saved.hidden ?? (saved.canContinue ? null : "Your access changed since this chat, so it can't be carried on. Start a new chat to ask more.");
    return { conversationId: saved.id, turns, actions, locked };
}

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
        // a chat kept before a reply could carry several cards had one "action"; blocks are checked again, as on arrival
        const turns = stored.turns.map((turn): ProtonTurn => {
            if (turn.from !== "proton") return turn;
            const { action } = turn as unknown as { action?: ProtonPendingAction | null };
            const cards = Array.isArray(turn.cards) ? turn.cards : action ? [action] : [];
            return { ...turn, cards, blocks: parseBlocks((turn as { blocks?: unknown }).blocks) };
        });
        for (const turn of turns) {
            if (turn.from !== "proton") continue;
            for (const card of turn.cards) {
                if ((actions[card.id]?.kind ?? "open") === "open") actions[card.id] = { kind: "closed" };
            }
        }
        return { conversationId: stored.conversationId, turns, actions, locked: stored.locked ?? null };
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
