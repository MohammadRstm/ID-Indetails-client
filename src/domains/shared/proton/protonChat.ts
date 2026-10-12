import type { ProtonChoice, ProtonPendingAction, ProtonRef, ProtonSource } from "./protonApi";

/** Where a proposed change stands in the chat. Only "open" can still be confirmed. */
export type ActionState =
    | { kind: "open" }
    | { kind: "done"; message: string }
    | { kind: "cancelled" }
    | { kind: "failed"; message: string };

export type ProtonTurn =
    | { from: "you"; text: string }
    | {
        from: "proton";
        text: string;
        refs: ProtonRef[];
        sources: ProtonSource[];
        action: ProtonPendingAction | null;
        /** Options to pick from; only the newest reply's can still be picked. */
        choices: ProtonChoice[];
        /** What the app did for this reply ("Opened Villa Mounir."), if anything. */
        did: string | null;
    }
    | { from: "error"; text: string };

/** The chat, kept by its owner (the top bar) so closing the panel doesn't lose it. */
export type ProtonChat = {
    conversationId: string | null;
    turns: ProtonTurn[];
    actions: Record<string, ActionState>;
};

export const emptyChat: ProtonChat = { conversationId: null, turns: [], actions: {} };
