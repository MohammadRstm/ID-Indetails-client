import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const project = projectWork.project;
const m = project.money!;
const path = `/design/projects/${project.id}`;
const clients = { items: [{ id: 7, displayName: "Cedar Bank SAL", name: "Rita Frem", organisation: "Cedar Bank SAL" }], page: 1, pageSize: 100, totalCount: 1 };

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const band = async () => (await screen.findByText("Where the cost sits")).closest(".panel") as HTMLElement;

describe("a project's money", () => {
    it("shows the profit so far and where the cost sits", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        const panel = await band();
        expect(within(panel).getByText("Profit so far")).toBeInTheDocument();
        expect(within(panel).getByText(money.fmt(m.profit))).toBeInTheDocument();
        expect(await within(panel).findByText(`${projectWork.expenses.items.length} items · add`)).toBeInTheDocument();
        expect(await screen.findByText("Financial breakdown")).toBeInTheDocument();
        expect(screen.getByText(projectWork.expenses.items[0].label)).toBeInTheDocument();
    });

    it("says so next to the expenses when they don't load", async () => {
        renderApp(path, admin,
            http.get("/api/projects/:id/expenses", () => HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed." }, { status: 403 })),
            ...projectWorkHandlers);
        expect(await screen.findByText(/Couldn't load the expenses\./)).toBeInTheDocument();
        expect(screen.getByText("Financial breakdown")).toBeInTheDocument();
    });

    it("puts the customer payment first on the Financials tab, in bold, with no pencil left in the header", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        const section = await screen.findByRole("region", { name: "Customer payment" });
        expect(within(section).getAllByText(money.exact(m.revenue))[0]).toHaveClass("pay-amount");
        // before everything else on the tab
        expect(section.compareDocumentPosition(await band()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getAllByRole("button", { name: "Edit customer payment" })).toHaveLength(1);
        expect(within(section).getByRole("button", { name: "Edit customer payment" })).toBeInTheDocument();
    });

    it("changes the customer payment only with why it changes", async () => {
        const saved: unknown[] = [];
        renderApp(path, admin,
            http.put(`/api/projects/${project.id}/payment`, async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(project); }),
            ...projectWorkHandlers);
        await userEvent.click(within(await screen.findByRole("region", { name: "Customer payment" })).getByRole("button", { name: "Edit customer payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Customer payment" });
        const save = within(dialog).getByRole("button", { name: "Save" });

        // the same amount, and no reason: both are said, nothing is sent
        await userEvent.click(save);
        expect(within(dialog).getByText(`The payment is already ${money.exact(m.revenue)} with ${money.pct(m.tvaRate ?? 0)} TVA: change one of them.`)).toBeInTheDocument();
        expect(within(dialog).getByText("Say why the payment changes.")).toBeInTheDocument();
        expect(saved).toEqual([]);

        const amount = within(dialog).getByLabelText("Customer payment");
        await userEvent.clear(amount);
        await userEvent.type(amount, "30000");
        expect(within(dialog).queryByText(/The payment is already/)).not.toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "  The client added a guest house  ");
        expect(within(dialog).queryByText("Say why the payment changes.")).not.toBeInTheDocument();
        await userEvent.click(save);
        await waitFor(() => expect(saved).toEqual([{ revenue: 30000, tvaRate: m.tvaRate ?? 0, description: "The client added a guest house" }]));
        // whoever sends quotes is asked whether to send the new price
        expect(await screen.findByRole("dialog", { name: "Send the quote?" })).toBeInTheDocument();
    });

    it("says why the API refused a payment change, keeping the form", async () => {
        renderApp(path, admin,
            http.put(`/api/projects/${project.id}/payment`, () => HttpResponse.json(
                { type: "business_rule", code: "project_locked", message: "The project is finished: reopen it to change its money." }, { status: 422 })),
            ...projectWorkHandlers);
        await userEvent.click(within(await screen.findByRole("region", { name: "Customer payment" })).getByRole("button", { name: "Edit customer payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Customer payment" });
        const amount = within(dialog).getByLabelText("Customer payment");
        await userEvent.clear(amount);
        await userEvent.type(amount, "30000");
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "More rooms");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("The project is finished: reopen it to change its money.")).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Why it changes")).toHaveValue("More rooms");
    });

    it("shows every change of the payment, newest first, in its own window", async () => {
        const changes = [
            { id: 2, amount: 30000, previousAmount: 25000, materialMarkup: null, previousMaterialMarkup: null, supervisionRate: null, previousSupervisionRate: null, description: "The client added a guest house", changedAt: "2026-09-20T09:00:00Z", changedBy: { id: 1, name: "Rana Haddad" } },
            { id: 1, amount: 25000, previousAmount: null, materialMarkup: null, previousMaterialMarkup: null, description: "Agreed at the start", changedAt: "2026-06-01T09:00:00Z", changedBy: null },
        ];
        renderApp(path, admin, http.get(`/api/projects/${project.id}/payment-changes`, () => HttpResponse.json(changes)), ...projectWorkHandlers);
        await userEvent.click(within(await screen.findByRole("region", { name: "Customer payment" })).getByRole("button", { name: "History" }));
        const dialog = await screen.findByRole("dialog", { name: "Payment history" });
        const rows = await within(dialog).findAllByRole("listitem");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent(`${money.exact(25000)} → ${money.exact(30000)}`);
        expect(rows[0]).toHaveTextContent("Sep 20, 2026 · Rana Haddad");
        expect(rows[0]).toHaveTextContent("The client added a guest house");
        expect(rows[0]).not.toHaveTextContent("Supervision");
        expect(rows[1]).toHaveTextContent(money.exact(25000));
        expect(rows[1]).toHaveTextContent("Agreed at the start");
        expect(rows[1]).not.toHaveTextContent("→");
    });

    it("warns that changing the client ends the current client's access to the client portal", async () => {
        const warning = `${project.client?.displayName}'s contacts lose access to this project's client portal. Its chat and comments stay `
            + "with the project: if it gets a client again, that client's contacts will see them once invited.";
        renderApp(path, admin, http.get("/api/clients", () => HttpResponse.json(clients)), ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Client & type" }));
        const dialog = await screen.findByRole("dialog", { name: "Client & type" });
        // the same client: nothing to warn about
        expect(within(dialog).queryByText(warning)).toBeNull();

        await userEvent.click(within(dialog).getByRole("tab", { name: "Internal" }));
        const notes = within(dialog).getAllByRole("note");
        expect(notes.map((n) => n.textContent)).toEqual([
            "Its customer payment drops to 0, and the payment history says it became internal work.",
            warning,
        ]);
        // a warning, not a stop
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

        await userEvent.click(within(dialog).getByRole("tab", { name: "Client project" }));
        expect(within(dialog).queryByRole("note")).toBeNull();
    });

    it("turns internal work into client work from the Financials tab, asking which client, with no payment in the same step", async () => {
        const saved: unknown[] = [];
        const internal = { ...project, billingType: "internal", client: null, money: { ...m, revenue: 0, profit: -m.cost.total, margin: null } };
        renderApp(path, admin,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)),
            http.get("/api/clients", () => HttpResponse.json(clients)),
            http.put(`/api/projects/${project.id}/billing`, async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(project); }),
            ...projectWorkHandlers);
        const section = await screen.findByRole("region", { name: "Customer payment" });
        expect(within(section).getByText(/Internal project - no client and no payment\./)).toBeInTheDocument();
        expect(within(section).queryByRole("button", { name: "History" })).not.toBeInTheDocument();
        await userEvent.click(within(section).getByRole("button", { name: "Make it client work" }));
        const dialog = await screen.findByRole("dialog", { name: "Client & type" });
        await userEvent.click(within(dialog).getByRole("tab", { name: "Client project" }));
        expect(within(dialog).getByText("It starts with no payment: set it on the Financials tab once saved.")).toBeInTheDocument();
        const save = within(dialog).getByRole("button", { name: "Save" });
        // client work needs its client: saving without one says so
        await userEvent.click(save);
        expect(within(dialog).getByText("Choose the client this work is for.")).toBeInTheDocument();
        expect(saved).toEqual([]);
        await userEvent.click(within(dialog).getByLabelText("Client"));
        await userEvent.click(screen.getByRole("option", { name: "Cedar Bank SAL" }));
        await userEvent.click(save);
        await waitFor(() => expect(saved).toEqual([{ billingType: "client", clientId: 7 }]));
    });

    it("adds an expense", async () => {
        const added: unknown[] = [];
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/expenses`, async ({ request }) => { added.push(await request.json()); return HttpResponse.json(projectWork.expenses.items[0], { status: 201 }); }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
        const dialog = await screen.findByRole("dialog", { name: "Add project expense" });
        const add = within(dialog).getByRole("button", { name: "Add expense" });
        await userEvent.click(add);
        expect(within(dialog).getByText("Say what the money went on.")).toBeInTheDocument();
        expect(within(dialog).getByText("Enter the amount spent.")).toBeInTheDocument();
        expect(added).toEqual([]);
        await userEvent.type(within(dialog).getByLabelText("What was it?"), "Taxi to the site");
        await userEvent.type(within(dialog).getByLabelText("Amount"), "25");
        await userEvent.click(within(dialog).getByLabelText("Category"));
        await userEvent.click(screen.getByRole("option", { name: "Travel" }));
        await userEvent.click(add);
        await waitFor(() => expect(added).toEqual([{ label: "Taxi to the site", amount: 25, currency: "USD", category: "travel", spentOn: "2026-09-30" }]));
    });

    it("takes no amount larger than the system keeps, and says so beside it", async () => {
        const added: Array<{ amount: number }> = [];
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/expenses`, async ({ request }) => { added.push(await request.json() as { amount: number }); return HttpResponse.json(projectWork.expenses.items[0], { status: 201 }); }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
        const dialog = await screen.findByRole("dialog", { name: "Add project expense" });
        await userEvent.type(within(dialog).getByLabelText("What was it?"), "Marble");
        const amount = within(dialog).getByLabelText("Amount");
        await userEvent.type(amount, "99999999999999999999");
        // thirteen digits, with commas between the thousands (the 0 the field starts with goes)
        expect(amount).toHaveValue("9,999,999,999,999");
        expect(within(dialog).getByText("Up to 9,999,999,999,999.99, with at most 2 decimals.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
        await waitFor(() => expect(added).toHaveLength(1));
        expect(added[0].amount).toBe(9_999_999_999_999);
    });

    it("removes an expense after asking", async () => {
        let removed: string | null = null;
        const x = projectWork.expenses.items[0];
        renderApp(path, admin,
            http.delete(`/api/projects/${project.id}/expenses/:id`, ({ params }) => { removed = String(params.id); return new HttpResponse(null, { status: 204 }); }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByText(x.label));
        const dialog = await screen.findByRole("dialog", { name: "Remove this expense?" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(removed).toBe(String(x.id)));
    });

    it("keeps every money figure and request for financial:view", async () => {
        const asked: string[] = [];
        renderApp(path, withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/projects/:id/expenses", () => { asked.push("expenses"); return HttpResponse.json(projectWork.expenses); }),
            http.get("/api/projects/:id/cost-timeline", () => { asked.push("cost"); return HttpResponse.json(projectWork.costTimeline); }),
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json({ ...project, money: null })),
            ...projectWorkHandlers);
        await screen.findByText("Total hours");
        expect(screen.queryByText("Where the cost sits")).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Customer payment" })).not.toBeInTheDocument();
        expect(screen.queryByText("Financial breakdown")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("offers the payment and expenses only to people who may change them", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.PROJECT_EDIT, P.EXPENSE_MANAGE] }), ...projectWorkHandlers);
        const panel = await band();
        expect(await within(panel).findByText(`${projectWork.expenses.items.length} items`)).toBeInTheDocument();
        const section = screen.getByRole("region", { name: "Customer payment" });
        expect(within(section).queryByRole("button", { name: "Edit customer payment" })).not.toBeInTheDocument();
        // the history is for whoever sees the money
        expect(within(section).getByRole("button", { name: "History" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.queryByRole("button", { name: "Add project expense" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /customer payment/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Client & type" })).not.toBeInTheDocument();
    });

    it("says the profit is final once the project is closed", async () => {
        renderApp(path, admin,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json({ ...project, status: "completed", completedAt: "2026-09-28T10:00:00Z", finalizedAt: "2026-09-28T10:00:00Z", money: { ...m, isLocked: true } })),
            ...projectWorkHandlers);
        const panel = await band();
        expect(within(panel).getByText("Final profit", { selector: ".u" })).toBeInTheDocument();
        expect(within(panel).getByText("finalised Sep 28")).toBeInTheDocument();
        const section = screen.getByRole("region", { name: "Customer payment" });
        expect(within(section).getByText("locked")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit customer payment" })).not.toBeInTheDocument();
        expect(within(panel).queryByRole("button", { name: "Close project…" })).not.toBeInTheDocument();
    });
});
