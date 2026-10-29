import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { billing, billingHandlers } from "@/test/fixtures/billing";
import { financialsHandlers } from "@/test/fixtures/financials";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// Admins a super admin has handed the money to: admins don't hold it by default
const designAdmin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const designProject = projectWork.project;
const designPath = `/design/projects/${designProject.id}`;
const billingPath = "/design/financials?tab=billing";
const paid = billing.domainPayments.items[0];
const concrete = { id: 1, name: "Concrete" };

const refusal = (code: string, message: string, errors: Record<string, string[]> | null = null, status = 422) =>
    HttpResponse.json({ type: errors ? "validation" : "business_rule", code, message, errors, traceId: "t" }, { status });
const withLabel = (accountLabel: typeof concrete | null) => http.get("/api/payments", () =>
    HttpResponse.json({ ...billing.domainPayments, items: [{ ...paid, accountLabel }, ...billing.domainPayments.items.slice(1)] }));
const band = async () => (await screen.findByText("Client payments")).closest(".panel") as HTMLElement;
const received = async () => (await screen.findByText("Payments received")).closest(".panel") as HTMLElement;
const openLabel = async () => {
    await userEvent.click(await within(await received()).findByRole("button", { name: "Payment of Sep 28 actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Label…" }));
    return screen.findByRole("dialog", { name: "Label payment" });
};

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("recording a payment under an account label", () => {
    const designHandlers = [...billingHandlers, ...projectWorkHandlers];

    it("offers the open labels on a Design project, and files the payment under the one chosen", async () => {
        const recorded: unknown[] = [];
        renderApp(designPath, designAdmin,
            http.post(`/api/projects/${designProject.id}/payments`, async ({ request }) => { recorded.push(await request.json()); return HttpResponse.json(paid, { status: 201 }); }),
            ...designHandlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
        await within(dialog).findByText(/^Balance on /);
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await screen.findByRole("option", { name: "Concrete" });
        expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["No label", "Concrete", "Finishing", "Permits"]);
        await userEvent.click(screen.getByRole("option", { name: "Concrete" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
        await waitFor(() => expect(recorded).toEqual([expect.objectContaining({ accountLabelId: concrete.id })]));
    });

    it("files an Execution site's payment under a label too, and sends none when none is chosen", async () => {
        const recorded: Record<string, unknown>[] = [];
        const lobby = site.losingProject;
        renderApp(`/execution/projects/${lobby.id}`, karim,
            http.get("/api/invoices", () => HttpResponse.json({ items: [], page: 1, pageSize: 100, totalCount: 0 })),
            http.get("/api/exchange-rates", () => HttpResponse.json([])),
            http.post("/api/projects/:id/payments", async ({ request }) => { recorded.push(await request.json() as Record<string, unknown>); return HttpResponse.json(paid, { status: 201 }); }),
            ...siteHandlers);
        for (const label of ["Finishing", null]) {
            await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
            const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
            await within(dialog).findByText("On account - no invoice yet");
            await userEvent.type(within(dialog).getByLabelText("Amount received"), "2500");
            if (label) {
                await userEvent.click(within(dialog).getByLabelText("Account label"));
                await userEvent.click(await screen.findByRole("option", { name: label }));
            }
            await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Record a client payment" })).not.toBeInTheDocument());
        }
        expect(recorded).toHaveLength(2);
        expect(recorded[0]).toMatchObject({ amount: 2500, accountLabelId: 2 });
        expect(recorded[1]).toMatchObject({ amount: 2500 });
        expect(recorded[1]).not.toHaveProperty("accountLabelId");
    });

    it("shows the API's refusal of a label beside the label, until another is picked", async () => {
        const message = "Permits is archived, so a new payment can't be filed under it.";
        renderApp(designPath, designAdmin,
            http.post(`/api/projects/${designProject.id}/payments`, () => refusal("account_label_archived", message)),
            ...designHandlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
        await within(dialog).findByText(/^Balance on /);
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await userEvent.click(await screen.findByRole("option", { name: "Permits" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
        // once, beside the label: not repeated in the footer
        expect(await within(dialog).findAllByText(message)).toHaveLength(1);
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await userEvent.click(await screen.findByRole("option", { name: "Concrete" }));
        await waitFor(() => expect(within(dialog).queryByText(message)).not.toBeInTheDocument());
    });

    it("shows a label the API names in a field error beside the label", async () => {
        renderApp(designPath, designAdmin,
            http.post(`/api/projects/${designProject.id}/payments`, () => refusal("validation_failed", "One or more fields are invalid.", { accountLabelId: ["That account label doesn't exist."] }, 400)),
            ...designHandlers);
        await userEvent.click(within(await band()).getByRole("button", { name: "Record payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Record a client payment" });
        await within(dialog).findByText(/^Balance on /);
        await userEvent.click(within(dialog).getByRole("button", { name: "Record payment" }));
        expect(await within(dialog).findByText("That account label doesn't exist.")).toBeInTheDocument();
        expect(within(dialog).queryByText("One or more fields are invalid.")).not.toBeInTheDocument();
    });
});

describe("the label on payments", () => {
    const handlers = [...billingHandlers, ...financialsHandlers];

    it("is shown in the payment list, a dash where there is none", async () => {
        renderApp(billingPath, designAdmin, withLabel(concrete), ...handlers);
        const panel = await received();
        expect(await within(panel).findByRole("columnheader", { name: "Account label" })).toBeInTheDocument();
        const rows = within(panel).getAllByRole("row");
        expect(within(rows[1]).getByText("Concrete")).toBeInTheDocument();
        expect(within(rows[2]).queryByText("Concrete")).not.toBeInTheDocument();
        expect(within(rows[2]).getAllByRole("cell")[5]).toHaveTextContent("-");
    });

    it("is shown beside a payment made against an invoice", async () => {
        const inv = billing.issued;
        renderApp(`${designPath}?invoice=${inv.id}`, designAdmin,
            http.get("/api/payments", () => HttpResponse.json({ ...billing.domainPayments, items: [{ ...paid, invoiceId: inv.id, accountLabel: concrete }] })),
            ...billingHandlers, ...projectWorkHandlers);
        const dialog = await screen.findByRole("dialog", { name: inv.number! });
        expect(await within(dialog).findByText("Sep 28 · CHQ 55120 · Concrete")).toBeInTheDocument();
    });
});

describe("the Label action", () => {
    const handlers = [...billingHandlers, ...financialsHandlers];
    const put = (answer: (body: { accountLabelId: number | null }) => Response, calls: unknown[] = []) =>
        http.put("/api/payments/:id/label", async ({ params, request }) => {
            const body = await request.json() as { accountLabelId: number | null };
            calls.push({ id: params.id, ...body });
            return answer(body);
        });

    it("files a payment under a label, which the list then shows", async () => {
        const calls: unknown[] = [];
        let filed: typeof concrete | null = null;
        renderApp(billingPath, designAdmin,
            http.get("/api/payments", () => HttpResponse.json({ ...billing.domainPayments, items: [{ ...paid, accountLabel: filed }, ...billing.domainPayments.items.slice(1)] })),
            put((body) => { filed = body.accountLabelId === 1 ? concrete : null; return HttpResponse.json({ ...paid, accountLabel: filed }); }, calls),
            ...handlers);
        const dialog = await openLabel();
        expect(within(dialog).getByLabelText("Account label")).toHaveTextContent("No label");
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await userEvent.click(await screen.findByRole("option", { name: "Concrete" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(calls).toEqual([{ id: String(paid.id), accountLabelId: 1 }]));
        expect(await screen.findByText("Filed under Concrete")).toBeInTheDocument();
        const rows = within(await received()).getAllByRole("row");
        await waitFor(() => expect(within(rows[1]).getByText("Concrete")).toBeInTheDocument());
    });

    it("changes a label, clears it, and keeps an archived label of its own on offer as archived", async () => {
        const calls: unknown[] = [];
        renderApp(billingPath, designAdmin, withLabel({ id: 9, name: "Old permits" }), put(() => HttpResponse.json({ ...paid, accountLabel: null }), calls), ...handlers);
        const dialog = await openLabel();
        const select = within(dialog).getByLabelText("Account label");
        await waitFor(() => expect(select).toHaveTextContent("Old permits (archived)"));
        await userEvent.click(select);
        await screen.findByRole("option", { name: "Concrete" });
        expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["No label", "Concrete", "Finishing", "Permits", "Old permits (archived)"]);
        await userEvent.click(screen.getByRole("option", { name: "No label" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(calls).toEqual([{ id: String(paid.id), accountLabelId: null }]));
        expect(await screen.findByText("Label cleared")).toBeInTheDocument();
    });

    it("sends nothing when the label wasn't changed", async () => {
        const calls: unknown[] = [];
        renderApp(billingPath, designAdmin, withLabel(concrete), put(() => HttpResponse.json(paid), calls), ...handlers);
        const dialog = await openLabel();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Label payment" })).not.toBeInTheDocument());
        expect(calls).toEqual([]);
    });

    it("is refused on a payment the API says is voided, with its message", async () => {
        const message = "This payment was voided, so its label can't be changed.";
        renderApp(billingPath, designAdmin, put(() => refusal("payment_already_voided", message)), ...handlers);
        const dialog = await openLabel();
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await userEvent.click(await screen.findByRole("option", { name: "Finishing" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    });

    it("shows an archived label's refusal beside the label", async () => {
        const message = "Permits is archived, so a payment can't be filed under it.";
        renderApp(billingPath, designAdmin, put(() => refusal("account_label_archived", message)), ...handlers);
        const dialog = await openLabel();
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await userEvent.click(await screen.findByRole("option", { name: "Permits" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findAllByText(message)).toHaveLength(1);
        // the one alert is the label's own, not a second one in the footer
        expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
    });

    it("isn't offered on a voided payment", async () => {
        const voided = { ...paid, voidedAt: "2026-09-29T09:00:00Z", voidReason: "Recorded twice" };
        renderApp(billingPath, designAdmin,
            http.get("/api/payments", () => HttpResponse.json({ ...billing.domainPayments, items: [voided, ...billing.domainPayments.items.slice(1)] })),
            ...handlers);
        const panel = await received();
        await within(panel).findByText("ID-2026-002");
        // the live payment below it keeps its menu; the voided one has none
        expect(within(panel).getAllByRole("button", { name: /^Payment of .* actions$/ })).toHaveLength(1);
        expect(within(panel).queryByRole("button", { name: "Payment of Sep 28 actions" })).not.toBeInTheDocument();
    });

    it("is only for those who can record payments", async () => {
        renderApp(billingPath, withPermissions(designAdmin, { revoke: [P.PAYMENT_RECORD] }), ...handlers);
        await userEvent.click(await within(await received()).findByRole("button", { name: "Payment of Sep 28 actions" }));
        // the menu is there for voiding, without the label
        expect(screen.getByRole("button", { name: "Void payment…" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Label…" })).not.toBeInTheDocument();
    });

    it("is offered to someone who holds both payment:record and financial:view", async () => {
        renderApp(billingPath, designAdmin, ...handlers);
        await userEvent.click(await within(await received()).findByRole("button", { name: "Payment of Sep 28 actions" }));
        expect(screen.getByRole("button", { name: "Label…" })).toBeInTheDocument();
    });
});
