import { afterEach, describe, expect, it } from "vitest";
import { resetSessionState } from "@/app/session/sessionReset";
import { clearChats, emptyChat, loadChat, saveChat, type ProtonChat } from "./protonChat";

const action = {
    id: "a1", tool: "propose_change_project_status", risk: "medium" as const, expiresAt: "2099-01-01T00:00:00Z",
    preview: { title: "Put Alpha on hold", changes: [], note: null, opensAfter: null },
};

const chat: ProtonChat = {
    conversationId: "c1",
    turns: [
        { from: "you", text: "Put Alpha on hold" },
        { from: "proton", text: "Confirm it on the card.", refs: [], sources: [], action, choices: [], quickReplies: [], suggestions: [], did: null },
    ],
    actions: {},
};

// the chat is kept in session storage: each test starts in a fresh tab
afterEach(() => sessionStorage.clear());

describe("Proton's kept chat", () => {
    it("comes back for the same person only, with cards that were still open closed", () => {
        saveChat(2, chat);

        const back = loadChat(2);
        expect(back.turns).toEqual(chat.turns);
        expect(back.conversationId).toBe("c1");
        expect(back.actions).toEqual({ a1: { kind: "closed" } });
        expect(loadChat(3)).toEqual(emptyChat);
    });

    it("keeps a decided card as it was", () => {
        saveChat(2, { ...chat, actions: { a1: { kind: "done", message: "Alpha is on hold." } } });
        expect(loadChat(2).actions).toEqual({ a1: { kind: "done", message: "Alpha is on hold." } });
    });

    it("is dropped when the session resets, and an empty chat isn't kept", () => {
        saveChat(2, chat);
        resetSessionState();
        expect(loadChat(2)).toEqual(emptyChat);

        saveChat(2, chat);
        saveChat(2, emptyChat);
        expect(sessionStorage.getItem("proton:chat:2")).toBeNull();
        clearChats();
    });

    it("ignores what it can't read", () => {
        sessionStorage.setItem("proton:chat:2", "{not json");
        expect(loadChat(2)).toEqual(emptyChat);
        sessionStorage.setItem("proton:chat:2", JSON.stringify({ ...chat, userId: 9 }));
        expect(loadChat(2)).toEqual(emptyChat);
    });
});
