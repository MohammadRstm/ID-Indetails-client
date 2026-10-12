import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { sseReply } from "./protonTesting";
import { resetProton } from "./protonStore";

const usage = { month: "2026-10-01", available: true, questionsAllowed: 300, questionsUsed: 3, questionsRemaining: 297, usedPct: 1, companyLimitReached: false, voiceAvailable: false, voiceMaxMinutes: 0 };

const reply = (conversationId: string, text: string) => ({
    conversationId, reply: text, refs: [], limited: false, usage, sources: [], uiCommands: [], choices: [], quickReplies: [], suggestions: [],
    pendingActions: [], pendingAction: null, rolledOver: false,
});

/** A chart of hours by week, as the API sends one under an answer. */
const weekly = {
    id: "b1-d1", type: "chart", title: "Weekly hours", period: "2 Mar 2026 – 22 Mar 2026", table: null, kpis: null, notes: [],
    source: { tool: "get_time_summary", dataset: "d1", asOf: "2026-10-12T09:05:00Z" },
    chart: {
        kind: "columns", axisLabel: "Week", axis: "week", series: [{ key: "hours", label: "Hours", unit: "hours" }],
        points: [{ label: "2026-03-02", values: [2] }, { label: "2026-03-09", values: [1] }, { label: "2026-03-16", values: [3] }],
    },
};

const summary = (id: string, title: string) => ({ id, title, createdAt: "2026-10-12T08:00:00Z", updatedAt: "2026-10-12T09:00:00Z", messageCount: 2 });

const saved = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
    id, title: "Villa Mounir status", createdAt: "2026-10-12T08:00:00Z", updatedAt: "2026-10-12T09:00:00Z", canContinue: true, hidden: null,
    messages: [
        { seq: 1, role: "user", origin: "typed", text: "How is Villa Mounir?", refs: [], sources: [], cards: [], createdAt: "2026-10-12T08:00:00Z" },
        { seq: 2, role: "proton", origin: null, text, refs: [], sources: [], cards: [], createdAt: "2026-10-12T08:00:01Z" },
    ],
    ...extra,
});

/** Proton's endpoints with saved chats, recording what the page sends. */
function handlers(chats = [summary("c1", "Villa Mounir status"), summary("c2", "Hours this week")]) {
    const sent = { questions: [] as Record<string, unknown>[], renamed: [] as unknown[], deleted: [] as string[] };
    let list = [...chats];
    return {
        sent,
        handlers: [
            http.get("/api/proton/usage", () => HttpResponse.json(usage)),
            http.get("/api/proton/briefing", () => HttpResponse.json({ items: [], more: 0 })),
            http.get("/api/proton/actions", () => HttpResponse.json([])),
            http.get("/api/proton/conversations", () => HttpResponse.json({ items: list, page: 1, pageSize: 50, totalCount: list.length })),
            http.get("/api/proton/conversations/:id", ({ params }) => params.id === "c1"
                ? HttpResponse.json(saved("c1", "Villa Mounir is active and on track."))
                : params.id === "c3" ? HttpResponse.json(saved("c3", "", { canContinue: false, hidden: "This chat was held with access you no longer have, so it isn't shown.", messages: [] }))
                : params.id === "c4" ? HttpResponse.json(saved("c4", "", { messages: [
                    { seq: 1, role: "user", origin: "typed", text: "Hours by week in March?", refs: [], sources: [], cards: [], blocks: [], createdAt: "2026-10-12T08:00:00Z" },
                    { seq: 2, role: "proton", origin: null, text: "The last week was the busiest.", refs: [], sources: [], cards: [], blocks: [weekly], createdAt: "2026-10-12T08:00:01Z" },
                ] }))
                : HttpResponse.json({ type: "not_found", code: "not_found", message: "Chat not found.", errors: null, traceId: "t" }, { status: 404 })),
            http.patch("/api/proton/conversations/:id", async ({ request, params }) => {
                const body = await request.json() as { title: string };
                sent.renamed.push({ id: params.id, ...body });
                list = list.map((c) => (c.id === params.id ? { ...c, title: body.title } : c));
                return HttpResponse.json(list.find((c) => c.id === params.id));
            }),
            http.delete("/api/proton/conversations/:id", ({ params }) => {
                sent.deleted.push(String(params.id));
                list = list.filter((c) => c.id !== params.id);
                return new HttpResponse(null, { status: 204 });
            }),
            http.post("/api/proton/messages/stream", async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                sent.questions.push(body);
                const id = (body.conversationId as string | null) ?? "c9";
                if (!list.some((c) => c.id === id)) list = [summary(id, String(body.text)), ...list];
                const answer = reply(id, `Answer to ${String(body.text)}`);
                const withChart = { ...answer, blocks: [weekly] };
                return sseReply(String(body.text).includes("chart") ? withChart : answer);
            }),
        ],
    };
}

afterEach(() => {
    resetProton();
    sessionStorage.clear();
    localStorage.clear();
});

describe("Proton's page", () => {
    it("lists the saved chats and opens one, which then carries on in the same conversation", async () => {
        const { handlers: h, sent } = handlers();
        renderApp("/design/assistant", personas.designAdmin, ...h);
        const user = userEvent.setup();

        const list = await screen.findByRole("complementary", { name: "Your chats with Proton" });
        await user.click(await within(list).findByRole("button", { name: /Villa Mounir status/ }));

        expect(await screen.findByText("Villa Mounir is active and on track.")).toBeInTheDocument();
        expect(screen.getByText("How is Villa Mounir?")).toBeInTheDocument();
        await waitFor(() => expect(window.location.pathname).toBe("/design/assistant/c1"));
        expect(within(list).getByRole("button", { name: /Villa Mounir status/ })).toHaveAttribute("aria-current", "page");

        await user.type(screen.getByRole("textbox", { name: "Ask Proton" }), "And now?");
        await user.click(screen.getByRole("button", { name: "Send" }));
        expect(await screen.findByText("Answer to And now?")).toBeInTheDocument();
        expect(sent.questions[0]).toMatchObject({ conversationId: "c1", text: "And now?" });
        // the page is the chat: no floating panel or blob beside it
        expect(screen.queryByRole("button", { name: /^Proton, / })).not.toBeInTheDocument();
    });

    it("starts a new chat without deleting the one before, and gives it its address once answered", async () => {
        const { handlers: h, sent } = handlers();
        renderApp("/design/assistant/c1", personas.designAdmin, ...h);
        const user = userEvent.setup();
        expect(await screen.findByText("Villa Mounir is active and on track.")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "New chat" }));
        await waitFor(() => expect(window.location.pathname).toBe("/design/assistant"));
        expect(screen.queryByText("Villa Mounir is active and on track.")).not.toBeInTheDocument();

        await user.type(screen.getByRole("textbox", { name: "Ask Proton" }), "Hours this month?");
        await user.click(screen.getByRole("button", { name: "Send" }));
        expect(await screen.findByText("Answer to Hours this month?")).toBeInTheDocument();
        expect(sent.questions[0]).toMatchObject({ conversationId: null });
        await waitFor(() => expect(window.location.pathname).toBe("/design/assistant/c9"));
        expect(sent.deleted).toEqual([]);
    });

    it("renames and deletes the chat it shows", async () => {
        const { handlers: h, sent } = handlers();
        renderApp("/design/assistant/c1", personas.designAdmin, ...h);
        const user = userEvent.setup();
        await screen.findByText("Villa Mounir is active and on track.");

        await user.click(await screen.findByRole("button", { name: "Rename" }));
        const name = screen.getByRole("textbox", { name: "Chat name" });
        await user.clear(name);
        await user.type(name, "Villa check");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent.renamed).toEqual([{ id: "c1", title: "Villa check" }]));
        expect(await screen.findAllByText("Villa check")).not.toHaveLength(0);

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(within(screen.getByRole("group", { name: "Delete this chat?" })).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(sent.deleted).toEqual(["c1"]));
        await waitFor(() => expect(window.location.pathname).toBe("/design/assistant"));
    });

    it("shows why a chat can't be read or carried on, and offers a new one instead of the composer", async () => {
        const { handlers: h } = handlers();
        renderApp("/design/assistant/c3", personas.designAdmin, ...h);

        expect(await screen.findByText("This chat was held with access you no longer have, so it isn't shown.")).toBeInTheDocument();
        expect(screen.queryByRole("textbox", { name: "Ask Proton" })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "New chat" }).length).toBeGreaterThan(0);
    });

    it("sends someone to a new chat when the one in the address can't be found", async () => {
        const { handlers: h } = handlers();
        renderApp("/design/assistant/missing", personas.designAdmin, ...h);

        expect(await screen.findByRole("alert")).toHaveTextContent("Chat not found.");
        await waitFor(() => expect(window.location.pathname).toBe("/design/assistant"));
    });

    it("is reached from the panel's menu, on the chat in hand", async () => {
        const { handlers: h } = handlers();
        renderApp("/design/help", personas.designAdmin, ...h);
        const user = userEvent.setup();
        await screen.findByRole("textbox", { name: "Search Help" });
        await user.click(await screen.findByRole("button", { name: /^Proton, / }));
        const panel = await screen.findByRole("dialog", { name: "Proton" });
        await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), "Hi");
        await user.click(within(panel).getByRole("button", { name: "Send" }));
        await within(panel).findByText("Answer to Hi");

        await user.click(within(panel).getByRole("button", { name: "Proton options" }));
        await user.click(screen.getByRole("menuitem", { name: "Go to chat" }));

        await waitFor(() => expect(window.location.pathname).toBe("/design/assistant/c9"));
        expect(await screen.findByText("Answer to Hi")).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Proton" })).not.toBeInTheDocument();
    });

    it("shows a saved chat's charts in full, with their figures as a table", async () => {
        const { handlers: h } = handlers();
        renderApp("/design/assistant/c4", personas.designAdmin, ...h);
        const user = userEvent.setup();

        expect(await screen.findByText("The last week was the busiest.")).toBeInTheDocument();
        expect(await screen.findByText("Weekly hours")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByRole("row", { name: /Week of Mar 16, 2026/ })).toHaveTextContent("3h");
    });

    it("shows a chart small in the panel, and in full on a click", async () => {
        const { handlers: h } = handlers();
        renderApp("/design/help", personas.designAdmin, ...h);
        const user = userEvent.setup();
        await screen.findByRole("textbox", { name: "Search Help" });
        await user.click(await screen.findByRole("button", { name: /^Proton, / }));
        const panel = await screen.findByRole("dialog", { name: "Proton" });
        await user.type(within(panel).getByRole("textbox", { name: "Ask Proton" }), "Hours by week as a chart");
        await user.click(within(panel).getByRole("button", { name: "Send" }));

        await user.click(await within(panel).findByRole("button", { name: 'Show "Weekly hours" in full' }));
        const full = await screen.findByRole("dialog", { name: "Weekly hours" });
        expect(within(full).getByRole("row", { name: /Week of Mar 2, 2026/ })).toHaveTextContent("2h");
        // the page beneath stays where it was
        expect(window.location.pathname).toBe("/design/help");
    });

    it("isn't open to someone without Proton", async () => {
        const noProton = { ...personas.designEmployee, permissions: personas.designEmployee.permissions.filter((p) => p !== "proton:use") };
        renderApp("/design/assistant", noProton);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });
});
