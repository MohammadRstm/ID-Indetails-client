import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const budget = {
    month: "2026-10-01",
    model: "claude-sonnet-5-5",
    monthlyBudgetUsd: 50,
    topUpsUsd: 0,
    budgetUsd: 50,
    spentUsd: 1.25,
    remainingUsd: 48.75,
    usedPct: 3,
    questions: 25,
    topUps: [],
    byUser: [{ userId: 2, name: "Rana Haddad", questions: 25, costUsd: 1.25, tokens: 410_000 }],
    byDomain: [{ domain: "design", questions: 25, costUsd: 1.25 }],
    byTool: [{ tool: "compare_work", calls: 12, averageMs: 180, questions: 10, questionCostUsd: 0.6 }],
    byDay: [{ day: "2026-10-06", questions: 25, costUsd: 1.25 }],
    topConversations: [{ conversationId: "c1", userId: 2, name: "Rana Haddad", questions: 6, toolCalls: 14, costUsd: 0.42 }],
};

describe("Proton budget", () => {
    it("show super admins where the budget went, and top it up", async () => {
        const topUps: unknown[] = [];
        renderApp("/company/proton", personas.superAdmin,
            http.get("/api/proton/budget", () => HttpResponse.json(budget)),
            http.get("/api/proton/actions/all", () => HttpResponse.json([
                { id: "a1", tool: "propose_add_requirement", title: "Add a requirement to Villa Mounir", status: "failed", createdAt: "2026-10-06T09:00:00Z", decidedAt: "2026-10-06T09:01:00Z", resultType: null, resultId: null, errorMessage: "The project is closed.", who: "Rana Haddad" },
            ])),
            http.post("/api/proton/budget/top-ups", async ({ request }) => {
                topUps.push(await request.json());
                return HttpResponse.json({ ...budget, topUpsUsd: 20, budgetUsd: 70, remainingUsd: 68.75 });
            }));

        expect(await screen.findByRole("heading", { name: "Proton" })).toBeInTheDocument();
        const tools = await screen.findByRole("table", { name: "By tool" });
        expect(within(tools).getByText("compare_work")).toBeInTheDocument();
        expect(within(tools).getByText("180 ms")).toBeInTheDocument();
        expect(within(screen.getByRole("table", { name: "Most expensive conversations" })).getByText("$0.420")).toBeInTheDocument();
        expect(within(screen.getByRole("table", { name: "By domain" })).getByText("Design")).toBeInTheDocument();
        const proposals = await screen.findByRole("table", { name: "Changes Proton proposed" });
        expect(within(proposals).getByText("Rana Haddad")).toBeInTheDocument();
        expect(within(proposals).getByText("Failed: The project is closed.")).toBeInTheDocument();

        const user = userEvent.setup();
        // a top-up is at most $10,000, said next to the amount as it is typed
        await user.type(screen.getByLabelText("Amount (USD)"), "15000");
        expect(screen.getByLabelText("Amount (USD)")).toHaveValue("15,000");
        expect(screen.getByText("Up to $10,000 at a time.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add to the budget" })).toBeDisabled();
        await user.clear(screen.getByLabelText("Amount (USD)"));
        await user.type(screen.getByLabelText("Amount (USD)"), "20");
        expect(screen.queryByText("Up to $10,000 at a time.")).not.toBeInTheDocument();
        await user.type(screen.getByLabelText("Note (optional)"), "Busy month");
        await user.click(screen.getByRole("button", { name: "Add to the budget" }));
        expect(await screen.findByText("$20 added")).toBeInTheDocument();
        expect(topUps).toEqual([{ amountUsd: 20, note: "Busy month" }]);
    });

    it("isn't a page for admins", async () => {
        renderApp("/company/proton", personas.designAdmin);
        expect(await screen.findByRole("button", { name: "Help" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Proton" })).not.toBeInTheDocument();
    });
});
