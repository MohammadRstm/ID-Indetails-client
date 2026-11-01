import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { accountFigures, supervisionWithdrawals } from "@/test/fixtures/account";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { Schemas } from "@/api/types";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const project = site.project;
const base = `/execution/projects/${project.id}`;
// each part of a site's Financials tab is a link: the account, the payments and the supervision
const path = `${base}?part=accounts`;
const paymentsPath = `${base}?part=payments`;
const supervisionPath = `${base}?part=supervision`;
const usd = (n: number) => money.exact(n, "USD", { cents: true });

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const withFigures = (patch: Partial<Schemas["AccountFiguresResponse"]>) =>
    http.get("/api/projects/:id/account-figures", () => HttpResponse.json({ ...accountFigures, ...patch }));
/** The account's four cards, once loaded (the whole page: a card is a region of its own). */
const account = async () => {
    await screen.findByRole("region", { name: "Price and costs" });
    return document.body;
};
const spending = async () => {
    await screen.findByRole("region", { name: "Price and costs" });
    return screen.getByRole("region", { name: "Spending" });
};
/** The statement line with this label (a table heading of the same name isn't one). */
const line = (scope: HTMLElement, label: string) => within(scope).getAllByText(label).map((n) => n.closest(".cost-row")).find((r) => r) as HTMLElement;
/** The card with this label: Due, Taken, Left, Cash in account. */
const card = (scope: HTMLElement, label: string) =>
    Array.from(scope.querySelectorAll(".xm-owed > div")).find((d) => d.querySelector("span")?.textContent === label) as HTMLElement;

describe("an Execution site's account", () => {
    it("shows the figures as the API gives them: price, received, costs, supervision and cash", async () => {
        renderApp(path, karim, ...siteHandlers);
        const region = await account();
        await within(region).findByText("Client total");
        expect(line(region, "Work price")).toHaveTextContent("$17,000");
        expect(line(region, "Supervision")).toHaveTextContent("10% of the work price+$1,700");
        expect(line(region, "TVA")).toHaveTextContent("0% of the work price, never on supervision+$0");
        expect(line(region, "Client total")).toHaveTextContent("$18,700");
        expect(line(region, "Received")).toHaveTextContent("$10,000");
        expect(line(region, "Rest to pay")).toHaveTextContent("$8,700");
        expect(line(region, "Site expenses")).toHaveTextContent("$6,036");
        expect(line(region, "Ground labour")).toHaveTextContent("$3,000");
        expect(line(region, "Staff")).toHaveTextContent("$0");
        expect(line(region, "Other costs")).toHaveTextContent("$0");
        expect(line(region, "Total costs")).toHaveTextContent("$9,036");
        expect(line(region, "Profit")).toHaveTextContent("$9,664");
        expect(card(region, "Cash in account")).toHaveTextContent("$464");
        // the supervision has its own part: only its row in the way from profit to cash is here
        expect(line(region, "Supervision taken out")).toHaveTextContent("−$500");
        expect(card(region, "Due")).toBeUndefined();
        // no pocket money has moved, and nothing is left unconverted
        expect(within(region).queryByText(/pocket money counted/)).not.toBeInTheDocument();
        expect(within(region).queryByText(/Left out of every figure below/)).not.toBeInTheDocument();
    });

    it("is four cards: cash in account, price and costs, the rest by label, and the spending", async () => {
        renderApp(path, karim, ...siteHandlers);
        await account();
        const names = ["Cash in account", "Price and costs", "Rest in account by label", "Spending"];
        const regions = names.map((name) => screen.getByRole("region", { name }));
        // in this order on the page
        regions.slice(1).forEach((r, i) => expect(regions[i].compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
        // the way from profit to cash, ending on the cash in the account
        const cash = regions[0];
        expect(within(cash).getByText("From profit to cash in the account")).toBeInTheDocument();
        expect(line(cash, "Profit")).toHaveTextContent("$9,664");
        expect(line(cash, "Still to be paid by the client")).toHaveTextContent("−$8,700");
    });

    it("opens the Supervision part from the supervision row of the way from profit to cash", async () => {
        renderApp(path, karim, ...siteHandlers);
        const region = await account();
        await userEvent.click(line(region, "Supervision taken out"));
        expect(await screen.findByRole("tab", { name: "Supervision", selected: true })).toBeInTheDocument();
        expect(await screen.findByRole("region", { name: "Supervision taken" })).toBeInTheDocument();
    });

    it("breaks the spending down by category and by payee, in the order given", async () => {
        renderApp(path, karim, ...siteHandlers);
        const region = await spending();
        expect((await within(region).findByText("Materials")).closest(".rb")).toHaveTextContent("$6,036");
        const payees = within(region).getAllByText(/^(Tile House|Steel Co|Sipes|Holcim)$/);
        expect(payees.map((p) => p.textContent)).toEqual(["Tile House", "Steel Co", "Sipes", "Holcim"]);
        expect(payees[0].closest(".rb")).toHaveTextContent("$3,960");
    });

    it("calls an expense with no supplier No payee, and a category by its name", async () => {
        renderApp(path, karim, withFigures({
            byCategory: [{ category: "contractor", spentUsd: 2000 }, { category: "equipment", spentUsd: 500 }],
            byPayee: [
                { payee: "Tile House", spentUsd: 2000, splits: [{ category: "contractor", accountLabelId: null, spentUsd: 2000 }] },
                { payee: null, spentUsd: 500, splits: [{ category: "equipment", accountLabelId: null, spentUsd: 500 }] },
            ],
        }), ...siteHandlers);
        const region = await spending();
        expect((await within(region).findByText("Contractor")).closest(".rb")).toHaveTextContent("$2,000");
        expect(within(region).getByText("Equipment").closest(".rb")).toHaveTextContent("$500");
        expect(within(region).getByText("No payee").closest(".rb")).toHaveTextContent("$500");
    });

    describe("spending by payee", () => {
        const split = (category: Schemas["AccountPayeeSplitResponse"]["category"], accountLabelId: number | null, spentUsd: number) => ({ category, accountLabelId, spentUsd });
        const payees: Schemas["AccountPayeeRowResponse"][] = [
            { payee: "Tile House", spentUsd: 3000, splits: [split("materials", 1, 2000), split("contractor", 2, 1000)] },
            { payee: "Steel Co", spentUsd: 900, splits: [split("materials", null, 900)] },
            { payee: "Holcim", spentUsd: 300, splits: [split("materials", 1, 300)] },
            { payee: null, spentUsd: 100, splits: [split("fees", null, 100)] },
        ];
        const names = (region: HTMLElement) => within(region).getAllByText(/^(Tile House|Steel Co|Holcim|No payee|Payee \d+)$/).map((n) => n.textContent);

        it("searches the payees by name", async () => {
            renderApp(path, karim, withFigures({ byPayee: payees }), ...siteHandlers);
            const region = await spending();
            expect(names(region)).toEqual(["Tile House", "Steel Co", "Holcim", "No payee"]);
            await userEvent.type(within(region).getByLabelText("Search payees"), "steel");
            expect(names(region)).toEqual(["Steel Co"]);
            await userEvent.clear(within(region).getByLabelText("Search payees"));
            await userEvent.type(within(region).getByLabelText("Search payees"), "nobody");
            expect(within(region).getByText("No payee matches these filters.")).toBeInTheDocument();
        });

        it("filters by category, counting only what was spent under it", async () => {
            renderApp(path, karim, withFigures({ byPayee: payees }), ...siteHandlers);
            const region = await spending();
            await userEvent.click(within(region).getByLabelText("Filter payees by category"));
            await userEvent.click(await screen.findByRole("option", { name: "Contractor" }));
            expect(names(region)).toEqual(["Tile House"]);
            // only the $1,000 under Contractor, not the payee's $3,000
            expect(within(region).getByText("Tile House").closest(".rb")).toHaveTextContent("$1,000");
        });

        it("filters by account label, and by none", async () => {
            renderApp(path, karim, withFigures({ byPayee: payees }), ...siteHandlers);
            const region = await spending();
            const filter = within(region).getByLabelText("Filter payees by account label");
            await userEvent.click(filter);
            await userEvent.click(await screen.findByRole("option", { name: "No label" }));
            expect(names(region)).toEqual(["Steel Co", "No payee"]);
            await userEvent.click(filter);
            await userEvent.click(await screen.findByRole("option", { name: site.accountLabels[0].name }));
            expect(names(region)).toEqual(["Tile House", "Holcim"]);
            expect(within(region).getByText("Tile House").closest(".rb")).toHaveTextContent("$2,000");
        });

        it("pages the payees fifteen at a time", async () => {
            const many = Array.from({ length: 17 }, (_, i) => ({ payee: `Payee ${i + 1}`, spentUsd: 1000 - i, splits: [split("materials", null, 1000 - i)] }));
            renderApp(path, karim, withFigures({ byPayee: many }), ...siteHandlers);
            const region = await spending();
            expect(names(region)).toHaveLength(15);
            expect(names(region)[0]).toBe("Payee 1");
            await userEvent.click(within(region).getByRole("button", { name: /next/i }));
            expect(names(region)).toEqual(["Payee 16", "Payee 17"]);
        });

        it("falls back to the payee's total when an older API sends no split, and to nothing once a filter is set", async () => {
            const older = [{ payee: "Tile House", spentUsd: 3960 }, { payee: "Steel Co", spentUsd: 936 }] as unknown as Schemas["AccountPayeeRowResponse"][];
            renderApp(path, karim, withFigures({ byPayee: older }), ...siteHandlers);
            const region = await spending();
            expect(names(region)).toEqual(["Tile House", "Steel Co"]);
            expect(within(region).getByText("Tile House").closest(".rb")).toHaveTextContent("$3,960");
            await userEvent.click(within(region).getByLabelText("Filter payees by category"));
            await userEvent.click(await screen.findByRole("option", { name: "Materials" }));
            expect(within(region).getByText("No payee matches these filters.")).toBeInTheDocument();
        });
    });

    it("says paid ahead for a negative rest to pay", async () => {
        renderApp(path, karim, withFigures({
            restToPayUsd: -500, supervision: { dueUsd: 1700, takenUsd: 2000, leftUsd: -300 }, cashInAccountUsd: -150,
        }), ...siteHandlers);
        const region = await account();
        expect(await within(region).findByText("Paid ahead")).toBeInTheDocument();
        expect(line(region, "Paid ahead")).toHaveTextContent("$500");
        expect(line(region, "Paid ahead")).not.toHaveTextContent("−");
        expect(within(region).queryByText("Rest to pay")).not.toBeInTheDocument();
        // cash can go below zero
        expect(card(region, "Cash in account")).toHaveTextContent(usd(-150));
        expect(card(region, "Cash in account").querySelector("b")).toHaveClass("down");
    });

    it("lists the rest by label with the unlabelled row last, and the rows adding up to the cash in the account", async () => {
        renderApp(path, karim, withFigures({
            byLabel: [
                { accountLabel: { id: 1, name: "Concrete" }, receivedUsd: 6000, spentUsd: 2500, otherUsd: 0, restUsd: 3500 },
                { accountLabel: { id: 2, name: "Finishing" }, receivedUsd: 4000, spentUsd: 1500, otherUsd: 0, restUsd: 2500 },
                { accountLabel: null, receivedUsd: 0, spentUsd: 5036, otherUsd: 500, restUsd: -5536 },
            ],
        }), ...siteHandlers);
        const region = await account();
        const table = await within(region).findByRole("table");
        const rows = within(table).getAllByRole("row");
        expect(rows).toHaveLength(5);
        const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((c) => c.textContent);
        expect(cells(rows[1])).toEqual(["Concrete", "$6,000", "$2,500", "-", "$3,500"]);
        expect(cells(rows[2])).toEqual(["Finishing", "$4,000", "$1,500", "-", "$2,500"]);
        // supervision taken and the pocket money's moves are under Other
        expect(cells(rows[3])).toEqual(["Unlabelled", "$0", "$5,036", "$500", usd(-5536)]);
        // the total is the API's own cash in the account, not a sum made here
        expect(cells(rows[4])).toEqual(["Cash in account", "$10,000", "$9,036", "", "$464"]);
        expect(within(rows[3]).getAllByRole("cell")[4]).toHaveClass("down");
        expect(within(region).getByText(/Unlabelled also carries what no label holds: ground labour, staff and other costs/)).toBeInTheDocument();
    });

    it("shows only the unlabelled row when nothing is filed under a label", async () => {
        renderApp(path, karim, ...siteHandlers);
        const table = await within(await account()).findByRole("table");
        expect(within(table).getAllByRole("row")).toHaveLength(3);
        expect(within(table).getByText("Unlabelled")).toBeInTheDocument();
    });

    it("shows the pocket money's moves when there are some", async () => {
        renderApp(path, karim, withFigures({ pocket: { movedToPocketUsd: 1000, paidByPocketUsd: 250 }, cashInAccountUsd: -286 }), ...siteHandlers);
        const region = await account();
        // they count in the profit row of the way from profit to cash
        await waitFor(() => expect(within(region).getByText(/pocket money counted/)).toBeInTheDocument());
        expect(line(region, "Profit")).toHaveTextContent("pocket money counted: $1,000 moved to it, $250 paid by it");
    });

    it("lists costs with no exchange rate apart, saying they are left out of every figure", async () => {
        renderApp(path, karim, withFigures({
            unconverted: [{ source: "site_expense", currency: "LBP", amount: 4500000 }, { source: "ground_labour", currency: "LBP", amount: 900000 }],
        }), ...siteHandlers);
        const note = (await within(await account()).findByText(/Left out of every figure below/)).closest(".banner") as HTMLElement;
        expect(note).toHaveTextContent("4,500,000 LBP (site expense), 900,000 LBP (ground labour)");
        expect(note).toHaveTextContent("Add the rate to count them.");
    });

    it("shows a failure with a way to try again, not a blank", async () => {
        let calls = 0;
        renderApp(path, karim,
            http.get("/api/projects/:id/account-figures", () => (++calls === 1
                ? HttpResponse.json({ type: "business_rule", code: "not_for_this_domain", message: "The account is only kept for client sites.", errors: null, traceId: "t" }, { status: 422 })
                : HttpResponse.json(accountFigures))),
            ...siteHandlers);
        const region = await screen.findByRole("region", { name: "Account" });
        expect(await within(region).findByRole("alert")).toHaveTextContent("The account is only kept for client sites.");
        await userEvent.click(within(region).getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Client total")).toBeInTheDocument();
        expect(calls).toBe(2);
    });

    it("is left out for someone without financial:view, who never causes it to be asked for", async () => {
        const asked: string[] = [];
        renderApp(path, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/projects/:id/account-figures", () => { asked.push("figures"); return HttpResponse.json(accountFigures); }),
            http.get("/api/projects/:id/supervision-withdrawals", () => { asked.push("supervision"); return HttpResponse.json(supervisionWithdrawals); }),
            ...siteHandlers);
        // ?part=accounts is not theirs to open: they land on the first part they may, the BOQs
        expect(await screen.findByRole("tab", { name: "BOQs", selected: true })).toBeInTheDocument();
        for (const name of ["Accounts", "Supervision", "Client payments"]) expect(screen.queryByRole("tab", { name })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Account" })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Price and costs" })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Supervision taken" })).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("isn't kept for an internal site, which has no client", async () => {
        const asked: string[] = [];
        const internal = { ...project, billingType: "internal", client: null };
        renderApp(path, karim,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)),
            http.get("/api/projects/:id/account-figures", () => { asked.push("figures"); return HttpResponse.json(accountFigures); }),
            http.get("/api/projects/:id/supervision-withdrawals", () => { asked.push("supervision"); return HttpResponse.json(supervisionWithdrawals); }),
            ...siteHandlers);
        await screen.findByText("Internal project");
        expect(screen.queryByRole("tab", { name: "Accounts" })).not.toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Supervision" })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Account" })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Supervision taken" })).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });
});

describe("an Execution site's payments by label", () => {
    const panel = async () => (await screen.findByText("Payments received")).closest(".panel") as HTMLElement;

    it("are listed with their label, and a label can be filed from the row's menu", async () => {
        const calls: unknown[] = [];
        const payment = site.payments.items[0];
        renderApp(paymentsPath, karim,
            http.get("/api/payments", () => HttpResponse.json({ ...site.payments, items: [{ ...payment, accountLabel: { id: 1, name: "Concrete" } }] })),
            http.put("/api/payments/:id/label", async ({ params, request }) => {
                calls.push({ id: params.id, ...(await request.json() as object) });
                return HttpResponse.json({ ...payment, accountLabel: { id: 2, name: "Finishing" } });
            }),
            ...siteHandlers);
        const list = await panel();
        expect(await within(list).findByRole("columnheader", { name: "Account label" })).toBeInTheDocument();
        expect(within(list).getByText("Concrete")).toBeInTheDocument();
        await userEvent.click(within(list).getByRole("button", { name: "Payment of Sep 1 actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Label…" }));
        const dialog = await screen.findByRole("dialog", { name: "Label payment" });
        await userEvent.click(within(dialog).getByLabelText("Account label"));
        await userEvent.click(await screen.findByRole("option", { name: "Finishing" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(calls).toEqual([{ id: String(payment.id), accountLabelId: 2 }]));
    });

    it("are asked for twenty a page, and paged with the arrows", async () => {
        const asked: string[] = [];
        renderApp(paymentsPath, karim,
            http.get("/api/payments", ({ request }) => {
                const q = new URL(request.url).searchParams;
                asked.push(`${q.get("page")}/${q.get("pageSize")}`);
                return HttpResponse.json({ ...site.payments, page: Number(q.get("page")), pageSize: 20, totalCount: 45 });
            }),
            ...siteHandlers);
        const list = await panel();
        await waitFor(() => expect(asked).toEqual(["1/20"]));
        expect(await within(list).findByText("1–20 of 45")).toBeInTheDocument();
        await userEvent.click(within(list).getByRole("button", { name: "Next page" }));
        await waitFor(() => expect(asked.at(-1)).toBe("2/20"));
    });

    it("can't be labelled by someone who may not record payments", async () => {
        renderApp(paymentsPath, withPermissions(karim, { revoke: [P.PAYMENT_RECORD, P.PAYMENT_VOID] }), ...siteHandlers);
        const list = await panel();
        expect(await within(list).findByText("Advance")).toBeInTheDocument();
        expect(within(list).queryByRole("button", { name: /actions$/ })).not.toBeInTheDocument();
    });
});

describe("supervision taken", () => {
    const list = () => screen.findByRole("region", { name: "Supervision taken" });
    /** A server that keeps the withdrawals it is given, and answers each write. */
    function server(start = supervisionWithdrawals) {
        let items = [...start];
        const posted: unknown[] = [];
        const removed: string[] = [];
        return {
            posted, removed,
            handlers: [
                http.get("/api/projects/:id/supervision-withdrawals", () => HttpResponse.json(items)),
                http.post("/api/projects/:id/supervision-withdrawals", async ({ request }) => {
                    const body = await request.json() as { amountUsd: number; takenOn: string; note: string | null };
                    posted.push(body);
                    const saved = { id: 3, ...body, createdBy: { id: 3, name: "Karim Test" }, createdAt: "2026-09-30T09:00:00Z" };
                    items = [saved, ...items];
                    return HttpResponse.json(saved, { status: 201 });
                }),
                http.delete("/api/supervision-withdrawals/:id", ({ params }) => {
                    removed.push(String(params.id));
                    items = items.filter((w) => String(w.id) !== params.id);
                    return new HttpResponse(null, { status: 204 });
                }),
            ],
        };
    }
    const refusal = (status: number, code: string, message: string, errors: Record<string, string[]> | null) =>
        HttpResponse.json({ type: errors ? "validation" : "business_rule", code, message, errors, traceId: "t" }, { status });
    const openForm = async () => {
        await userEvent.click(within(await list()).getByRole("button", { name: "Record supervision taken" }));
        return screen.findByRole("dialog", { name: "Record supervision taken" });
    };

    it("lists what was taken, the latest day first, with who recorded it and why", async () => {
        renderApp(supervisionPath, karim, ...siteHandlers);
        const region = await list();
        const rows = await within(region).findAllByRole("row");
        expect(rows).toHaveLength(3);
        expect(rows[1]).toHaveTextContent("Sep 25, 2026");
        expect(rows[1]).toHaveTextContent("$200");
        expect(rows[1]).toHaveTextContent("Second instalment");
        expect(rows[1]).toHaveTextContent("Karim Jaber");
        expect(rows[2]).toHaveTextContent("Sep 20, 2026");
        expect(rows[2]).toHaveTextContent("$300");
        expect(within(region).getByText(/It isn't a cost/)).toBeInTheDocument();
    });

    it("says so when nothing was taken yet", async () => {
        renderApp(supervisionPath, karim, http.get("/api/projects/:id/supervision-withdrawals", () => HttpResponse.json([])), ...siteHandlers);
        expect(await within(await list()).findByText("Nothing taken yet.")).toBeInTheDocument();
    });

    it("records the amount, the day (today unless changed) and a note, and shows it in the list", async () => {
        const api = server();
        renderApp(supervisionPath, karim, ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        expect(within(dialog).getByLabelText("Day taken")).toHaveValue("Sep 30, 2026");
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "250");
        await userEvent.type(within(dialog).getByLabelText("Note"), "Third instalment");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toEqual([{ amountUsd: 250, takenOn: "2026-09-30", note: "Third instalment" }]));
        expect(await screen.findByText("$250 supervision taken")).toBeInTheDocument();
        expect(await within(await list()).findByText("Third instalment")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Record supervision taken" })).not.toBeInTheDocument());
    });

    it("sends no note when none was typed", async () => {
        const api = server();
        renderApp(supervisionPath, karim, ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "75.5");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toEqual([{ amountUsd: 75.5, takenOn: "2026-09-30", note: null }]));
    });

    it("says what is missing, live, and sends nothing until the amount is right", async () => {
        const api = server();
        // more is left than the largest amount the field takes, so the field's own limit is what answers
        renderApp(supervisionPath, karim, withFigures({ supervision: { dueUsd: 2e12, takenUsd: 0, leftUsd: 2e12 } }), ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(within(dialog).getByText("Enter the amount taken.")).toBeInTheDocument();
        expect(api.posted).toEqual([]);
        // from then on it follows what is typed
        const amount = within(dialog).getByLabelText("Amount taken");
        await userEvent.type(amount, "1000000000000");
        expect(await within(dialog).findByText(/^At most \$999,999,999,999/)).toBeInTheDocument();
        await userEvent.clear(amount);
        await userEvent.type(amount, "5");
        await waitFor(() => expect(within(dialog).queryByText(/^At most \$999/)).not.toBeInTheDocument());
        expect(within(dialog).queryByText("Enter the amount taken.")).not.toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Note"), "x".repeat(10));
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toHaveLength(1));
    });

    it("shows what is left to take in the window, and takes an amount up to it", async () => {
        const api = server();
        renderApp(supervisionPath, karim, ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        expect(await within(dialog).findByText(/Left to take:/)).toHaveTextContent("Left to take: $1,200");
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "1200");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toEqual([{ amountUsd: 1200, takenOn: "2026-09-30", note: null }]));
    });

    it("refuses an amount above what is left, live, and sends nothing", async () => {
        const api = server();
        renderApp(supervisionPath, karim, ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        await within(dialog).findByText(/Left to take:/);
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "1200.01");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(await within(dialog).findByText("At most $1,200 is left to take.")).toBeInTheDocument();
        expect(api.posted).toEqual([]);
        // it goes once the amount is within it
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "{Backspace}{Backspace}{Backspace}");
        expect(within(dialog).getByLabelText("Amount taken")).toHaveValue("1,200");
        await waitFor(() => expect(within(dialog).queryByText("At most $1,200 is left to take.")).not.toBeInTheDocument());
    });

    it("says nothing is left to take when the supervision due has all been taken", async () => {
        const api = server();
        renderApp(supervisionPath, karim, withFigures({ supervision: { dueUsd: 1700, takenUsd: 1700, leftUsd: 0 } }), ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        await within(dialog).findByText(/Left to take:/);
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "10");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(await within(dialog).findByText("Nothing of the supervision is left to take.")).toBeInTheDocument();
        expect(api.posted).toEqual([]);
    });

    it("shows the supervision due, taken and left above what was taken, and over by when more was taken", async () => {
        renderApp(supervisionPath, karim, ...siteHandlers);
        const summary = await screen.findByRole("region", { name: "The company's supervision" });
        await within(summary).findByText("$1,700");
        expect(card(summary, "Due")).toHaveTextContent("$1,700");
        expect(card(summary, "Taken")).toHaveTextContent("$500");
        expect(card(summary, "Left")).toHaveTextContent("$1,200still to take");
    });

    it("says over by when the supervision taken is beyond what is due", async () => {
        renderApp(supervisionPath, karim, withFigures({ supervision: { dueUsd: 1700, takenUsd: 2000, leftUsd: -300 } }), ...siteHandlers);
        const summary = await screen.findByRole("region", { name: "The company's supervision" });
        await within(summary).findByText("Over by");
        expect(card(summary, "Over by")).toHaveTextContent("$300taken beyond what is due");
        expect(card(summary, "Over by").querySelector("b")).toHaveClass("down");
        expect(within(summary).queryByText("Left")).not.toBeInTheDocument();
    });

    it("pages the list twenty at a time", async () => {
        const many = Array.from({ length: 23 }, (_, i) => ({
            id: 100 + i, amountUsd: 1, takenOn: "2026-09-01", note: `Taking ${i + 1}`, createdBy: { id: 10, name: "Karim Jaber" }, createdAt: "2026-09-01T10:00:00Z",
        }));
        renderApp(supervisionPath, karim, http.get("/api/projects/:id/supervision-withdrawals", () => HttpResponse.json(many)), ...siteHandlers);
        const region = await list();
        expect(await within(region).findAllByRole("row")).toHaveLength(21);
        expect(within(region).getByText("1–20 of 23")).toBeInTheDocument();
        await userEvent.click(within(region).getByRole("button", { name: "Next page" }));
        expect(within(region).getAllByRole("row")).toHaveLength(4);
        expect(within(region).getByText("Taking 23")).toBeInTheDocument();
    });

    it("takes no day in the future, and shows the API's refusal of one beside the day", async () => {
        const message = "Supervision can't be taken on a day that hasn't come yet.";
        renderApp(supervisionPath, karim,
            http.post("/api/projects/:id/supervision-withdrawals", () => refusal(400, "taken_date_in_future", message, { takenOn: [message] })),
            ...siteHandlers);
        const dialog = await openForm();
        const day = within(dialog).getByLabelText("Day taken");
        await userEvent.clear(day);
        await userEvent.type(day, "2026-10-05{Enter}");
        // the day field keeps today rather than take tomorrow
        expect(day).toHaveValue("Sep 30, 2026");
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "100");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        // once, beside the day: not repeated in the footer
        expect(await within(dialog).findAllByText(message)).toHaveLength(1);
        // the one alert is the day's own, not a second one in the footer
        expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
        // it goes as soon as something is changed
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "5");
        await waitFor(() => expect(within(dialog).queryByText(message)).not.toBeInTheDocument());
    });

    it("shows an API failure about the amount beside the amount", async () => {
        const message = "Enter an amount above zero with at most 2 decimals.";
        renderApp(supervisionPath, karim, http.post("/api/projects/:id/supervision-withdrawals", () => refusal(400, "validation_failed", "One or more fields are invalid.", { amountUsd: [message] })), ...siteHandlers);
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "10");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(await within(dialog).findByText(message)).toBeInTheDocument();
        expect(within(dialog).queryByText("One or more fields are invalid.")).not.toBeInTheDocument();
    });

    it("shows another refusal in the footer", async () => {
        renderApp(supervisionPath, karim, http.post("/api/projects/:id/supervision-withdrawals", () => refusal(422, "not_for_this_domain", "Supervision is only taken on client sites.", null)), ...siteHandlers);
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "10");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("Supervision is only taken on client sites.");
    });

    it("removes one only after asking, and keeps it when told to", async () => {
        const api = server();
        renderApp(supervisionPath, karim, ...api.handlers, ...siteHandlers);
        const region = await list();
        await userEvent.click(await within(region).findByRole("button", { name: "Remove the supervision taken on Sep 25, 2026" }));
        let dialog = await screen.findByRole("dialog", { name: "Remove supervision taken" });
        expect(dialog).toHaveTextContent("Remove the $200 taken on Sep 25, 2026?");
        await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
        expect(screen.queryByRole("dialog", { name: "Remove supervision taken" })).not.toBeInTheDocument();
        expect(api.removed).toEqual([]);

        await userEvent.click(within(region).getByRole("button", { name: "Remove the supervision taken on Sep 25, 2026" }));
        dialog = await screen.findByRole("dialog", { name: "Remove supervision taken" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(api.removed).toEqual(["2"]));
        expect(await screen.findByText("Supervision taken removed")).toBeInTheDocument();
        await waitFor(() => expect(within(region).queryByText("Second instalment")).not.toBeInTheDocument());
    });

    it("can be read but not changed without payment:record", async () => {
        renderApp(supervisionPath, withPermissions(karim, { revoke: [P.PAYMENT_RECORD] }), ...siteHandlers);
        const region = await list();
        expect(await within(region).findByText("Second instalment")).toBeInTheDocument();
        expect(within(region).queryByRole("button", { name: "Record supervision taken" })).not.toBeInTheDocument();
        expect(within(region).queryByRole("button", { name: /^Remove the supervision taken/ })).not.toBeInTheDocument();
    });

    it("is recorded and removed on a finished site as on an open one", async () => {
        const finished = { ...project, status: "completed", completedAt: "2026-09-29T09:00:00Z", finalizedAt: "2026-09-29T09:00:00Z", money: { ...project.money!, isLocked: true } };
        const api = server();
        renderApp(supervisionPath, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(finished)), ...api.handlers, ...siteHandlers);
        const region = await list();
        expect(await within(region).findByRole("button", { name: "Remove the supervision taken on Sep 25, 2026" })).toBeInTheDocument();
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "40");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toEqual([{ amountUsd: 40, takenOn: "2026-09-30", note: null }]));
    });
});
