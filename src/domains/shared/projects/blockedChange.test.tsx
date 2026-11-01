import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const change = (over: object = {}) => ({
    id: 9, projectId: site.project.id, projectTitle: site.project.title, domain: "execution", kind: "expense",
    summary: "Expense: Scaffolding, 1,000.00 USD", status: "pending", requestedBy: { id: 3, name: "Karim Test" },
    requestedAt: "2026-10-28T09:00:00Z", decidedBy: null, decidedAt: null, profitNow: 600, ...over,
});

const refused = () => HttpResponse.json({
    type: "business_rule", code: "profit_floor", blockedChangeId: 9, errors: null, traceId: "t",
    message: "This would take the project's profit to zero or below, so it wasn't saved. Whoever sees the project's money was asked to look.",
}, { status: 422 });

/** Refuses the expense, and answers the blocked change's calls, keeping each one's path. */
const floorHandlers = (calls: string[]) => [
    http.post("/api/projects/:id/expenses", () => { calls.push("expense"); return refused(); }),
    http.get("/api/blocked-changes/:id", () => HttpResponse.json(change())),
    http.post("/api/blocked-changes/:id/force", ({ params }) => { calls.push(`force ${String(params.id)}`); return HttpResponse.json(change({ status: "forced" })); }),
    http.post("/api/blocked-changes/:id/dismiss", ({ params }) => { calls.push(`dismiss ${String(params.id)}`); return HttpResponse.json(change({ status: "dismissed" })); }),
];

async function addExpense() {
    const dialog = await screen.findByRole("dialog", { name: "Add project expense" });
    await userEvent.type(within(dialog).getByLabelText("What was it?"), "Scaffolding");
    await userEvent.type(within(dialog).getByLabelText("Amount"), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
    return dialog;
}

describe("the profit floor", () => {
    it("lets whoever sees the money force a refused expense, after asking", async () => {
        const calls: string[] = [];
        // a Design project's: an Execution site records its costs in its Expenses list
        const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
        renderApp(`/design/projects/${projectWork.project.id}?money=expense`, admin, ...floorHandlers(calls), ...projectWorkHandlers);
        const dialog = await addExpense();

        await userEvent.click(await within(dialog).findByRole("button", { name: "Force it" }));
        expect(within(dialog).getByText("Save it anyway, at zero profit or below?")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Force" }));
        await waitFor(() => expect(calls).toEqual(["expense", "force 9"]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add project expense" })).not.toBeInTheDocument());
    });

    it("opens a refused change from its notification, to dismiss it or force it through", async () => {
        const calls: string[] = [];
        renderApp(`/execution/projects/${site.project.id}?blocked=9`, personas.superAdmin, ...floorHandlers(calls), ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "A change was stopped" });
        expect(await within(dialog).findByText("Expense: Scaffolding, 1,000.00 USD")).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("button", { name: "Force…" }));
        expect(within(dialog).getByText("It will take the project to zero profit or below.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
        await waitFor(() => expect(calls).toEqual(["dismiss 9"]));
    });
});
