import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
// Mar Mikhael loft renovation: four expenses
const open = site.losingProject;
// the expenses are on the Overview; someone who sees money opens on the Financials tab
const openPath = `/execution/projects/${open.id}?tab=overview`;
// Achrafieh Towers lobby: four expenses on a site with an agreed work price
const pricedPath = `/execution/projects/${site.project.id}?tab=overview`;
const plasterboard = site.openExpenses.items[0];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const panel = async () => (await screen.findByText("What has been spent on site, and what it cost. Click any cell to change it.")).closest(".panel") as HTMLElement;
const dollars = (total: number, count: number) => ({ count, cost: total, byCurrency: [{ currency: "USD", total }] });
const listWith = (items: Schemas["SiteExpenseResponse"][], patch: Partial<Schemas["SiteExpenseListResponse"]> = {}) =>
    HttpResponse.json({ ...site.openExpenses, items, ...patch });
/** The API refusing a pound expense on a day with no exchange rate. */
const noRate = () => HttpResponse.json({
    type: "business_rule", code: "exchange_rate_missing", errors: null, traceId: "t",
    message: "There is no LBP exchange rate in force on 2026-09-30. Add one first, or record the expense in USD.",
}, { status: 422 });
const NO_RATE = "There is no LBP exchange rate in force on 2026-09-30. Add one first, or record the expense in USD.";
/** Two expenses filed under an account label that has since been archived: it isn't on offer any more. */
const filedUnderArchived = (index: number) => site.openExpenses.items.map((e, i) => (i === index ? { ...e, accountLabel: { id: 9, name: "Old permits" } } : e));

/** Types into a grid cell and leaves it with Enter, as site staff do. */
async function typeInto(cell: HTMLElement, text: string) {
    await userEvent.click(cell);
    await userEvent.clear(cell);
    if (text) await userEvent.type(cell, text);
    await userEvent.keyboard("{Enter}");
}

describe("the expenses on a site", () => {
    it("are listed with their cost, currency, day, category and who added them, and carry no client price", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("4 expenses · 4 kinds of item")).toBeInTheDocument();
        expect(within(p).getByLabelText("Item 1")).toHaveValue("Plasterboard");
        expect(within(p).getByLabelText("Currency 1")).toHaveValue("USD");
        expect(within(p).getByLabelText("Supplier / payee 1")).toHaveValue("Gypsum Lb");
        expect(within(p).getByLabelText("Spent on 1")).toHaveValue("Sep 30, 2026");
        expect(within(p).getByLabelText("Category 1")).toHaveValue("materials");
        expect(within(p).getByLabelText("Account label 1")).toHaveValue("");
        expect(within(p).getAllByText("Nour Aziz")).toHaveLength(4);
        for (const gone of ["Client price 1", "Markup 1"]) expect(within(p).queryByLabelText(gone)).not.toBeInTheDocument();
        for (const gone of ["Charged to the client", "Material profit", "Client price"]) expect(within(p).queryByText(gone)).not.toBeInTheDocument();
        // the old margins panel is gone with the prices
        expect(screen.queryByText("Material margins")).not.toBeInTheDocument();
    });

    it("show the same to people who don't see money", async () => {
        renderApp(openPath, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW, P.PROJECT_PRICING_MANAGE] }), ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Item 1")).toBeInTheDocument();
        expect(within(p).queryByLabelText("Client price 1")).not.toBeInTheDocument();
        expect(within(p).queryByText("Material profit")).not.toBeInTheDocument();
    });

    it("show the dollars apart from the pounds, which are never added to them", async () => {
        const scaffolding = {
            ...plasterboard, id: 20, name: "Scaffolding", quantity: null, unit: null, unitCost: null, cost: 4500000, currency: "LBP", category: "equipment" as const, spentOn: "2026-09-28",
        };
        const totals = { count: 5, cost: 6726, byCurrency: [{ currency: "USD", total: 6726 }, { currency: "LBP", total: 4500000 }] };
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", () => listWith([scaffolding, ...site.openExpenses.items], { totalCount: 5, all: totals, matching: totals })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Currency 1")).toHaveValue("LBP");
        expect(within(p).getByLabelText("Amount 1")).toHaveValue("4,500,000");
        expect(within(p).getByLabelText("Category 1")).toHaveValue("equipment");
        // one total for the dollars and one for the pounds
        expect(within(p).getByText("Expenses · USD")).toBeInTheDocument();
        expect(within(p).getByText(money.exact(6726))).toBeInTheDocument();
        expect(within(p).getByText("Expenses · LBP")).toBeInTheDocument();
        expect(within(p).getByText("4,500,000 LBP")).toBeInTheDocument();
        // and the pounds beside the headline, not in it
        expect(within(p).getByText(money.fmt(6726))).toBeInTheDocument();
        expect(within(p).getByText("+ 4.5M LBP")).toBeInTheDocument();
        expect(within(p).queryByText(money.exact(4506726))).not.toBeInTheDocument();
    });

    it("saves a changed cell, with the amount following quantity × unit cost", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Qty 1"), "100");
        await waitFor(() => expect(saved).toEqual([{
            name: "Plasterboard", quantity: 100, unit: "sheet", unitCost: 11, amount: null, supplier: "Gypsum Lb", note: null,
            currency: "USD", spentOn: "2026-09-30", category: "materials", accountLabelId: null,
        }]));
    });

    it("takes an amount typed over quantity × unit cost as a new unit cost", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        await typeInto(await within(await panel()).findByLabelText("Amount 1"), "900");
        await waitFor(() => expect(saved).toEqual([expect.objectContaining({ quantity: 90, unitCost: 10, amount: null })]));
    });

    it("keeps the amount when the quantity is cleared, and drops its unit", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        await typeInto(await within(await panel()).findByLabelText("Qty 1"), "");
        await waitFor(() => expect(saved).toEqual([expect.objectContaining({ quantity: null, unit: null, unitCost: 11, amount: 990 })]));
    });

    it("saves a new currency, category, account label and day, and sends the rest as it was", async () => {
        const saved: Record<string, unknown>[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => {
                saved.push(await request.json() as Record<string, unknown>);
                return HttpResponse.json(plasterboard);
            }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.selectOptions(await within(p).findByLabelText("Currency 1"), "LBP");
        await waitFor(() => expect(saved[0]).toMatchObject({ currency: "LBP", category: "materials", accountLabelId: null }));
        await userEvent.selectOptions(within(p).getByLabelText("Category 1"), "contractor");
        await waitFor(() => expect(saved[1]).toMatchObject({ category: "contractor" }));
        const label = within(p).getByLabelText("Account label 1");
        await waitFor(() => expect(within(label).getByRole("option", { name: "Permits" })).toBeInTheDocument());
        await userEvent.selectOptions(label, "3");
        await waitFor(() => expect(saved[2]).toMatchObject({ accountLabelId: 3 }));
        // a day is typed the way people write it
        await typeInto(within(p).getByLabelText("Spent on 1"), "1/9/2026");
        await waitFor(() => expect(saved[3]).toMatchObject({ spentOn: "2026-09-01", name: "Plasterboard", quantity: 90 }));
    });

    it("won't save a day it can't read, and says why", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        const day = await within(await panel()).findByLabelText("Spent on 1");
        await typeInto(day, "later");
        expect(await screen.findByText("Not a date - try 23/9/2026 or Sep 23")).toBeInTheDocument();
        expect(day).toHaveValue("Sep 30, 2026");
        expect(saved).toEqual([]);
    });

    it("keeps an expense's archived label when another cell changes, and offers it to that expense only", async () => {
        const saved: Record<string, unknown>[] = [];
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", () => listWith(filedUnderArchived(0))),
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => { saved.push(await request.json() as Record<string, unknown>); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        const p = await panel();
        const own = await within(p).findByLabelText("Account label 1");
        expect(own).toHaveValue("9");
        expect(await within(own).findByRole("option", { name: "Old permits (archived)" })).toBeInTheDocument();
        expect(within(own).getAllByRole("option").map((o) => o.textContent)).toEqual(["No label", "Concrete", "Finishing", "Permits", "Old permits (archived)"]);
        // nobody else can newly pick it
        expect(within(within(p).getByLabelText("Account label 2")).queryByRole("option", { name: /Old permits/ })).not.toBeInTheDocument();
        await typeInto(within(p).getByLabelText("Item 1"), "Plasterboard 12mm");
        await waitFor(() => expect(saved[0]).toMatchObject({ name: "Plasterboard 12mm", accountLabelId: 9 }));
    });

    it("says why a pound expense wasn't saved when no exchange rate covers its day, and shows the old currency again", async () => {
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", () => noRate()),
            ...siteHandlers);
        const currency = await within(await panel()).findByLabelText("Currency 1");
        await userEvent.selectOptions(currency, "LBP");
        expect(await screen.findByText(NO_RATE)).toBeInTheDocument();
        expect(screen.getByText("Not saved")).toBeInTheDocument();
        await waitFor(() => expect(currency).toHaveValue("USD"));
    });

    it("start the next change on a row from what was just saved, before the list comes back", async () => {
        const saved: Record<string, unknown>[] = [];
        let release = () => {};
        const held = new Promise<void>((resolve) => { release = resolve; });
        renderApp(openPath, karim,
            // the list is slow to come back once something is saved
            http.get("/api/projects/:id/site-expenses", async () => { if (saved.length > 0) await held; return listWith(site.openExpenses.items); }),
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => {
                const body = await request.json() as Record<string, number>;
                saved.push(body);
                return HttpResponse.json({ ...plasterboard, quantity: body.quantity, unitCost: body.unitCost, cost: body.quantity * body.unitCost });
            }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Qty 1"), "100");
        await waitFor(() => expect(saved).toHaveLength(1));
        await waitFor(() => expect(within(p).getByLabelText("Amount 1")).toHaveValue("1,100"));
        await typeInto(within(p).getByLabelText("Unit cost 1"), "12");
        await waitFor(() => expect(saved[1]).toMatchObject({ quantity: 100, unitCost: 12 }));
        release();
    });

    it("don't save a cell that was only passed through", async () => {
        let saves = 0;
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", () => { saves++; return HttpResponse.json({ ...plasterboard, unitCost: 10, cost: 900 }); }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Amount 1"), "900");
        // Enter moved on to the currency, then the supplier: both are left as they were
        expect(within(p).getByLabelText("Currency 1")).toHaveFocus();
        await userEvent.keyboard("{Enter}");
        expect(within(p).getByLabelText("Supplier / payee 1")).toHaveFocus();
        await userEvent.keyboard("{Enter}");
        await waitFor(() => expect(saves).toBe(1));
    });

    it("won't save an expense without an item", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/site-expenses/:expenseId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        const item = await within(await panel()).findByLabelText("Item 1");
        await typeInto(item, "");
        expect(await screen.findByText("Say what the item is")).toBeInTheDocument();
        expect(item).toHaveValue("Plasterboard");
        expect(saved).toEqual([]);
    });

    it("stay open to change and removal by whoever manages them, on a site with an agreed price", async () => {
        renderApp(pricedPath, karim, ...siteHandlers);
        const p = await panel();
        for (const cell of ["Item 1", "Qty 1", "Unit 1", "Unit cost 1", "Amount 1", "Currency 1", "Supplier / payee 1", "Spent on 1", "Category 1", "Account label 1", "Note 1"]) {
            expect(await within(p).findByLabelText(cell)).toBeEnabled();
        }
        expect(within(p).getAllByRole("button", { name: "Delete row" })).toHaveLength(4);
    });

    it("lock what someone else added for people who may only change their own", async () => {
        const theirs = { ...plasterboard, canEdit: false };
        renderApp(openPath, withPermissions(karim, { revoke: [P.MATERIAL_MANAGE, P.PROJECT_PRICING_MANAGE] }),
            http.get("/api/projects/:id/site-expenses", () => listWith([theirs, ...site.openExpenses.items.slice(1)])),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Item 1")).toBeDisabled();
        expect(within(p).getByLabelText("Supplier / payee 1")).toBeDisabled();
        expect(within(p).getByLabelText("Currency 1")).toBeDisabled();
        expect(within(p).getByLabelText("Category 1")).toBeDisabled();
        expect(within(p).getByLabelText("Account label 1")).toBeDisabled();
        expect(within(p).getByLabelText("Item 2")).toBeEnabled();
        expect(within(p).getByLabelText("Category 2")).toBeEnabled();
        expect(within(p).getAllByRole("button", { name: "Delete row" })).toHaveLength(3);
    });

    it("are only read by someone who may not add any", async () => {
        renderApp(openPath, withPermissions(karim, { revoke: [P.MATERIAL_CREATE, P.MATERIAL_MANAGE] }),
            http.get("/api/projects/:id/site-expenses", () => listWith(site.openExpenses.items.map((e) => ({ ...e, canEdit: false })), { canAdd: false })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Item 1")).toBeDisabled();
        expect(within(p).queryByRole("button", { name: "Add expenses" })).not.toBeInTheDocument();
        expect(within(p).queryByRole("button", { name: "Delete row" })).not.toBeInTheDocument();
    });

    it("are removed with two clicks", async () => {
        const removed: string[] = [];
        renderApp(openPath, karim,
            http.delete("/api/projects/:id/site-expenses/:expenseId", ({ params }) => { removed.push(String(params.expenseId)); return new HttpResponse(null, { status: 204 }); }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click((await within(p).findAllByRole("button", { name: "Delete row" }))[0]);
        expect(removed).toEqual([]);
        await userEvent.click(within(p).getByRole("button", { name: "Delete?" }));
        await waitFor(() => expect(removed).toEqual([String(plasterboard.id)]));
        expect(await screen.findByText("Plasterboard removed")).toBeInTheDocument();
    });

    it("are filtered on the server by item, and say how many match", async () => {
        const asked: (string | null)[] = [];
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", ({ request }) => {
                const type = new URL(request.url).searchParams.get("type");
                if (new URL(request.url).searchParams.get("pageSize") === "30") asked.push(type);
                return type ? listWith([plasterboard], { matching: { count: 1, cost: 990, byCurrency: [{ currency: "USD", total: 990 }] }, totalCount: 1 }) : listWith(site.openExpenses.items);
            }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Filter by item"));
        await userEvent.click(screen.getByRole("option", { name: "Plasterboard (1)" }));
        expect(await within(p).findByText("1 of 4 shown")).toBeInTheDocument();
        expect(within(p).getAllByText("Expenses · Plasterboard")).toHaveLength(2);
        expect(asked).toContain("plasterboard");
        await userEvent.click(within(p).getByRole("button", { name: "Clear" }));
        expect(await within(p).findByText("4 expenses · 4 kinds of item")).toBeInTheDocument();
    });

    it("are filtered on the server by category and by account label", async () => {
        const asked: { category: string | null; accountLabelId: string | null }[] = [];
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", ({ request }) => {
                const q = new URL(request.url).searchParams;
                if (q.get("pageSize") === "30") asked.push({ category: q.get("category"), accountLabelId: q.get("accountLabelId") });
                return listWith(site.openExpenses.items);
            }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Filter by category"));
        await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Contractor" }));
        await waitFor(() => expect(asked).toContainEqual({ category: "contractor", accountLabelId: null }));
        await userEvent.click(await within(p).findByLabelText("Filter by account label"));
        await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Permits" }));
        await waitFor(() => expect(asked).toContainEqual({ category: "contractor", accountLabelId: "3" }));
        expect(await within(p).findByRole("button", { name: "Clear" })).toBeInTheDocument();
    });

    it("are filtered by the day they were spent, not the day they were added", async () => {
        const asked: (string | null)[] = [];
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", ({ request }) => {
                const q = new URL(request.url).searchParams;
                if (q.get("pageSize") === "30") asked.push(q.get("from"));
                return listWith(site.openExpenses.items);
            }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Filter by date spent"));
        await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "This month" }));
        await waitFor(() => expect(asked).toContain("2026-09-01"));
    });

    it("start with an invitation to add the first ones", async () => {
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", () => listWith([], { all: dollars(0, 0), matching: dollars(0, 0), totalCount: 0, types: [], suppliers: [], addedBy: [] })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("No expenses recorded yet")).toBeInTheDocument();
        expect(within(p).getAllByRole("button", { name: "Add expenses" })).toHaveLength(2);
    });

    it("are closed to new entries once the site is done", async () => {
        const done = { ...open, status: "completed", completedAt: "2026-09-29T12:00:00Z" };
        renderApp(openPath, karim,
            http.get("/api/projects/:id", () => HttpResponse.json(done)),
            http.get("/api/projects/:id/site-expenses", () => listWith(site.openExpenses.items.map((e) => ({ ...e, canEdit: false })), { canAdd: false })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("Closed to new entries")).toBeInTheDocument();
        expect(within(p).queryByRole("button", { name: "Add expenses" })).not.toBeInTheDocument();
        expect(within(p).getByLabelText("Item 1")).toBeDisabled();
        expect(within(p).getByLabelText("Category 1")).toBeDisabled();
    });
});

describe("the Add expenses sheet", () => {
    const openSheet = async () => {
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Add expenses" }));
        return screen.findByRole("dialog", { name: "Add expenses" });
    };
    /** Types one pound row: the item, then its amount, which is the fifth cell. */
    async function typePounds(sheet: HTMLElement, item: string, amount: string) {
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        await userEvent.keyboard(`${item}{Enter}{Enter}{Enter}{Enter}${amount}`);
        await userEvent.selectOptions(within(sheet).getByLabelText("Currency 5"), "LBP");
    }

    it("adds the rows typed, with the amount worked out as they are typed", async () => {
        const added: unknown[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", async ({ request }) => { added.push(await request.json()); return HttpResponse.json([plasterboard], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        // the four recorded expenses sit above, read-only; the first new row is the fifth
        expect(await within(sheet).findByLabelText("Item 1")).toBeDisabled();
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        await userEvent.keyboard("Cement{Enter}10{Enter}ba{Enter}5.5{Enter}");
        expect(within(sheet).getByLabelText("Unit 5")).toHaveValue("bag");
        expect(within(sheet).getByLabelText("Amount 5")).toHaveValue("55");
        expect(within(sheet).queryByLabelText("Client price 5")).not.toBeInTheDocument();
        expect(within(sheet).getByRole("status")).toHaveTextContent("(+$55 here)");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 expense" }));
        await waitFor(() => expect(added).toEqual([{
            items: [{
                name: "Cement", quantity: 10, unit: "bag", unitCost: 5.5, amount: null, supplier: null, note: null,
                currency: "USD", spentOn: "2026-09-30", category: "materials", accountLabelId: null,
            }],
        }]));
        expect(await screen.findByText("Added 1 expense")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("starts every row in dollars, spent today, under materials, with no label, and counts none of them as typed", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        expect(await within(sheet).findByLabelText("Currency 5")).toHaveValue("USD");
        expect(within(sheet).getByLabelText("Spent on 5")).toHaveValue("Sep 30, 2026");
        expect(within(sheet).getByLabelText("Category 5")).toHaveValue("materials");
        expect(within(sheet).getByLabelText("Account label 5")).toHaveValue("");
        expect(within(sheet).getByText("Nothing new typed yet")).toBeInTheDocument();
        expect(within(sheet).getByRole("button", { name: "Add expenses" })).toBeDisabled();
    });

    it("adds a pound expense on another day, under a category and an account label", async () => {
        const added: { items: Record<string, unknown>[] }[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", async ({ request }) => { added.push(await request.json() as never); return HttpResponse.json([plasterboard], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        await typePounds(sheet, "Scaffolding", "895000");
        await userEvent.selectOptions(within(sheet).getByLabelText("Category 5"), "equipment");
        const label = within(sheet).getByLabelText("Account label 5");
        await waitFor(() => expect(within(label).getByRole("option", { name: "Permits" })).toBeInTheDocument());
        await userEvent.selectOptions(label, "3");
        await typeInto(within(sheet).getByLabelText("Spent on 5"), "28/9/2026");
        expect(within(sheet).getByLabelText("Spent on 5")).toHaveValue("Sep 28, 2026");
        // the pounds are totalled apart and not counted in the dollars
        expect(within(sheet).getByText("895,000 LBP")).toBeInTheDocument();
        expect(within(sheet).getByRole("status")).toHaveTextContent("plus 895,000 LBP");
        expect(within(sheet).getByRole("status")).not.toHaveTextContent("here)");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 expense" }));
        await waitFor(() => expect(added[0]?.items).toEqual([{
            name: "Scaffolding", quantity: null, unit: null, unitCost: null, amount: 895000, supplier: null, note: null,
            currency: "LBP", spentOn: "2026-09-28", category: "equipment", accountLabelId: 3,
        }]));
    });

    it("takes no archived label for a new row, and shows a recorded expense its own", async () => {
        renderApp(openPath, karim,
            http.get("/api/projects/:id/site-expenses", () => listWith(filedUnderArchived(3))),
            http.get("/api/account-labels", () => HttpResponse.json([...site.accountLabels, { id: 4, name: "Retired", position: 4, archived: true }])),
            ...siteHandlers);
        const sheet = await openSheet();
        // the expense filed under the archived label is the first recorded (oldest first)
        const own = await within(sheet).findByLabelText("Account label 1");
        expect(await within(own).findByRole("option", { name: "Old permits (archived)" })).toBeInTheDocument();
        const fresh = within(sheet).getByLabelText("Account label 5");
        await waitFor(() => expect(within(fresh).getByRole("option", { name: "Permits" })).toBeInTheDocument());
        expect(within(fresh).queryByRole("option", { name: /Retired|Old permits/ })).not.toBeInTheDocument();
        expect(within(fresh).getAllByRole("option").map((o) => o.textContent)).toEqual(["No label", "Concrete", "Finishing", "Permits"]);
    });

    it("marks the rows still missing a cost, with what is wrong under them, and adds nothing", async () => {
        const added: unknown[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", async ({ request }) => { added.push(await request.json()); return HttpResponse.json([], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        await userEvent.keyboard("Sand{Enter}2{Enter}");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 expense" }));
        expect(within(sheet).getByText(/1 row needs fixing - the messages under them say what/)).toBeInTheDocument();
        expect(within(sheet).getByLabelText("Unit cost 5").closest("td")).toHaveClass("bad");
        expect(within(sheet).getByText("Row 5: Add a unit cost or type the amount")).toBeInTheDocument();
        expect(added).toEqual([]);
    });

    it("shows what is wrong in a cell as soon as it is left, before any try to add", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        await userEvent.keyboard("Sand{Enter}1.2345");
        // still being typed in: nothing is said yet
        expect(within(sheet).queryByText("Row 5: At most 3 decimals")).not.toBeInTheDocument();
        await userEvent.keyboard("{Enter}");
        expect(await within(sheet).findByText("Row 5: At most 3 decimals")).toBeInTheDocument();
        expect(within(sheet).getByLabelText("Qty 5").closest("td")).toHaveClass("bad");
        // what isn't left yet stays quiet
        expect(within(sheet).queryByText(/Add a unit cost or type the amount/)).not.toBeInTheDocument();
    });

    it("says a day it can't read, on its cell", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        await userEvent.keyboard("Sand");
        await typeInto(within(sheet).getByLabelText("Spent on 5"), "nonsense");
        expect(await within(sheet).findByText("Row 5: Not a date - try 23/9/2026 or Sep 23")).toBeInTheDocument();
    });

    it("flags what is longer than the API takes, and sends nothing", async () => {
        const added: unknown[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", async ({ request }) => { added.push(await request.json()); return HttpResponse.json([], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        const first = await within(sheet).findByLabelText("Item 5");
        fireEvent.paste(first, { clipboardData: { getData: () => `Sand\t2\t${"t".repeat(25)}\t30` } });
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 expense" }));
        expect(within(sheet).getByText(/1 row needs fixing - the messages under them say what/)).toBeInTheDocument();
        expect(within(sheet).getByLabelText("Unit 5").closest("td")).toHaveAttribute("title", "At most 20 characters");
        expect(within(sheet).getByText("Row 5: At most 20 characters")).toBeInTheDocument();
        expect(added).toEqual([]);
    });

    it("keeps only what a failed batch didn't save, so nothing is added twice", async () => {
        const batches: number[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", async ({ request }) => {
                const { items } = await request.json() as { items: unknown[] };
                batches.push(items.length);
                return batches.length === 1
                    ? HttpResponse.json([], { status: 201 })
                    : HttpResponse.json({ code: "validation_failed", message: "Something in the second batch was refused." }, { status: 400 });
            }),
            ...siteHandlers);
        const sheet = await openSheet();
        const first = await within(sheet).findByLabelText("Item 5");
        fireEvent.paste(first, { clipboardData: { getData: () => Array.from({ length: 150 }, (_, i) => `Item ${i + 1}\t\t\t\t10`).join("\n") } });
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 150 expenses" }));
        await waitFor(() => expect(batches).toEqual([100, 50]));
        // the first hundred are recorded; only the fifty the API refused are left to send again
        expect(await within(sheet).findByRole("button", { name: "Add 50 expenses" })).toBeInTheDocument();
        expect(within(sheet).getByText(/Something in the second batch was refused\./)).toBeInTheDocument();
    });

    it("puts a refusal on the row and cell it names, until something is changed", async () => {
        const refusal = "Unit cost must be more than zero, with at most 4 decimals.";
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", () => HttpResponse.json({
                type: "validation", code: "validation_failed", message: "One or more fields are invalid.", traceId: "t",
                errors: { "items[1].unitCost": [refusal] },
            }, { status: 400 })),
            ...siteHandlers);
        const sheet = await openSheet();
        const first = await within(sheet).findByLabelText("Item 5");
        fireEvent.paste(first, { clipboardData: { getData: () => "Sand\t2\ttonne\t30\nGlass\t\t\t\t9400" } });
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 2 expenses" }));
        // the second row sent is the sixth on the sheet
        expect(await within(sheet).findByText(`Row 6: ${refusal}`)).toBeInTheDocument();
        expect(within(sheet).getByLabelText("Unit cost 6").closest("td")).toHaveClass("bad");
        expect(within(sheet).queryByText(/^Row 5:/)).not.toBeInTheDocument();
        await userEvent.click(within(sheet).getByLabelText("Note 6"));
        await userEvent.keyboard("x");
        await waitFor(() => expect(within(sheet).queryByText(`Row 6: ${refusal}`)).not.toBeInTheDocument());
    });

    it("says above the rows when a pound expense has no exchange rate for its day, and keeps the sheet", async () => {
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", () => noRate()),
            ...siteHandlers);
        const sheet = await openSheet();
        await typePounds(sheet, "Scaffolding", "895000");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 expense" }));
        // about the sheet as a whole, not a cell: said once, as an alert, and not under a row
        const alert = await within(sheet).findByRole("alert");
        expect(alert).toHaveTextContent(NO_RATE);
        expect(within(sheet).getAllByText(NO_RATE)).toHaveLength(1);
        expect(within(sheet).queryByText(/^Row \d:/)).not.toBeInTheDocument();
        // the row is still there to put right: change it to dollars and send it again
        expect(screen.getByRole("dialog", { name: "Add expenses" })).toBeInTheDocument();
        expect(within(sheet).getByLabelText("Item 5")).toHaveValue("Scaffolding");
        await userEvent.selectOptions(within(sheet).getByLabelText("Currency 5"), "USD");
        await waitFor(() => expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument());
        expect(within(sheet).getByRole("button", { name: "Add 1 expense" })).toBeEnabled();
    });

    it("takes a block pasted from Excel", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        const first = await within(sheet).findByLabelText("Item 5");
        fireEvent.paste(first, { clipboardData: { getData: () => "Sand\t2\ttonne\t30\nGlass\t\t\t\t9400" } });
        expect(within(sheet).getByLabelText("Amount 5")).toHaveValue("60");
        expect(within(sheet).getByLabelText("Item 6")).toHaveValue("Glass");
        expect(within(sheet).getByRole("button", { name: "Add 2 expenses" })).toBeEnabled();
    });

    it("reads a currency, a payee, a day, a category and a label from a pasted block", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        const first = await within(sheet).findByLabelText("Item 5");
        // the labels have to be on offer before one can be named
        await waitFor(() => expect(within(within(sheet).getByLabelText("Account label 5")).getByRole("option", { name: "Concrete" })).toBeInTheDocument());
        fireEvent.paste(first, { clipboardData: { getData: () => "Pump hire\t\t\t\t120000\tLBP\tHaddad Rentals\t3/9/2026\tequipment\tConcrete" } });
        expect(within(sheet).getByLabelText("Currency 5")).toHaveValue("LBP");
        expect(within(sheet).getByLabelText("Supplier / payee 5")).toHaveValue("Haddad Rentals");
        expect(within(sheet).getByLabelText("Spent on 5")).toHaveValue("Sep 3, 2026");
        expect(within(sheet).getByLabelText("Category 5")).toHaveValue("equipment");
        expect(within(sheet).getByLabelText("Account label 5")).toHaveValue("1");
    });

    it("takes no client price", async () => {
        const added: { items: Record<string, unknown>[] }[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/site-expenses", async ({ request }) => { added.push(await request.json() as never); return HttpResponse.json([], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        expect(within(sheet).queryByLabelText("Client price 5")).not.toBeInTheDocument();
        await userEvent.keyboard("Glass{Enter}{Enter}{Enter}{Enter}9400");
        // the amount shows its comma as it is typed, and is sent as a plain number
        expect(within(sheet).getByLabelText("Amount 5")).toHaveValue("9,400");
        await userEvent.keyboard("{Enter}");
        expect(within(sheet).getByLabelText("Amount 5")).toHaveValue("9,400");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 expense" }));
        await waitFor(() => expect(added[0]?.items[0]).toMatchObject({ name: "Glass", amount: 9400 }));
        expect(added[0]?.items[0]).not.toHaveProperty("clientPrice");
    });

    it("opens from the link Proton uses to fill it", async () => {
        renderApp(`${openPath}&materials=add`, karim, ...siteHandlers);
        expect(await screen.findByRole("dialog", { name: "Add expenses" })).toBeInTheDocument();
    });

    it("asks before throwing away what was typed", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Item 5")).toHaveFocus());
        await userEvent.keyboard("Sand");
        await userEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
        expect(confirm).toHaveBeenCalledWith("Discard the 1 expense typed so far?");
        expect(screen.getByRole("dialog", { name: "Add expenses" })).toBeInTheDocument();
    });
});
