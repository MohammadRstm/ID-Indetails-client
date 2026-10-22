import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { resetSessionState } from "@/app/session/sessionReset";
import { currentChat, resetProton } from "./protonStore";
import { liveReply, sseError, sseReply } from "./protonTesting";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const usage = { month: "2026-10-01", available: true, questionsAllowed: 300, questionsUsed: 3, questionsRemaining: 297, usedPct: 1, companyLimitReached: false };

const action = {
    id: "a1",
    tool: "propose_change_project_status",
    risk: "medium",
    target: { type: "project", id: 42, name: "Villa Mounir", domain: "design" } as { type: string; id: number; name: string; domain: string | null } | null,
    preview: {
        title: "Put Villa Mounir on hold", changes: [{ label: "Status", before: "Active" as string | null, after: "On hold" }], note: "The project's domain is notified." as string | null,
        opensAfter: null as string | null, confirm: "standard", phrase: null as string | null, area: "design" as string | null, irreversible: false, reach: null as string | null,
    },
    expiresAt: "2099-01-01T00:00:00Z",
};

const reply = (text: string, cards: typeof action | (typeof action)[] | null = null) => ({
    conversationId: "c1",
    reply: text,
    refs: [{ type: "project", id: 42, name: "Villa Mounir", domain: "design" }],
    limited: false,
    usage: { ...usage, questionsUsed: 4, questionsRemaining: 296 },
    sources: [] as { label: string; period: string | null; comparedWith: string | null; partial: boolean; scope: string | null; omitted: string[] }[],
    uiCommands: [] as Record<string, unknown>[],
    choices: [] as { type: string; id: number; label: string; detail: string | null; domain: string | null }[],
    quickReplies: [] as { reply: string; label: string }[],
    suggestions: [] as string[],
    pendingActions: cards == null ? [] : Array.isArray(cards) ? cards : [cards],
    pendingAction: cards == null ? null : Array.isArray(cards) ? cards.at(-1) ?? null : cards,
    rolledOver: false,
});

const noBriefing = { items: [] as unknown[], more: 0 };

// The page context the panel sends from the Help page.
const onHelp = { area: "design", page: "help", entityType: null, entityId: null, section: null, surface: null };

/** Proton's endpoints, recording what the panel sends. */
function protonHandlers(answers: ReturnType<typeof reply>[], confirmOpens: Record<string, unknown>[] = [], briefing = noBriefing, statuses: unknown[] = []) {
    const sent = { questions: [] as unknown[], decisions: [] as { path: string; body: unknown }[] };
    return {
        sent,
        handlers: [
            http.get("/api/proton/usage", () => HttpResponse.json(usage)),
            http.get("/api/proton/briefing", () => HttpResponse.json(briefing)),
            http.get("/api/proton/actions", () => HttpResponse.json(statuses)),
            http.post("/api/proton/messages/stream", async ({ request }) => {
                sent.questions.push(await request.json());
                return sseReply(answers.shift() ?? reply("Nothing more to say."));
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

async function openPanel() {
    const user = userEvent.setup();
    // the Help page focuses its own search box once it has loaded; wait for it, or it takes the keyboard mid-question
    await screen.findByRole("textbox", { name: "Search Help" });
    await user.click(await screen.findByRole("button", { name: /^Proton, / }));
    return { user, panel: await screen.findByRole("dialog", { name: "Proton" }) };
}

const ended = { type: "not_found", code: "proton_conversation_ended", message: "I no longer have our earlier chat, so we're starting fresh.", errors: null, traceId: "t" };

async function openAndAsk(question: string) {
    const { user, panel } = await openPanel();
    await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), question);
    await user.click(within(panel).getByRole("button", { name: "Send" }));
    return { user, panel };
}

// Proton keeps its chat outside the page and in session storage, and the blob's place in local storage: each test
// starts in a fresh tab
afterEach(() => {
    resetProton();
    sessionStorage.clear();
    localStorage.clear();
});

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

    it("keep several cards open, and close only the one a newer proposal for the same change replaced", async () => {
        const second = { ...action, id: "a2", tool: "propose_add_requirement", preview: { ...action.preview, title: "Add a requirement to Villa Mounir" } };
        const revised = { ...action, id: "a3", preview: { ...action.preview, title: "Put Villa Mounir on hold until May" } };
        const { handlers } = protonHandlers([reply("Two changes to confirm.", [action, second]), reply("Changed it.", revised)]);
        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { user, panel } = await openAndAsk("Put it on hold and add a requirement");

        const hold = await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });
        const requirement = within(panel).getByRole("group", { name: "Add a requirement to Villa Mounir" });
        expect(within(hold).getByRole("button", { name: "Confirm" })).toBeEnabled();
        expect(within(requirement).getByRole("button", { name: "Confirm" })).toBeEnabled();

        await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), "Make the hold until May");
        await user.click(within(panel).getByRole("button", { name: "Send" }));
        await within(panel).findByRole("group", { name: "Put Villa Mounir on hold until May" });
        expect(within(hold).getByText("Replaced by a newer proposal.")).toBeInTheDocument();
        expect(within(requirement).getByRole("button", { name: "Confirm" })).toBeEnabled();
    });

    it("ask for a review first on a strong change, and for the phrase where the card asks for one", async () => {
        const strong = { ...action, preview: { ...action.preview, confirm: "two_step", irreversible: true } };
        const typed = { ...action, id: "a2", tool: "propose_archive_project", preview: { ...action.preview, title: "Archive Villa Mounir", confirm: "typed", phrase: "Villa Mounir" } };
        const { handlers, sent } = protonHandlers([reply("Two changes to confirm.", [strong, typed])]);
        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { user, panel } = await openAndAsk("Put it on hold and archive it");

        const hold = await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });
        expect(within(hold).getByText("Check carefully")).toBeInTheDocument();
        expect(within(hold).getByText("This can't be undone.")).toBeInTheDocument();
        expect(within(hold).queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
        await user.click(within(hold).getByRole("button", { name: "Review" }));
        // armed a moment later, so a double click can't pass both steps
        expect(within(hold).getByRole("button", { name: "Confirm" })).toBeDisabled();
        await waitFor(() => expect(within(hold).getByRole("button", { name: "Confirm" })).toBeEnabled());

        const archive = within(panel).getByRole("group", { name: "Archive Villa Mounir" });
        const confirm = within(archive).getByRole("button", { name: "Confirm" });
        expect(confirm).toBeDisabled();
        await user.type(within(archive).getByLabelText(/to confirm/), "villa mounir");
        await user.click(confirm);
        await within(archive).findByText("Villa Mounir is now on hold.");
        expect(sent.decisions).toEqual([{ path: "a2/confirm", body: { conversationId: "c1", typed: "villa mounir" } }]);
    });

    it("bring back a card that is still waiting after a reload, and say what became of one that isn't", async () => {
        const second = { ...action, id: "a2", tool: "propose_add_requirement", preview: { ...action.preview, title: "Add a requirement to Villa Mounir" } };
        const statuses = [
            { id: "a1", tool: action.tool, title: "Put Villa Mounir on hold", status: "pending", createdAt: "2026-10-08T09:00:00Z", decidedAt: null, resultType: null, resultId: null, errorMessage: null, who: null },
            { id: "a2", tool: second.tool, title: "Add a requirement to Villa Mounir", status: "succeeded", createdAt: "2026-10-08T09:00:00Z", decidedAt: "2026-10-08T09:01:00Z", resultType: "requirement", resultId: 5, errorMessage: null, who: null },
        ];
        const { handlers } = protonHandlers([reply("Two changes to confirm.", [action, second])], [], noBriefing, statuses);
        const first = renderApp("/design/help", personas.superAdmin, ...handlers);
        const { panel } = await openAndAsk("Put it on hold and add a requirement");
        await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });
        first.unmount();
        resetProton();

        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { panel: again } = await openPanel();
        const hold = within(again).getByRole("group", { name: "Put Villa Mounir on hold" });
        expect(await within(hold).findByRole("button", { name: "Confirm" })).toBeEnabled();
        expect(within(within(again).getByRole("group", { name: "Add a requirement to Villa Mounir" })).getByText("Done.")).toBeInTheDocument();
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
        expect(screen.getByRole("dialog", { name: "Proton" })).toBeInTheDocument();
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
            target: null,
            preview: { ...action.preview, title: "Create a Design project", changes: [{ label: "Title", before: null, after: "Website Redesign" }], note: null, opensAfter: "the new project" },
        };
        const { handlers } = protonHandlers([reply("Shall I create it?", created)],
            [{ type: "open_project", label: "Website Redesign", id: 77, domain: "design", section: null, page: null, clientId: null, tab: null }]);
        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { user, panel } = await openAndAsk("Create Website Redesign");

        const card = await within(panel).findByRole("group", { name: "Create a Design project" });
        expect(within(card).getByText("After you confirm, I'll open the new project.")).toBeInTheDocument();
        await user.click(within(card).getByRole("button", { name: "Confirm" }));

        await waitFor(() => expect(window.location.pathname).toBe("/design/projects/77"));
        expect(await within(card).findByText("Villa Mounir is now on hold. Opened Website Redesign.")).toBeInTheDocument();
    });

    it("greet the person by name, brief them without asking the model, and offer ways to start", async () => {
        const briefing = {
            items: [{
                project: { type: "project", id: 42, name: "Villa Mounir", domain: "design" }, domain: "design",
                facts: ["target date passed 6 days ago (2 Oct 2026)", "2 open requirements are overdue"],
            }],
            more: 2,
        };
        const { handlers, sent } = protonHandlers([reply("Here's what needs attention.")], [], briefing);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { user, panel } = await openPanel();

        expect(await within(panel).findByText(/^Good (morning|afternoon|evening), Nadia\. A few things you may want to look at:$/)).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: "Villa Mounir" })).toHaveAttribute("href", "/design/projects/42");
        expect(within(panel).getByText(/target date passed 6 days ago/)).toBeInTheDocument();
        expect(within(panel).getByText("There are 2 more. Ask me what needs your attention.")).toBeInTheDocument();
        expect(sent.questions).toEqual([]);

        const starts = within(panel).getByRole("group", { name: "Ways to start" });
        await user.click(within(starts).getByRole("button", { name: "What needs my attention?" }));
        expect(await within(panel).findByText("Here's what needs attention.")).toBeInTheDocument();
        expect(sent.questions).toEqual([{ conversationId: null, text: "What needs my attention?", page: onHelp }]);
    });

    it("answer with a quick reply or a suggestion, sending only what the button is", async () => {
        const asking = { ...reply("Which period?"), refs: [], quickReplies: [{ reply: "this_month", label: "This month" }, { reply: "last_month", label: "Last month" }] };
        const suggesting = { ...reply("Last month had 120.0 h."), refs: [], suggestions: ["Compare with the month before", "Open the reports"] };
        const { handlers, sent } = protonHandlers([asking, suggesting, { ...reply("The month before had 98.0 h."), refs: [] }]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { user, panel } = await openAndAsk("How many hours?");
        const options = await within(panel).findByRole("group", { name: "Options" });
        await user.click(within(options).getByRole("button", { name: "Last month" }));
        const suggested = await within(panel).findByRole("group", { name: "Suggested replies" });
        await user.click(within(suggested).getByRole("button", { name: "Compare with the month before" }));

        expect(await within(panel).findByText("The month before had 98.0 h.")).toBeInTheDocument();
        expect(sent.questions.slice(1)).toEqual([
            { conversationId: "c1", reply: "last_month", page: onHelp },
            { conversationId: "c1", suggestion: 0, page: onHelp },
        ]);
        // what was tapped shows as the person's own message, and only the newest reply offers suggestions
        expect(within(panel).getByText("Compare with the month before", { selector: ".msg-text" })).toBeInTheDocument();
        expect(within(panel).queryByRole("group", { name: "Suggested replies" })).not.toBeInTheDocument();
    });

    it("carry on in a new conversation when the server no longer has the old one, and say so", async () => {
        const bodies: unknown[] = [];
        const answers = [reply("Hello!"), null, { ...reply("Villa Mounir is active."), conversationId: "c2" }];
        const { handlers } = protonHandlers([]);
        renderApp("/design/help", personas.designAdmin,
            http.post("/api/proton/messages/stream", async ({ request }) => {
                bodies.push(await request.json());
                const next = answers.shift();
                return next ? sseReply(next) : HttpResponse.json(ended, { status: 404 });
            }),
            ...handlers);

        const { user, panel } = await openAndAsk("Hi");
        await within(panel).findByText("Hello!");
        await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), "How is Villa Mounir?");
        await user.click(within(panel).getByRole("button", { name: "Send" }));

        expect(await within(panel).findByText("Villa Mounir is active.")).toBeInTheDocument();
        expect(within(panel).getByText("I no longer have our earlier chat, so we're starting fresh.")).toBeInTheDocument();
        expect(within(panel).getAllByText("How is Villa Mounir?")).toHaveLength(1);
        expect(bodies).toEqual([
            { conversationId: null, text: "Hi", page: onHelp },
            { conversationId: "c1", text: "How is Villa Mounir?", page: onHelp },
            { conversationId: null, text: "How is Villa Mounir?", page: onHelp },
        ]);
    });

    it("say when a long chat carried on from a summary", async () => {
        const { handlers } = protonHandlers([{ ...reply("Still with you."), rolledOver: true }]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { panel } = await openAndAsk("And the month before?");

        expect(await within(panel).findByText("Our chat was getting long, so I kept a short summary of it and carried on.")).toBeInTheDocument();
    });

    it("keep the chat through a reload with open cards closed, and forget it on sign-out", async () => {
        const { handlers } = protonHandlers([reply("I can put it on hold. Please confirm.", action)]);
        const first = renderApp("/design/help", personas.superAdmin, ...handlers);
        const { panel } = await openAndAsk("Put Villa Mounir on hold");
        await within(panel).findByRole("group", { name: "Put Villa Mounir on hold" });
        first.unmount();
        // a reload: nothing is left in memory, only what the tab stored
        resetProton();

        renderApp("/design/help", personas.superAdmin, ...handlers);
        const { panel: again } = await openPanel();

        expect(within(again).getByText("Put Villa Mounir on hold", { selector: ".msg-text" })).toBeInTheDocument();
        const card = within(again).getByRole("group", { name: "Put Villa Mounir on hold" });
        expect(within(card).queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
        expect(within(card).getByText("This card closed when the page reloaded. Ask me again if you still want it.")).toBeInTheDocument();

        resetSessionState();
        expect(Object.keys(sessionStorage).filter((key) => key.startsWith("proton:"))).toEqual([]);
    });

    it("write the answer as it arrives, say what it is doing, and replace what an earlier step wrote", async () => {
        const live = liveReply();
        const { handlers } = protonHandlers([]);
        renderApp("/design/help", personas.designAdmin, http.post("/api/proton/messages/stream", () => live.response()), ...handlers);

        const { panel } = await openAndAsk("How did hours change?");
        live.send("status", { text: "Comparing the hours…" });
        expect(await within(panel).findByText("Comparing the hours…")).toBeInTheDocument();

        live.send("delta", { trip: 1, text: "Let me check." });
        expect(await within(panel).findByText("Let me check.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Proton, / })).toHaveAccessibleName("Proton, answering");

        // the next step's text replaces the first's
        live.send("delta", { trip: 2, text: "Hours rose " });
        live.send("delta", { trip: 2, text: "34%." });
        expect(await within(panel).findByText("Hours rose 34%.")).toBeInTheDocument();
        expect(within(panel).queryByText("Let me check.")).not.toBeInTheDocument();

        live.finish({ ...reply("Hours rose 34% on last week."), refs: [] });
        expect(await within(panel).findByText("Hours rose 34% on last week.")).toBeInTheDocument();
        expect(within(panel).queryByText("Hours rose 34%.")).not.toBeInTheDocument();
        expect(within(panel).queryByText("Comparing the hours…")).not.toBeInTheDocument();
    });

    it("stop an answer half-way, keeping nothing of it", async () => {
        const live = liveReply();
        const { handlers } = protonHandlers([]);
        renderApp("/design/help", personas.designAdmin, http.post("/api/proton/messages/stream", () => live.response()), ...handlers);

        const { user, panel } = await openAndAsk("Summarise the month");
        live.send("delta", { trip: 1, text: "This month, " });
        await within(panel).findByText("This month,");
        await user.click(within(panel).getByRole("button", { name: "Stop" }));

        expect(await within(panel).findByText("Stopped. Nothing from that answer was kept.")).toBeInTheDocument();
        expect(within(panel).queryByText("This month,")).not.toBeInTheDocument();
        expect(within(panel).getByRole("button", { name: "Send" })).toBeInTheDocument();
        expect(panel.querySelector(".proton-turn.error")).toBeNull();
    });

    it("drop an answer still coming when the person signs out, so it never reaches whoever signs in next", async () => {
        const live = liveReply();
        const { handlers } = protonHandlers([]);
        renderApp("/design/help", personas.designAdmin, http.post("/api/proton/messages/stream", () => live.response()), ...handlers);

        const { panel } = await openAndAsk("Compare everyone's hours this month");
        live.send("delta", { trip: 1, text: "Comparing… " });
        await within(panel).findByText("Comparing…");

        // the person signs out (or another account signs in in another tab) while the answer is still coming
        resetSessionState();
        live.finish({ ...reply("Rana logged 162 hours, Karim 98."), uiCommands: [{ type: "open_page", label: "Reports", page: "reports" }] });

        // nothing of it lands in the next person's chat: not the answer, not even a note that it stopped
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(currentChat().turns).toEqual([]);
        expect(JSON.stringify(sessionStorage)).not.toContain("162 hours");
        expect(screen.queryByText("Rana logged 162 hours, Karim 98.")).not.toBeInTheDocument();
    });

    it("say why an answer that had started couldn't finish", async () => {
        const { handlers } = protonHandlers([]);
        renderApp("/design/help", personas.designAdmin,
            http.post("/api/proton/messages/stream", () => sseError({ type: "unavailable", code: "proton_unavailable", message: "Sorry, I couldn't answer that just now. Please try again." })),
            ...handlers);

        const { panel } = await openAndAsk("Summarise the month");

        expect(await within(panel).findByText("Sorry, I couldn't answer that just now. Please try again.")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Proton, something went wrong" })).toBeInTheDocument();
    });

    it("remember what the person typed when they ask, and list and forget it", async () => {
        const { handlers } = protonHandlers([reply("D'accord.")]);
        const saved: unknown[] = [];
        let memories = [] as { id: number; text: string; createdAt: string }[];
        renderApp("/design/help", personas.designAdmin,
            http.post("/api/proton/memories", async ({ request }) => {
                const body = await request.json() as { text: string };
                saved.push(body);
                memories = [{ id: 7, text: body.text, createdAt: "2026-10-09T09:00:00Z" }];
                return HttpResponse.json(memories[0], { status: 201 });
            }),
            http.get("/api/proton/memories", () => HttpResponse.json(memories)),
            http.delete("/api/proton/memories/:id", () => { memories = []; return new HttpResponse(null, { status: 204 }); }),
            ...handlers);
        const { user, panel } = await openAndAsk("Answer in French from now on");
        await within(panel).findByText("D'accord.");

        await user.click(within(panel).getByRole("button", { name: "Remember this" }));
        expect(await within(panel).findByText("I'll remember that.")).toBeInTheDocument();
        expect(saved).toEqual([{ conversationId: "c1", text: "Answer in French from now on" }]);

        await user.click(within(panel).getByRole("button", { name: "Proton options" }));
        await user.click(await screen.findByRole("menuitem", { name: "What I remember" }));
        expect(await within(panel).findByText("Answer in French from now on")).toBeInTheDocument();
        await user.click(within(panel).getByRole("button", { name: 'Forget "Answer in French from now on"' }));
        expect(await within(panel).findByText(/Nothing yet/)).toBeInTheDocument();
        await user.click(within(panel).getByRole("button", { name: "Back to the chat" }));
        expect(within(panel).getByText("D'accord.")).toBeInTheDocument();
    });

    it("opens in a browser whose scrollIntoView returns a Promise, as newer Chrome does", async () => {
        // regression: the thread's scroll effect returned that Promise, and React tried to call it as a cleanup
        const scroll = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = () => Promise.resolve() as unknown as void;
        try {
            const { handlers } = protonHandlers([reply("All quiet.")]);
            renderApp("/design/help", personas.designAdmin, ...handlers);
            const { panel } = await openAndAsk("Anything new?");
            expect(await within(panel).findByText("All quiet.")).toBeInTheDocument();
            expect(screen.queryByText("Something went wrong on this page")).not.toBeInTheDocument();
        } finally {
            Element.prototype.scrollIntoView = scroll;
        }
    });

    it("offers to talk only when voice is switched on, and typing still works", async () => {
        const { handlers } = protonHandlers([reply("Villa Mounir is active.")]);
        renderApp("/design/help", personas.designAdmin,
            http.get("/api/proton/usage", () => HttpResponse.json({ ...usage, voiceAvailable: true, voiceMaxMinutes: 10 })), ...handlers);

        const { panel } = await openPanel();
        expect(within(panel).getByRole("button", { name: "Talk to Proton" })).toBeInTheDocument();
        expect(within(panel).getByRole("textbox", { name: "Ask Proton" })).toBeInTheDocument();
    });

    it("doesn't offer to talk when voice is off", async () => {
        const { handlers } = protonHandlers([]);
        renderApp("/design/help", personas.designAdmin, ...handlers);

        const { panel } = await openPanel();
        expect(within(panel).queryByRole("button", { name: "Talk to Proton" })).not.toBeInTheDocument();
    });

    it("isn't offered to someone without proton:use", async () => {
        const noProton = { ...personas.designEmployee, permissions: personas.designEmployee.permissions.filter((p) => p !== "proton:use") };
        renderApp("/design/help", noProton);
        await screen.findByRole("button", { name: "Help" });
        await waitFor(() => expect(screen.queryByRole("button", { name: /^Proton, / })).not.toBeInTheDocument());
    });
});
