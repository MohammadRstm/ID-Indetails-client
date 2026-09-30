import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = personas.designAdmin;
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

    it("edits the customer payment from the header", async () => {
        const saved: unknown[] = [];
        renderApp(path, admin,
            http.put(`/api/projects/${project.id}/billing`, async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(project); }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Customer payment" });
        const amount = within(dialog).getByLabelText("Customer payment");
        await userEvent.clear(amount);
        await userEvent.type(amount, "30000");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saved).toEqual([{ billingType: "client", clientId: project.client!.id, revenue: 30000 }]));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("turns client work into internal work, and asks which client when it goes back", async () => {
        const saved: unknown[] = [];
        const internal = { ...project, billingType: "internal", client: null, money: { ...m, revenue: 0, profit: -m.cost.total, margin: null } };
        renderApp(path, admin,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)),
            http.get("/api/clients", () => HttpResponse.json(clients)),
            http.put(`/api/projects/${project.id}/billing`, async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(project); }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Set a customer payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Customer payment" });
        await userEvent.click(within(dialog).getByRole("tab", { name: "Client project" }));
        const save = within(dialog).getByRole("button", { name: "Save" });
        expect(save).toBeDisabled();
        await userEvent.click(within(dialog).getByLabelText("Client"));
        await userEvent.click(screen.getByRole("option", { name: "Cedar Bank SAL" }));
        await userEvent.type(within(dialog).getByLabelText("Customer payment"), "12000");
        await userEvent.click(save);
        await waitFor(() => expect(saved).toEqual([{ billingType: "client", clientId: 7, revenue: 12000 }]));
    });

    it("adds an expense", async () => {
        const added: unknown[] = [];
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/expenses`, async ({ request }) => { added.push(await request.json()); return HttpResponse.json(projectWork.expenses.items[0], { status: 201 }); }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
        const dialog = await screen.findByRole("dialog", { name: "Add project expense" });
        const add = within(dialog).getByRole("button", { name: "Add expense" });
        expect(add).toBeDisabled();
        await userEvent.type(within(dialog).getByLabelText("What was it?"), "Taxi to the site");
        await userEvent.type(within(dialog).getByLabelText("Amount"), "25");
        await userEvent.click(within(dialog).getByLabelText("Category"));
        await userEvent.click(screen.getByRole("option", { name: "Travel" }));
        await userEvent.click(add);
        await waitFor(() => expect(added).toEqual([{ label: "Taxi to the site", amount: 25, currency: "USD", category: "travel", spentOn: "2026-09-30" }]));
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
        await screen.findByText("Who put the hours in. Click a person to see their entries on this project.");
        expect(screen.queryByText("Where the cost sits")).not.toBeInTheDocument();
        expect(screen.queryByText("Financial breakdown")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("offers the payment and expenses only to people who may change them", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.PROJECT_EDIT, P.EXPENSE_MANAGE] }), ...projectWorkHandlers);
        const panel = await band();
        expect(await within(panel).findByText(`${projectWork.expenses.items.length} items`)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit payment" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.queryByRole("button", { name: "Add project expense" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /customer payment/ })).not.toBeInTheDocument();
    });

    it("says the profit is final once the project is closed", async () => {
        renderApp(path, admin,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json({ ...project, status: "completed", completedAt: "2026-09-28T10:00:00Z", finalizedAt: "2026-09-28T10:00:00Z", money: { ...m, isLocked: true } })),
            ...projectWorkHandlers);
        const panel = await band();
        expect(within(panel).getByText("Final profit", { selector: ".u" })).toBeInTheDocument();
        expect(within(panel).getByText("finalised Sep 28")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit payment" })).not.toBeInTheDocument();
        expect(within(panel).queryByRole("button", { name: "Close project…" })).not.toBeInTheDocument();
    });
});
