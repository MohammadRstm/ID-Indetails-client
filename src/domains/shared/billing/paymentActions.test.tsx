import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { billing, billingHandlers } from "@/test/fixtures/billing";
import { financialsHandlers } from "@/test/fixtures/financials";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const path = "/design/financials?tab=billing";
const paid = billing.domainPayments.items[0];
const onAccount = { ...paid, id: 31, invoiceId: null, invoiceNumber: null, amountUsd: 1500, amount: 1500 };
const withOnAccount = http.get("/api/payments", () => HttpResponse.json({ ...billing.domainPayments, items: [onAccount, ...billing.domainPayments.items] }));
const received = async () => (await screen.findByText("Payments received")).closest(".panel") as HTMLElement;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Correcting a payment", () => {
    it("voids one recorded in error, with a reason", async () => {
        const voided: unknown[] = [];
        // once voided, the payment leaves the list the window was opened from
        renderApp(path, admin,
            http.get("/api/payments", () => HttpResponse.json(voided.length ? { ...billing.domainPayments, items: billing.domainPayments.items.slice(1) } : billing.domainPayments)),
            http.post("/api/payments/:id/void", async ({ params, request }) => { voided.push({ id: params.id, ...(await request.json() as object) }); return HttpResponse.json({ ...paid, voidedAt: "2026-09-30T09:00:00Z" }); }),
            ...billingHandlers, ...financialsHandlers);
        const panel = await received();
        await userEvent.click(await within(panel).findByRole("button", { name: "Payment of Sep 28 actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Void payment…" }));
        const dialog = await screen.findByRole("dialog", { name: "Void payment" });
        // the reason is required, and pressing Void without one says so
        await userEvent.click(within(dialog).getByRole("button", { name: "Void payment" }));
        expect(within(dialog).getByText("Say why it is being voided: the reason stays in the register.")).toBeInTheDocument();
        expect(voided).toEqual([]);
        await userEvent.type(within(dialog).getByLabelText("Reason"), "Recorded twice");
        await userEvent.click(within(dialog).getByRole("button", { name: "Void payment" }));
        await waitFor(() => expect(voided).toEqual([{ id: String(paid.id), reason: "Recorded twice" }]));
        expect(await screen.findByText("Payment voided")).toBeInTheDocument();
    });

    it("applies money received on account to an issued invoice", async () => {
        const applied: unknown[] = [];
        const open = billing.projectInvoices.items.find((i) => i.issuedAt && i.status !== "void" && (i.balance ?? 0) > 0.5)!;
        renderApp(path, admin, withOnAccount,
            http.put("/api/payments/:id/invoice", async ({ params, request }) => { applied.push({ id: params.id, ...(await request.json() as object) }); return HttpResponse.json(onAccount); }),
            ...billingHandlers, ...financialsHandlers);
        const panel = await received();
        const rows = await within(panel).findAllByRole("button", { name: /^Payment of .* actions$/ });
        await userEvent.click(rows[0]);
        expect(screen.getByRole("button", { name: "Apply to an invoice…" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Apply to an invoice…" }));
        const dialog = await screen.findByRole("dialog", { name: "Apply to an invoice" });
        await userEvent.click(within(dialog).getByLabelText("Invoice"));
        await userEvent.click(await screen.findByRole("option", { name: new RegExp(`^${open.number}`) }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
        await waitFor(() => expect(applied).toEqual([{ id: "31", invoiceId: open.id }]));
    });

    it("offers only invoices with room for the whole payment", async () => {
        const big = { ...onAccount, amountUsd: 1_000_000, amount: 1_000_000 };
        renderApp(path, admin, http.get("/api/payments", () => HttpResponse.json({ ...billing.domainPayments, items: [big] })), ...billingHandlers, ...financialsHandlers);
        const panel = await received();
        await userEvent.click(await within(panel).findByRole("button", { name: /^Payment of .* actions$/ }));
        await userEvent.click(screen.getByRole("button", { name: "Apply to an invoice…" }));
        const dialog = await screen.findByRole("dialog", { name: "Apply to an invoice" });
        expect(await within(dialog).findByText(/No issued invoice on this project has .* left to pay\./)).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Apply" })).toBeDisabled();
    });

    it("offers nothing to someone who may neither record nor void payments", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.PAYMENT_RECORD, P.PAYMENT_VOID] }), withOnAccount, ...billingHandlers, ...financialsHandlers);
        const panel = await received();
        await within(panel).findByText("ID-2026-002");
        expect(within(panel).queryByRole("button", { name: /actions$/ })).not.toBeInTheDocument();
    });

    it("doesn't apply a payment that is already against an invoice", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.PAYMENT_VOID] }), ...billingHandlers, ...financialsHandlers);
        const panel = await received();
        await within(panel).findByText("ID-2026-002");
        expect(within(panel).queryByRole("button", { name: /actions$/ })).not.toBeInTheDocument();
    });
});
