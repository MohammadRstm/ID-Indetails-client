import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { resetProton } from "../protonStore";

const usage = { month: "2026-10-01", available: true, questionsAllowed: 300, questionsUsed: 3, questionsRemaining: 297, usedPct: 1, companyLimitReached: false };

const reply = (text: string) => ({
    conversationId: "c1", reply: text, refs: [], limited: false, usage, sources: [], uiCommands: [], choices: [], quickReplies: [],
    suggestions: [], pendingAction: null, rolledOver: false,
});

/** Proton switched on, with answers held back until the test lets them through. */
function proton(available = usage) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    return {
        release: () => release(),
        handlers: [
            http.get("/api/proton/usage", () => HttpResponse.json(available)),
            http.get("/api/proton/briefing", () => HttpResponse.json({ items: [], more: 0 })),
            http.post("/api/proton/messages", async () => {
                await gate;
                return HttpResponse.json(reply("Villa Mounir is active."));
            }),
        ],
    };
}

const blob = () => screen.findByRole("button", { name: /^Proton, / });
const stored = () => JSON.parse(localStorage.getItem("proton:blob") ?? "{}") as { side?: string; y?: number };

afterEach(() => {
    resetProton();
    sessionStorage.clear();
    localStorage.clear();
});

describe("Proton's blob", () => {
    it("says what it is doing, keeps answering after the panel closes, and shows what came in", async () => {
        const { handlers, release } = proton();
        renderApp("/design/help", personas.designAdmin, ...handlers);
        const user = userEvent.setup();
        await screen.findByRole("textbox", { name: "Search Help" });

        const button = await blob();
        expect(button).toHaveAccessibleName("Proton, ready");
        await user.click(button);
        const panel = await screen.findByRole("dialog", { name: "Proton" });
        expect(panel).toHaveAttribute("aria-modal", "false");
        expect(within(panel).getByRole("textbox", { name: "Ask Proton" })).toHaveFocus();

        await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), "How is Villa Mounir?{Enter}");
        expect(await blob()).toHaveAccessibleName("Proton, thinking");

        // Escape closes Proton only, and the keyboard goes back to the blob
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Proton" })).not.toBeInTheDocument();
        expect(await blob()).toHaveFocus();

        release();
        // the start of the reply peeks out beside the closed blob, and opens the chat
        expect(await screen.findByRole("button", { name: "Villa Mounir is active." })).toHaveClass("proton-peek-text");
        expect(await blob()).toHaveAccessibleName("Proton, answering");
        expect((await blob()).querySelector(".proton-unseen")).toHaveTextContent("1");

        await user.click(await blob());
        const again = await screen.findByRole("dialog", { name: "Proton" });
        expect(within(again).getByText("Villa Mounir is active.", { selector: ".msg-text" })).toBeInTheDocument();
        expect((await blob()).querySelector(".proton-unseen")).toBeNull();
    });

    it("moves where it is dropped without opening, and a click still opens it", async () => {
        renderApp("/design/help", personas.designAdmin, ...proton().handlers);
        const button = await blob();

        fireEvent.pointerDown(button, { button: 0, pointerId: 1, pointerType: "mouse", clientX: 900, clientY: 700 });
        fireEvent.pointerMove(button, { pointerId: 1, clientX: 600, clientY: 500 });
        fireEvent.pointerMove(button, { pointerId: 1, clientX: 20, clientY: 300 });
        fireEvent.pointerUp(button, { pointerId: 1, clientX: 20, clientY: 300 });
        fireEvent.click(button);

        expect(screen.queryByRole("dialog", { name: "Proton" })).not.toBeInTheDocument();
        expect(stored().side).toBe("left");

        // a press that doesn't move is a click
        fireEvent.pointerDown(button, { button: 0, pointerId: 2, pointerType: "mouse", clientX: 30, clientY: 300 });
        fireEvent.pointerUp(button, { pointerId: 2, clientX: 31, clientY: 301 });
        fireEvent.click(button);
        expect(await screen.findByRole("dialog", { name: "Proton" })).toBeInTheDocument();
    });

    it("moves with the arrow keys, Home and End, and from its menu", async () => {
        renderApp("/design/help", personas.designAdmin, ...proton().handlers);
        const user = userEvent.setup();
        const button = await blob();
        button.focus();

        await user.keyboard("{ArrowLeft}{Home}");
        expect(stored()).toMatchObject({ side: "left", y: 0 });
        await user.keyboard("{ArrowDown}{ArrowRight}");
        expect(stored()).toMatchObject({ side: "right", y: 0.05 });

        await user.click(button);
        const panel = await screen.findByRole("dialog", { name: "Proton" });
        await user.click(within(panel).getByRole("button", { name: "Proton options" }));
        await user.click(within(panel).getByRole("menuitem", { name: "Move to the left" }));
        expect(stored().side).toBe("left");
    });

    it("can be asked from the command palette", async () => {
        renderApp("/design/help", personas.designAdmin, ...proton().handlers,
            http.get("/api/search", () => HttpResponse.json({ projects: [], clients: [], people: [] })));
        const user = userEvent.setup();
        await blob();

        await user.click(screen.getByRole("button", { name: /Search projects/ }));
        await user.type(await screen.findByRole("textbox", { name: "Search" }), "ask proton");
        await user.click(await screen.findByRole("option", { name: /Ask Proton/ }));

        expect(await screen.findByRole("dialog", { name: "Proton" })).toBeInTheDocument();
    });

    it("rests when the month's budget is used, and isn't there when Proton is off", async () => {
        renderApp("/design/help", personas.designAdmin, ...proton({ ...usage, available: false, companyLimitReached: true }).handlers);
        expect(await blob()).toHaveAccessibleName("Proton, resting");
    });

    it("isn't there while Proton is switched off", async () => {
        renderApp("/design/help", personas.designAdmin);
        await screen.findByRole("textbox", { name: "Search Help" });
        await waitFor(() => expect(screen.queryByRole("button", { name: /^Proton, / })).not.toBeInTheDocument());
    });
});
