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
    sources: [] as { label: string; period: string | null; comparedWith: string | null; partial: boolean; scope: string | null; omitted: string[] }[],
    uiCommands: [] as Record<string, unknown>[],
    choices: [] as { type: string; id: number; label: string; detail: string | null; domain: string | null }[],
    pendingAction,
});

// The page context the panel sends from the Help page.
const onHelp = { area: "design", page: null, entityType: null, entityId: null, section: null };

/** Proton's endpoints, recording what the panel sends. */
function protonHandlers(answers: ReturnType<typeof reply>[], confirmOpens: Record<string, unknown>[] = []) {
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
                    ? HttpResponse.json({ actionId: "a1", status: "succeeded", message: "Villa Mounir is now on hold.", refs: [], uiCommands: confirmOpens })
                    : HttpResponse.json({ actionId: "a1", status: "cancelled", message: "Cancelled. Nothing was changed.", refs: [], uiCommands: [] });
            }),
        ],
    };
}

async function openAndAsk(question: string) {
    const user = userEvent.setup();
    // the Help page focuses its own search box once it has loaded; wait for it, or it takes the keyboard mid-question
    await screen.findByRole("textbox", { name: "Search Help" });
    await user.click(await screen.findByRole("button", { name: "Ask Proton" }));
    const panel = await screen.findByRole("complementary", { name: "Proton" });
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
        expect(sent.questions).toEqual([{ conversationId: null, text: "How is Villa Mounir doing?", page: onHelp }]);
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
        expect(sent.questions[1]).toEqual({ conversationId: "c1", text: "yes", page: onHelp });

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

    it("show what an analytical answer is based on, and what it left out", async () => {
        const analysed = {
            ...reply("Hours rose 34%."),
            sources: [{
                label: "Hours compared", period: "1–7 Oct 2026", comparedWith: "1–7 Sep 2026", partial: true,
                scope: "all Design work", omitted: ["money: needs the financial:view permission"],
            }],
        };
        const { handlers } = protonHandlers([analysed]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { user, panel } = await openAndAsk("How did hours change?");

        const summary = await within(panel).findByText("Based on: Hours compared · 1–7 Oct 2026 (so far) vs 1–7 Sep 2026");
        await user.click(summary);
        expect(within(panel).getByText("Not included: money: needs the financial:view permission")).toBeInTheDocument();
    });

    it("open what Proton asks for beside the chat, and say so", async () => {
        const opening = {
            ...reply("Opening Villa Mounir's requirements."),
            uiCommands: [{ type: "open_project", label: "Villa Mounir", id: 42, domain: "design", section: "requirements", page: null, clientId: null, tab: null }],
        };
        const { handlers } = protonHandlers([opening]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { panel } = await openAndAsk("Take me to Villa Mounir's requirements");

        await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe("/design/projects/42?tab=requirements"));
        expect(await within(panel).findByText("Opened Villa Mounir.")).toBeInTheDocument();
        // no backdrop: the page stays in view and the chat stays open
        expect(document.querySelector(".drawer-scrim")).toBeNull();
        expect(screen.getByRole("complementary", { name: "Proton" })).toBeInTheDocument();
    });

    it("refuse commands it doesn't know or the person may not follow", async () => {
        const bad = {
            ...reply("Opening it."),
            uiCommands: [
                { type: "navigate_to_url", label: "x", id: null, domain: null, section: null, page: null, clientId: null, tab: null, url: "javascript:alert(1)" },
                { type: "open_project", label: "Site", id: 7, domain: "execution", section: null, page: null, clientId: null, tab: null },
            ],
        };
        const { handlers } = protonHandlers([bad]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { panel } = await openAndAsk("Open the site");

        expect(await within(panel).findByText("That couldn't be opened here.")).toBeInTheDocument();
        expect(window.location.pathname).toBe("/design/help");
    });

    it("offer matches as buttons, and send only the pick", async () => {
        const which = {
            ...reply("I found two. Which one do you mean?"),
            refs: [],
            choices: [
                { type: "project", id: 42, label: "Alpha House", detail: "Project · Design", domain: "design" },
                { type: "project", id: 43, label: "Alpha Tower", detail: "Project · Design", domain: "design" },
            ],
        };
        const { handlers, sent } = protonHandlers([which, reply("Opening Alpha Tower.")]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { user, panel } = await openAndAsk("Open Alpha");
        const options = await within(panel).findByRole("group", { name: "Options" });
        await user.click(within(options).getByRole("button", { name: /Alpha Tower/ }));

        expect(await within(panel).findByText("Opening Alpha Tower.")).toBeInTheDocument();
        expect(sent.questions[1]).toEqual({ conversationId: "c1", choice: { type: "project", id: 43 }, page: onHelp });
        // the options of an older reply can't be picked again
        expect(within(options).getByRole("button", { name: /Alpha House/ })).toBeDisabled();
    });

    it("open the result of a confirmed change when the card said so", async () => {
        const created = {
            ...action,
            tool: "propose_create_project",
            preview: { title: "Create a Design project", changes: [{ label: "Title", before: null, after: "Website Redesign" }], note: null, opensAfter: "the new project" },
        };
        const { handlers } = protonHandlers([reply("Shall I create it?", created as unknown as typeof action)],
            [{ type: "open_project", label: "Website Redesign", id: 77, domain: "design", section: null, page: null, clientId: null, tab: null }]);
        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { user, panel } = await openAndAsk("Create Website Redesign");

        const card = await within(panel).findByRole("group", { name: "Create a Design project" });
        expect(within(card).getByText("After you confirm, Hourline opens the new project.")).toBeInTheDocument();
        await user.click(within(card).getByRole("button", { name: "Confirm" }));

        await waitFor(() => expect(window.location.pathname).toBe("/design/projects/77"));
        expect(await within(card).findByText("Villa Mounir is now on hold. Opened Website Redesign.")).toBeInTheDocument();
    });

    it("isn't offered to employees", async () => {
        renderApp("/design/help", personas.designEmployee);
        await screen.findByRole("button", { name: "Help" });
        await waitFor(() => expect(screen.queryByRole("button", { name: "Ask Proton" })).not.toBeInTheDocument());
    });
});
