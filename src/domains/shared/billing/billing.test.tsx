import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { billing, billingHandlers } from "@/test/fixtures/billing";
import { financialsHandlers } from "@/test/fixtures/financials";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = personas.designAdmin;
const project = projectWork.project;
const path = `/design/projects/${project.id}`;
const inv = billing.issued;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    URL.createObjectURL = vi.fn(() => "blob:invoice");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

const band = async () => (await screen.findByText("Client payments")).closest(".panel") as HTMLElement;
const handlers = [...billingHandlers, ...projectWorkHandlers];

describe("a project's billing", () => {
    it("shows what was received, what is owed and the invoices", async () => {
        renderApp(path, admin, ...handlers);
        const panel = await band();
        expect(within(panel).getByText(`${money.fmt(inv.balance!)} overdue`)).toBeInTheDocument();
        expect(await within(panel).findByText(inv.number!)).toBeInTheDocument();
    });

    it("writes a draft beside what the client will receive", async () => {
        const saved: unknown[] = [];
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/invoices`, async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(billing.draft, { status: 201 }); }),
            ...handlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "New invoice" }));
        const dialog = await screen.findByRole("dialog", { name: "New invoice" });
        // the preview is the document the client gets, marked as a draft
        expect(within(dialog).getByText("What Mounir will receive")).toBeInTheDocument();
        expect(await within(dialog).findByText("mounir.aoun@mail.test")).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Line 1"), "Second milestone");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(saved).toEqual([{ lines: [{ description: "Second milestone", amount: 18200 }], notes: null, termsDays: 30 }]));
    });

    it("saves and sends: a draft is issued, then emailed by the server", async () => {
        const calls: string[] = [];
        const emailed: unknown[] = [];
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/invoices`, () => HttpResponse.json(billing.draft, { status: 201 })),
            http.post(`/api/invoices/${billing.draft.id}/issue`, () => { calls.push("issue"); return HttpResponse.json(inv); }),
            http.post(`/api/invoices/${inv.id}/email`, async ({ request }) => { calls.push("email"); emailed.push(await request.json()); return HttpResponse.json(inv, { status: 201 }); }),
            ...handlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "New invoice" }));
        const editor = await screen.findByRole("dialog", { name: "New invoice" });
        await userEvent.type(within(editor).getByLabelText("Line 1"), "Second milestone");
        await userEvent.click(within(editor).getByRole("button", { name: "Save and send…" }));
        const send = await screen.findByRole("dialog", { name: "Send invoice" });
        expect(within(send).getByText("Sending issues the invoice and starts the payment clock.")).toBeInTheDocument();
        await userEvent.click(within(send).getByRole("button", { name: "Send email" }));
        await waitFor(() => expect(calls).toEqual(["issue", "email"]));
        expect(emailed).toEqual([{ to: "mounir.aoun@mail.test" }]);
    });

    it("records a download as a delivery", async () => {
        const delivered: unknown[] = [];
        renderApp(`${path}?send=${inv.id}`, admin,
            http.post(`/api/invoices/${inv.id}/deliveries`, async ({ request }) => { delivered.push(await request.json()); return HttpResponse.json(inv, { status: 201 }); }),
            http.get(`/api/invoices/${inv.id}/pdf`, () => new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } })),
            ...handlers);
        const send = await screen.findByRole("dialog", { name: `Send ${inv.number}` });
        expect(within(send).getByText("Already sent - this records another delivery.")).toBeInTheDocument();
        await userEvent.click(within(send).getByRole("button", { name: /Download the PDF/ }));
        await userEvent.click(within(send).getByRole("button", { name: "Download" }));
        await waitFor(() => expect(delivered).toEqual([{ channel: "download", recipient: null }]));
    });

    it("records a payment against the open invoice, for its balance", async () => {
        const recorded: unknown[] = [];
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/payments`, async ({ request }) => {
                recorded.push(await request.json());
                return HttpResponse.json({ ...billing.domainPayments.items[0], amountUsd: 7800 }, { status: 201 });
            }),
            ...handlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
        expect(await within(dialog).findByText(`Balance on ${inv.number}: ${money.exact(inv.balance!)}, due Sep 20, 2026`)).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Reference"), "TRX-118");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
        await waitFor(() => expect(recorded).toEqual([{ amount: 7800, currency: "USD", fxRate: null, invoiceId: inv.id, method: "bank", receivedOn: "2026-09-30", reference: "TRX-118" }]));
    });

    it("settles invoices to the cent, as the API does", async () => {
        const recorded: unknown[] = [];
        const row = billing.projectInvoices.items[0];
        // a fraction of a cent left is settled; a balance with a floating-point tail is still its cents
        const settled = { ...row, id: 4, number: "ID-2026-004", balance: 0.004 };
        const owing = { ...row, balance: 1234.56 - 1e-7 };
        renderApp(path, admin,
            http.get("/api/invoices", () => HttpResponse.json({ ...billing.projectInvoices, items: [settled, owing], totalCount: 2 })),
            http.post(`/api/projects/${project.id}/payments`, async ({ request }) => {
                recorded.push(await request.json());
                return HttpResponse.json({ ...billing.domainPayments.items[0], amountUsd: 1234.56 }, { status: 201 });
            }),
            ...handlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
        expect(await within(dialog).findByText(/^Balance on ID-2026-003: \$1,234\.56/)).toBeInTheDocument();
        expect(within(dialog).queryByText(/ID-2026-004/)).not.toBeInTheDocument();
        expect(within(dialog).queryByText("More than this invoice is owed.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
        await waitFor(() => expect(recorded).toEqual([expect.objectContaining({ amount: 1234.56, invoiceId: owing.id })]));
    });

    it("voids a sent invoice with its reason", async () => {
        const voided: unknown[] = [];
        renderApp(`${path}?invoice=${inv.id}`, admin,
            http.post(`/api/invoices/${inv.id}/void`, async ({ request }) => { voided.push(await request.json()); return HttpResponse.json({ ...inv, status: "void" }); }),
            ...handlers);
        const dialog = await screen.findByRole("dialog", { name: inv.number! });
        await userEvent.click(within(dialog).getByRole("button", { name: "Void invoice" }));
        await userEvent.type(within(dialog).getByLabelText("Reason"), "Wrong amount");
        await userEvent.click(within(dialog).getByRole("button", { name: `Void ${inv.number}` }));
        await waitFor(() => expect(voided).toEqual([{ reason: "Wrong amount" }]));
    });

    it("discards a draft", async () => {
        let discarded = false;
        renderApp(`${path}?invoice=${billing.draft.id}`, admin,
            http.delete(`/api/invoices/${billing.draft.id}`, () => { discarded = true; return new HttpResponse(null, { status: 204 }); }),
            ...handlers);
        const dialog = await screen.findByRole("dialog", { name: "Draft invoice" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
        await waitFor(() => expect(discarded).toBe(true));
    });

    it("keeps invoicing, payments and voiding to the people who may", async () => {
        renderApp(`${path}?invoice=${inv.id}`, withPermissions(admin, { revoke: [P.INVOICE_CREATE, P.PAYMENT_RECORD, P.INVOICE_VOID] }), ...handlers);
        const dialog = await screen.findByRole("dialog", { name: inv.number! });
        expect(within(dialog).queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Void invoice" })).not.toBeInTheDocument();
        const panel = await band();
        expect(within(panel).queryByRole("button", { name: "New invoice" })).not.toBeInTheDocument();
        expect(within(panel).queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    });

    it("shows no billing without financial:view", async () => {
        const asked: string[] = [];
        renderApp(path, withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/invoices", () => { asked.push("invoices"); return HttpResponse.json(billing.projectInvoices); }),
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json({ ...project, money: null })),
            ...handlers);
        await screen.findByText("Who put the hours in. Click a person to see their entries on this project.");
        expect(screen.queryByText("Client payments")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });
});

describe("Financials → Billing", () => {
    it("shows collections and the invoice register, filtered", async () => {
        renderApp("/design/financials?tab=billing", admin, ...billingHandlers, ...financialsHandlers);
        expect(await screen.findByText("Collections, not profitability.")).toBeInTheDocument();
        const register = (await screen.findByText("Invoice register")).closest(".panel") as HTMLElement;
        await within(register).findByText(inv.number!);
        const drafts = billing.domainInvoices.items.filter((i) => i.status === "draft").length;
        await userEvent.click(within(register).getByRole("tab", { name: `Draft ${drafts}` }));
        expect(within(register).queryByText(inv.number!)).not.toBeInTheDocument();
    });

    it("opens an invoice from the register", async () => {
        renderApp("/design/financials?tab=billing", admin, ...billingHandlers, ...financialsHandlers);
        const register = (await screen.findByText("Invoice register")).closest(".panel") as HTMLElement;
        await userEvent.click(await within(register).findByText(inv.number!));
        expect(await screen.findByRole("dialog", { name: inv.number! })).toBeInTheDocument();
    });
});
