import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const project = site.project;
const m = project.money!;
const path = `/execution/projects/${project.id}`;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const moneyPanel = async () => (await screen.findByText("Project money")).closest(".panel") as HTMLElement;

describe("an Execution site's overview", () => {
    it("shows its progress, expenses and labour, and what the client paid against what it cost", async () => {
        renderApp(`${path}?tab=overview`, karim, ...siteHandlers);
        const kpis = (await screen.findByText("Ground labour", { selector: ".kpi-label" })).closest(".kpis") as HTMLElement;
        expect(await within(kpis).findByText("4 weeks reported")).toBeInTheDocument();
        expect(within(kpis).getByText("1 / 3")).toBeInTheDocument();
        expect(within(kpis).getByText("Expenses", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(within(kpis).getByText(money.short(site.expenses.all.cost))).toBeInTheDocument();
        expect(within(kpis).getByText("4 records")).toBeInTheDocument();
        expect(within(kpis).getByText("Client owes")).toBeInTheDocument();
        // the money is on its own tab
        expect(screen.queryByText("Project money")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "Financials" }));

        const panel = await moneyPanel();
        expect(within(panel).getByText(money.exact(m.billing.received), { selector: ".kpi-val" })).toBeInTheDocument();
        expect(await within(panel).findByText(`1 payment · ${money.short(10000)} up front`)).toBeInTheDocument();
        expect(within(panel).getByText(money.exact(m.cashProfit!), { selector: ".kpi-val span" })).toHaveClass("up");
        expect(within(panel).getByText("Client still owes")).toBeInTheDocument();
        expect(within(panel).getByText(`+${money.exact(m.projectFee!)}`)).toBeInTheDocument();
        expect(within(panel).getByText(`+${money.exact(m.supervisionUsd!)}`)).toBeInTheDocument();
        // the expenses are a cost: the client isn't charged for them, and they carry no markup
        expect(within(panel).getByText("what was spent on site")).toBeInTheDocument();
        expect(within(panel).queryByText("Material profit")).not.toBeInTheDocument();
        expect(within(panel).queryByText(/Default material profit/)).not.toBeInTheDocument();

        const health = (await screen.findByText("Ground labour and profit")).closest(".panel") as HTMLElement;
        expect(await within(health).findByText("Thu, Oct 8")).toBeInTheDocument();
        expect(within(health).getByText(/≈ 7 working days of ground labour at 6 workers/)).toBeInTheDocument();
        expect(screen.getByText(/Payments can be recorded without an invoice/)).toBeInTheDocument();
    });

    it("has no material margins, client prices or markup on the Financials tab", async () => {
        renderApp(path, karim, ...siteHandlers);
        const panel = await moneyPanel();
        expect(screen.queryByText("Material margins")).not.toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Client price" })).not.toBeInTheDocument();
        expect(within(panel).queryByText("Material profit")).not.toBeInTheDocument();
        expect(within(panel).queryByText(/markup/i)).not.toBeInTheDocument();
        // nothing is "sent" to the client either
        expect(within(panel).queryByText("Not sent yet")).not.toBeInTheDocument();
        // the expenses table is on the Overview, not here
        expect(screen.queryByText("Expenses", { selector: ".panel-title" })).not.toBeInTheDocument();
    });

    it("completes a site whatever its expenses, with its price locked", async () => {
        const loft = site.losingProject;
        renderApp(`/execution/projects/${loft.id}?complete=1`, karim, ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: `Close ${loft.title}` });
        expect(within(dialog).queryByText(/been sent to the client/)).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Complete project" })).toBeEnabled();
        expect(within(dialog).getByText("Price is locked")).toBeInTheDocument();
        expect(within(dialog).getByText(/no BOQ or VO can be agreed or withdrawn/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(within(await moneyPanel()).queryByText("Not sent yet")).not.toBeInTheDocument();
    });

    it("says so when the site is losing money", async () => {
        renderApp(`/execution/projects/${site.losingProject.id}`, karim, ...siteHandlers);
        const health = (await screen.findByText("Ground labour and profit")).closest(".panel") as HTMLElement;
        expect(await within(health).findByText("Used up")).toBeInTheDocument();
        expect(within(health).getByText(`Losing money: ${money.exact(-site.losingProject.money!.cashProfit!)} below zero.`)).toBeInTheDocument();
        expect(within(await moneyPanel()).getByText(money.exact(site.losingProject.money!.cashProfit!), { selector: ".kpi-val span" })).toHaveClass("down");
    });

    it("keeps every figure of money from people without financial:view, and never asks for them", async () => {
        const asked: string[] = [];
        renderApp(path, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/projects/:id/site-money/timeline", () => { asked.push("timeline"); return HttpResponse.json(site.timeline); }),
            http.get("/api/payments", () => { asked.push("payments"); return HttpResponse.json(site.payments); }),
            ...siteHandlers);
        expect(await screen.findByText("4 weeks reported", { selector: ".kpi-delta span" })).toBeInTheDocument();
        expect(screen.queryByText("Client owes")).not.toBeInTheDocument();
        expect(screen.queryByText("Project money")).not.toBeInTheDocument();
        expect(screen.queryByText("Client payments")).not.toBeInTheDocument();
        expect(screen.queryByText("Ground labour and profit")).not.toBeInTheDocument();
        expect(screen.queryByText(/Received/)).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("shows an internal site's spending, with no client money", async () => {
        const internal = { ...project, billingType: "internal", client: null };
        renderApp(path, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)), ...siteHandlers);
        const panel = (await screen.findByText("Internal project")).closest(".panel") as HTMLElement;
        expect(within(panel).getByText(money.exact(m.cost.total))).toBeInTheDocument();
        expect(screen.queryByText("Client payments")).not.toBeInTheDocument();
        expect(screen.queryByText("Ground labour and profit")).not.toBeInTheDocument();
    });

    it("lists the site's money actions in the menu", async () => {
        renderApp(path, karim, ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        const menu = screen.getByRole("button", { name: "Put on hold" }).closest(".pop") as HTMLElement;
        for (const name of ["Pricing", "New invoice", "Record a client payment"]) {
            expect(within(menu).getByRole("button", { name })).toBeInTheDocument();
        }
        // a site records its costs in its Expenses list
        expect(within(menu).queryByRole("button", { name: "Add project expense" })).not.toBeInTheDocument();
    });

    it("offers no project expense window, even from a link", async () => {
        renderApp(`${path}?money=expense`, personas.superAdmin, ...siteHandlers);
        await moneyPanel();
        expect(screen.queryByRole("dialog", { name: "Add project expense" })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.queryByRole("button", { name: "Add project expense" })).not.toBeInTheDocument();
    });

    it("takes a payment on account even before anything is invoiced", async () => {
        renderApp(`/execution/projects/${site.losingProject.id}`, karim,
            http.get("/api/invoices", () => HttpResponse.json({ items: [], page: 1, pageSize: 100, totalCount: 0 })),
            http.get("/api/exchange-rates", () => HttpResponse.json([])),
            ...siteHandlers);
        const band = (await screen.findByText("Client payments")).closest(".panel") as HTMLElement;
        const record = within(band).getByRole("button", { name: "Record payment" });
        expect(record).toBeEnabled();
        await userEvent.click(record);
        expect(await screen.findByRole("dialog", { name: "Record a client payment" })).toBeInTheDocument();
    });
});

describe("the supervision and TVA", () => {
    it("are saved together, with why, and no markup", async () => {
        const saved: unknown[] = [];
        renderApp(`/execution/projects/${site.losingProject.id}`, karim,
            http.put("/api/projects/:id/pricing", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(site.losingProject); }),
            ...siteHandlers);
        await userEvent.click(within(await moneyPanel()).getByRole("button", { name: "Pricing" }));
        const dialog = await screen.findByRole("dialog", { name: "Pricing" });
        // site expenses are costs only: no material profit to set, and no chips for one
        expect(within(dialog).queryByText(/material profit/i)).toBeNull();
        expect(within(dialog).queryByLabelText(/material profit/i)).toBeNull();
        expect(within(dialog).queryByRole("button", { name: "25%" })).toBeNull();
        expect(within(dialog).queryByText(/Materials charged/)).toBeNull();
        // the work price comes from the agreed BOQs: shown, not typed in
        expect(within(dialog).getByText(money.exact(site.losingProject.money!.projectFee!))).toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Customer payment")).toBeNull();
        const supervision = within(dialog).getByLabelText("Supervision");
        expect(supervision).toHaveValue("10");
        await userEvent.clear(supervision);
        await userEvent.type(supervision, "7.5");
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "The client asked for a second floor");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saved).toEqual([{ supervisionRate: 0.075, tvaRate: 0, description: "The client asked for a second floor" }]));
        expect(saved[0]).not.toHaveProperty("projectFee");
        expect(saved[0]).not.toHaveProperty("materialMarkup");
        // an Execution site has no quote to send for the new price
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pricing" })).toBeNull());
        expect(screen.queryByRole("dialog", { name: "Send the quote?" })).toBeNull();
    });

    it("say the work price is set when a BOQ is agreed, while there is none", async () => {
        const unpriced = { ...project, money: { ...m, projectFee: null } };
        renderApp(`${path}?money=pricing`, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(unpriced)), ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Pricing" });
        expect(within(dialog).getByText("Set when a BOQ is agreed")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        const section = await screen.findByRole("region", { name: "Work price" });
        expect(within(section).getByText("Set when a BOQ is agreed")).toBeInTheDocument();
    });

    it("need why they change, and a change", async () => {
        const saved: unknown[] = [];
        renderApp(`${path}?money=pricing`, karim,
            http.put("/api/projects/:id/pricing", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(project); }),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Pricing" });
        const save = within(dialog).getByRole("button", { name: "Save" });
        await userEvent.click(save);
        expect(within(dialog).getByText("Change the supervision or the TVA, or cancel.")).toBeInTheDocument();
        expect(within(dialog).getByText("Say why the supervision or the TVA changes.")).toBeInTheDocument();
        expect(saved).toEqual([]);

        // the TVA alone is a change
        const tva = within(dialog).getByLabelText("TVA");
        await userEvent.clear(tva);
        await userEvent.type(tva, "11");
        expect(within(dialog).queryByText("Change the supervision or the TVA, or cancel.")).not.toBeInTheDocument();
        await userEvent.click(save);
        expect(saved).toEqual([]);
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "Imported tiles");
        await userEvent.click(save);
        await waitFor(() => expect(saved).toEqual([{ supervisionRate: 0.1, tvaRate: 0.11, description: "Imported tiles" }]));
    });

    it("show the work price first on the Financials tab, in bold, with the supervision, the TVA and the client total", async () => {
        const changes = [
            { id: 5, amount: 9000, previousAmount: 9000, materialMarkup: null, previousMaterialMarkup: null, supervisionRate: 0.12, previousSupervisionRate: 0.12, description: "Same supervision, new TVA", changedAt: "2026-09-12T09:00:00Z", changedBy: null },
            { id: 4, amount: 9000, previousAmount: 8000, materialMarkup: 0.15, previousMaterialMarkup: 0.1, supervisionRate: 0.12, previousSupervisionRate: 0.1, description: "A second floor", changedAt: "2026-09-10T09:00:00Z", changedBy: { id: 1, name: "Rana Haddad" } },
            { id: 3, amount: 8000, previousAmount: null, materialMarkup: 0.1, previousMaterialMarkup: null, supervisionRate: 0.1, previousSupervisionRate: null, description: "Agreed at the start", changedAt: "2026-05-01T09:00:00Z", changedBy: { id: 1, name: "Rana Haddad" } },
        ];
        renderApp(path, karim, http.get(`/api/projects/${project.id}/payment-changes`, () => HttpResponse.json(changes)), ...siteHandlers);
        expect(await screen.findByRole("tab", { name: "Financials", selected: true })).toBeInTheDocument();
        const section = await screen.findByRole("region", { name: "Work price" });
        expect(within(section).getByText(money.exact(m.projectFee!))).toHaveClass("pay-amount");
        expect(within(section).getByText("Supervision").closest("div")).toHaveTextContent(`${money.exact(m.supervisionUsd!)}${money.pct(0.1)} of the work price`);
        expect(within(section).getByText("TVA").closest("div")).toHaveTextContent("never on supervision");
        expect(within(section).getByText("Client total").closest("div")).toHaveTextContent(money.exact(m.revenueWithTva));
        expect(section.compareDocumentPosition(await moneyPanel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        await userEvent.click(within(section).getByRole("button", { name: "Edit pricing" }));
        expect(await screen.findByRole("dialog", { name: "Pricing" })).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

        await userEvent.click(within(section).getByRole("button", { name: "History" }));
        const dialog = await screen.findByRole("dialog", { name: "Payment history" });
        const rows = await within(dialog).findAllByRole("listitem");
        // the supervision is shown like the TVA, only when it changed
        expect(rows[0]).toHaveTextContent("Same supervision, new TVA");
        expect(rows[0]).not.toHaveTextContent("Supervision 12%");
        // a change made since the markup went has none to show; the older ones keep theirs
        expect(rows[0]).not.toHaveTextContent("Material profit");
        expect(rows[1]).toHaveTextContent(`${money.exact(8000)} → ${money.exact(9000)}`);
        expect(rows[1]).toHaveTextContent("Material profit 10% → 15%");
        expect(rows[1]).toHaveTextContent("Supervision 10% → 12%");
        expect(rows[1]).toHaveTextContent("A second floor");
        expect(rows[2]).toHaveTextContent("Material profit 10%");
        expect(rows[2]).not.toHaveTextContent("Supervision");
        expect(rows[2]).toHaveTextContent("Agreed at the start");
    });

    it("shows a field error from the API beside its field, until something is changed", async () => {
        renderApp(`${path}?money=pricing`, karim,
            http.put("/api/projects/:id/pricing", () => HttpResponse.json({
                type: "validation", code: "validation_failed", message: "One or more fields are invalid.", traceId: "t",
                errors: { supervisionRate: ["Change the supervision rate or the TVA."] },
            }, { status: 400 })),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Pricing" });
        const supervision = within(dialog).getByLabelText("Supervision");
        await userEvent.clear(supervision);
        await userEvent.type(supervision, "7");
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "The client asked");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("Change the supervision rate or the TVA.")).toBeInTheDocument();
        await userEvent.type(supervision, "5");
        await waitFor(() => expect(within(dialog).queryByText("Change the supervision rate or the TVA.")).not.toBeInTheDocument());
    });

    it("can't be changed without project:pricing_manage, even from a link", async () => {
        renderApp(`${path}?money=pricing`, withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }), ...siteHandlers);
        const panel = await moneyPanel();
        expect(within(panel).queryByRole("button", { name: "Pricing" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit pricing" })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        const menu = screen.getByRole("button", { name: "Put on hold" }).closest(".pop") as HTMLElement;
        expect(within(menu).queryByRole("button", { name: "Pricing" })).not.toBeInTheDocument();
    });

    it("are locked once the site is finalised", async () => {
        const locked = { ...project, money: { ...m, isLocked: true } };
        renderApp(path, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(locked)), ...siteHandlers);
        const panel = await moneyPanel();
        expect(within(panel).queryByRole("button", { name: "Pricing" })).not.toBeInTheDocument();
        const section = screen.getByRole("region", { name: "Work price" });
        expect(within(section).getByText("locked")).toBeInTheDocument();
        expect(within(section).queryByRole("button", { name: "Edit pricing" })).not.toBeInTheDocument();
    });
});
