import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { billing, billingHandlers } from "@/test/fixtures/billing";
import { financialsHandlers } from "@/test/fixtures/financials";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const project = projectWork.project;
const paid = billing.domainPayments.items[0];
const handlers = [...billingHandlers, ...projectWorkHandlers];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    URL.createObjectURL = vi.fn(() => "blob:receipt");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

/** The receipt calls, with what each was sent. */
function receiptApi() {
    const emailed: unknown[] = [];
    const downloaded: string[] = [];
    return {
        emailed,
        downloaded,
        handlers: [
            http.post("/api/payments/:id/receipt/email", async ({ params, request }) => {
                emailed.push({ id: Number(params.id), ...(await request.json() as object) });
                return new HttpResponse(null, { status: 204 });
            }),
            http.get("/api/payments/:id/receipt", ({ params }) => {
                downloaded.push(String(params.id));
                return new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } });
            }),
        ],
    };
}

describe("A payment's receipt", () => {
    it("follows recording a payment: emailed to the client's address, with the sender's own note", async () => {
        const api = receiptApi();
        renderApp(`/design/projects/${project.id}?tab=payments`, admin,
            http.post(`/api/projects/${project.id}/payments`, () => HttpResponse.json(paid, { status: 201 })),
            ...api.handlers, ...handlers);
        const band = (await screen.findByText("cash received - does not change profit or margin")).closest(".panel") as HTMLElement;
        await userEvent.click(within(band).getByRole("button", { name: "Record payment" }));
        const record = await screen.findByRole("dialog", { name: "Record a client payment" });
        const save = within(record).getByRole("button", { name: "Record payment" });
        // it waits for the project's invoices, to tell one from money on account
        await waitFor(() => expect(save).toBeEnabled());
        await userEvent.click(save);

        const dialog = await screen.findByRole("dialog", { name: "Send a receipt" });
        // the client's email on file, and the message the API writes, before anything is sent
        expect(await within(dialog).findByDisplayValue("mounir.aoun@mail.test")).toBeInTheDocument();
        expect(within(dialog).getByText(`Receipt R-${paid.id} - ${paid.project.title}`)).toBeInTheDocument();
        expect(within(dialog).getByText(/Thank you for your payment for .* This is to confirm that we received it on Sep 28, 2026\./)).toBeInTheDocument();

        await userEvent.type(within(dialog).getByLabelText(/Your note/), "Thanks for the quick transfer.");
        // the preview shows the note as the email will
        expect(dialog.querySelector(".mail-preview .receipt-note")).toHaveTextContent("Thanks for the quick transfer.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        await waitFor(() => expect(api.emailed).toEqual([{ id: paid.id, to: "mounir.aoun@mail.test", note: "Thanks for the quick transfer." }]));
        expect(await screen.findByText("Receipt emailed to mounir.aoun@mail.test")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Send a receipt" })).not.toBeInTheDocument());
    });

    it("says what is wrong with the address and the note beside them, and sends nothing", async () => {
        const api = receiptApi();
        renderApp(`/design/projects/${project.id}?receipt=${paid.id}`, admin, ...api.handlers, ...handlers);
        const dialog = await screen.findByRole("dialog", { name: "Send a receipt" });
        const to = await within(dialog).findByDisplayValue("mounir.aoun@mail.test");
        await userEvent.clear(to);
        await userEvent.type(to, "mounir");
        await userEvent.tab();
        expect(within(dialog).getByText("Enter an email like name@company.com.")).toBeInTheDocument();

        const note = within(dialog).getByLabelText(/Your note/);
        await userEvent.click(note);
        await userEvent.paste("x".repeat(1001));
        await userEvent.tab();
        expect(within(dialog).getByText("At most 1,000 characters.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        expect(api.emailed).toEqual([]);
    });

    it("can be downloaded instead, as the API's PDF", async () => {
        const api = receiptApi();
        renderApp(`/design/projects/${project.id}?receipt=${paid.id}`, admin, ...api.handlers, ...handlers);
        const dialog = await screen.findByRole("dialog", { name: "Send a receipt" });
        await userEvent.click(within(dialog).getByRole("tab", { name: "PDF" }));
        expect(within(dialog).queryByLabelText(/Your note/)).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
        await waitFor(() => expect(api.downloaded).toEqual([String(paid.id)]));
        expect(await screen.findByText("Receipt downloaded")).toBeInTheDocument();
    });

    it("shows why an email failed, and stays open to try again", async () => {
        renderApp(`/design/projects/${project.id}?receipt=${paid.id}`, admin,
            http.post("/api/payments/:id/receipt/email", () =>
                HttpResponse.json({ code: "email_delivery_failed", message: "The receipt could not be emailed, so nothing was recorded. Please try again." }, { status: 503 })),
            ...handlers);
        const dialog = await screen.findByRole("dialog", { name: "Send a receipt" });
        await within(dialog).findByDisplayValue("mounir.aoun@mail.test");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        expect(await within(dialog).findByText(/The receipt could not be emailed/)).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Send email" })).toBeEnabled();
    });

    it("is in a live payment's menu, for whoever records payments", async () => {
        const api = receiptApi();
        renderApp("/design/financials?tab=billing", admin, ...api.handlers, ...billingHandlers, ...financialsHandlers);
        const panel = (await screen.findByText("Payments received")).closest(".panel") as HTMLElement;
        await userEvent.click(await within(panel).findByRole("button", { name: "Payment of Sep 28 actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Download receipt" }));
        await waitFor(() => expect(api.downloaded).toEqual([String(paid.id)]));

        await userEvent.click(within(panel).getByRole("button", { name: "Payment of Sep 28 actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Send receipt…" }));
        expect(await screen.findByRole("dialog", { name: "Send a receipt" })).toBeInTheDocument();
    });

    it("isn't offered to whoever doesn't record payments, nor for a voided payment", async () => {
        const viewer = withPermissions(admin, { revoke: [P.PAYMENT_RECORD] });
        const voided = { ...paid, voidedAt: "2026-09-29T09:00:00Z", voidReason: "Recorded twice" };
        renderApp("/design/financials?tab=billing", viewer,
            http.get("/api/payments", () => HttpResponse.json({ ...billing.domainPayments, items: [voided, ...billing.domainPayments.items.slice(1)] })),
            ...billingHandlers, ...financialsHandlers);
        await screen.findByText("Payments received");
        for (const button of screen.queryAllByRole("button", { name: /actions$/ })) {
            await userEvent.click(button);
            expect(screen.queryByRole("button", { name: "Send receipt…" })).not.toBeInTheDocument();
            await userEvent.keyboard("{Escape}");
        }
    });
});
