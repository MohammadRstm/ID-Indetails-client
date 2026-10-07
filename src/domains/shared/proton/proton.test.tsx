import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const usage = { month: "2026-10-01", available: true, questionsAllowed: 300, questionsUsed: 3, questionsRemaining: 297, usedPct: 1, companyLimitReached: false };

const action = {
    id: "a1",
    tool: "propose_change_project_status",
    risk: "medium",
    preview: { title: "Put Villa Mounir on hold", changes: [{ label: "Status", before: "Active", after: "On hold" }], note: "The project's domain is notified." },
    expiresAt: "2099-01-01T00:00:00Z",
};

const reply = (text: string, pendingAction: typeof action | null = null) => ({
    conversationId: "c1",
    reply: text,
    refs: [{ type: "project", id: 42, name: "Villa Mounir", domain: "design" }],
    limited: false,
    usage: { ...usage, questionsUsed: 4, questionsRemaining: 296 },
    pendingAction,
});

/** Proton's endpoints, recording what the panel sends. */
function protonHandlers(answers: ReturnType<typeof reply>[]) {
    const sent = { questions: [] as unknown[], decisions: [] as { path: string; body: unknown }[] };
    return {
        sent,
        handlers: [
            http.get("/api/proton/usage", () => HttpResponse.json(usage)),
            http.post("/api/proton/messages", async ({ request }) => {
                sent.questions.push(await request.json());
                return HttpResponse.json(answers.shift() ?? reply("Nothing more to say."));
            }),
            http.post("/api/proton/actions/:id/:decision", async ({ request, params }) => {
                sent.decisions.push({ path: `${params.id}/${params.decision}`, body: await request.json() });
                return params.decision === "confirm"
                    ? HttpResponse.json({ actionId: "a1", status: "succeeded", message: "Villa Mounir is now on hold.", refs: [] })
                    : HttpResponse.json({ actionId: "a1", status: "cancelled", message: "Cancelled. Nothing was changed.", refs: [] });
            }),
        ],
    };
}

async function openAndAsk(question: string) {
    const user = userEvent.setup();
    // the Help page focuses its own search box once it has loaded; wait for it, or it takes the keyboard mid-question
    await screen.findByRole("textbox", { name: "Search Help" });
    await user.click(await screen.findByRole("button", { name: "Ask Proton" }));
    const panel = await screen.findByRole("dialog", { name: "Proton" });
    await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), question);
    await user.click(within(panel).getByRole("button", { name: "Send" }));
    return { user, panel };
}

describe("Proton", () => {
    it("answer a question with links to what it is about, and show the allowance, never money", async () => {
        const { handlers, sent } = protonHandlers([reply("Villa Mounir is active and 60% done.")]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { panel } = await openAndAsk("How is Villa Mounir doing?");

        expect(await within(panel).findByText("Villa Mounir is active and 60% done.")).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: "Villa Mounir" })).toHaveAttribute("href", "/design/projects/42");
        expect(within(panel).getByText("296 of 300 questions left this month")).toBeInTheDocument();
        expect(sent.questions).toEqual([{ conversationId: null, text: "How is Villa Mounir doing?" }]);
    });

    it("carry out a proposed change only on Confirm, sending nothing but its id and conversation", async () => {
        const { handlers, sent } = protonHandlers([reply("I can put it on hold. Please confirm.", action), reply("Okay.")]);
        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { user, panel } = await openAndAsk("Put Villa Mounir on hold");

        const card = await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });
        expect(within(card).getByText("Medium risk")).toBeInTheDocument();
        expect(within(card).getByText("Active")).toBeInTheDocument();

        // typing "yes" is just another question: it confirms nothing
        await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), "yes");
        await user.click(within(panel).getByRole("button", { name: "Send" }));
        await within(panel).findByText("Okay.");
        expect(sent.decisions).toEqual([]);
        expect(sent.questions[1]).toEqual({ conversationId: "c1", text: "yes" });

        await user.click(within(card).getByRole("button", { name: "Confirm" }));
        expect(await within(card).findByText("Villa Mounir is now on hold.")).toBeInTheDocument();
        expect(sent.decisions).toEqual([{ path: "a1/confirm", body: { conversationId: "c1" } }]);
        expect(within(card).queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    });

    it("cancel a proposal, and show the API's reason when a confirmation is refused", async () => {
        const { handlers, sent } = protonHandlers([reply("Ready when you are.", action)]);
        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { user, panel } = await openAndAsk("Put Villa Mounir on hold");
        const card = await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });

        await user.click(within(card).getByRole("button", { name: "Cancel" }));
        expect(await within(card).findByText("Cancelled. Nothing was changed.")).toBeInTheDocument();
        expect(sent.decisions.map((d) => d.path)).toEqual(["a1/cancel"]);
    });

    it("say why a confirmed change didn't happen", async () => {
        const { handlers } = protonHandlers([reply("Ready when you are.", action)]);
        // listed first, so it answers before the default confirmation
        renderApp("/design/help", personas.superAdmin,
            http.post("/api/proton/actions/:id/confirm", () => HttpResponse.json(
                { type: "business_rule", code: "status_unchanged", message: "The project is already on hold.", errors: null, traceId: "t" }, { status: 422 })),
            ...handlers);
        const { user, panel } = await openAndAsk("Put Villa Mounir on hold");
        const card = await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });

        await user.click(within(card).getByRole("button", { name: "Confirm" }));
        expect(await within(card).findByText("The project is already on hold.")).toBeInTheDocument();
    });

    it("isn't offered to employees", async () => {
        renderApp("/design/help", personas.designEmployee);
        await screen.findByRole("button", { name: "Help" });
        await waitFor(() => expect(screen.queryByRole("button", { name: "Ask Proton" })).not.toBeInTheDocument());
    });
});
