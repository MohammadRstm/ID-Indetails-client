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

    it("retries a send whose email failed after issuing without issuing it again", async () => {
        const calls: string[] = [];
        let issued = false;
        let emails = 0;
        renderApp(`${path}?send=${billing.draft.id}`, admin,
            http.get(`/api/invoices/${billing.draft.id}`, () => HttpResponse.json(issued ? { ...inv, id: billing.draft.id } : billing.draft)),
            http.post(`/api/invoices/${billing.draft.id}/issue`, () => { calls.push("issue"); issued = true; return HttpResponse.json({ ...inv, id: billing.draft.id }); }),
            http.post(`/api/invoices/${billing.draft.id}/email`, () => {
                calls.push("email");
                return ++emails === 1
                    ? HttpResponse.json({ code: "email_unavailable", message: "The invoice could not be emailed. Please try again." }, { status: 503 })
                    : HttpResponse.json({ ...inv, id: billing.draft.id }, { status: 201 });
            }),
            ...handlers);
        const send = await screen.findByRole("dialog", { name: "Send invoice" });
        await userEvent.click(await within(send).findByRole("button", { name: "Send email" }));
        expect(await within(send).findByText("The invoice could not be emailed. Please try again.")).toBeInTheDocument();
        await userEvent.click(within(send).getByRole("button", { name: "Send email" }));
        await waitFor(() => expect(calls).toEqual(["issue", "email", "email"]));
    });

    it("won't save an invoice line that has an amount but no description", async () => {
        let saved = false;
        renderApp(path, admin,
            http.post(`/api/projects/${project.id}/invoices`, () => { saved = true; return HttpResponse.json(billing.draft, { status: 201 }); }),
            ...handlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "New invoice" }));
        const dialog = await screen.findByRole("dialog", { name: "New invoice" });
        await userEvent.type(within(dialog).getByLabelText("Line 1"), "Second milestone");
        // a second line with only an amount would have been dropped from the invoice without a word
        await userEvent.click(within(dialog).getByRole("button", { name: /Add line/ }));
        await userEvent.type(within(dialog).getByLabelText("Line 2 amount"), "2000");
        expect(await within(dialog).findByText("Each line needs a description and an amount.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
        expect(saved).toBe(false);
        await userEvent.type(within(dialog).getByLabelText("Line 2"), "Site visits");
        expect(within(dialog).queryByText("Each line needs a description and an amount.")).toBeNull();
        expect(saved).toBe(false);
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

    it("converts a backdated LBP payment at the rate of the day it was received", async () => {
        const recorded: { fxRate?: number }[] = [];
        const rates = [
            { ...billing.rates[0], id: 2, ratePerUsd: 90000, effectiveFrom: "2026-09-25" },
            { ...billing.rates[0], id: 1, ratePerUsd: 89500, effectiveFrom: "2026-09-01" },
        ];
        renderApp(path, admin,
            http.get("/api/exchange-rates", () => HttpResponse.json(rates)),
            http.post(`/api/projects/${project.id}/payments`, async ({ request }) => {
                recorded.push(await request.json() as { fxRate?: number });
                return HttpResponse.json(billing.domainPayments.items[0], { status: 201 });
            }),
            ...handlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Currency" }));
        await userEvent.click(screen.getByRole("option", { name: "LBP" }));
        const date = within(dialog).getByLabelText("Date received");
        await userEvent.clear(date);
        await userEvent.type(date, "2026-09-20{Enter}");
        await waitFor(() => expect(within(dialog).getByLabelText("Exchange rate on the day")).toHaveValue("89500"));
        await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
        await waitFor(() => expect(recorded).toEqual([expect.objectContaining({ currency: "LBP", fxRate: 89500, receivedOn: "2026-09-20" })]));
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

describe("a domain whose invoicing isn't set up", () => {
    const notSetUp = http.get("/api/billing-settings/:domain", () => HttpResponse.json(
        { type: "not_found", code: "billing_settings_missing", message: "Billing settings have not been set up for this domain yet." }, { status: 404 }));

    it("says so beside the invoices, with the way to set it up", async () => {
        renderApp(path, admin, notSetUp, ...handlers);
        const panel = await band();
        expect(await within(panel).findByText("Invoicing isn't set up for Design yet.")).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: "Set up invoicing" })).toHaveAttribute("href", "/design/settings?section=finance");
        // drafts are still fine
        expect(within(panel).getByRole("button", { name: "New invoice" })).toBeEnabled();
    });

    it("tells someone who can't set it up who can", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.BILLING_SETTINGS_MANAGE] }), notSetUp, ...handlers);
        const panel = await band();
        expect(await within(panel).findByText(/Ask an admin who manages the billing settings to set it up/)).toBeInTheDocument();
        expect(within(panel).queryByRole("link", { name: "Set up invoicing" })).not.toBeInTheDocument();
    });

    it("keeps a draft from being sent", async () => {
        renderApp(`${path}?send=${billing.draft.id}`, admin, notSetUp, ...handlers);
        const send = await screen.findByRole("dialog", { name: "Send invoice" });
        expect(await within(send).findByText("Invoicing isn't set up for Design yet.")).toBeInTheDocument();
        expect(within(send).getByRole("button", { name: "Send email" })).toBeDisabled();
    });

    it("saves a new invoice as a draft only", async () => {
        renderApp(`${path}?invoice=new`, admin, notSetUp, ...handlers);
        const dialog = await screen.findByRole("dialog", { name: "New invoice" });
        expect(await within(dialog).findByText("Invoicing isn't set up for Design yet.")).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Line 1"), "Second milestone");
        expect(within(dialog).getByRole("button", { name: "Save draft" })).toBeEnabled();
        expect(within(dialog).getByRole("button", { name: "Save and send…" })).toBeDisabled();
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
