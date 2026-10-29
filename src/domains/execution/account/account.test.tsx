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
const path = `/execution/projects/${project.id}`;
const usd = (n: number) => money.exact(n, "USD", { cents: true });

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const withFigures = (patch: Partial<Schemas["AccountFiguresResponse"]>) =>
    http.get("/api/projects/:id/account-figures", () => HttpResponse.json({ ...accountFigures, ...patch }));
const account = () => screen.findByRole("region", { name: "Account" });
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
        expect(card(region, "Due")).toHaveTextContent("$1,700");
        expect(card(region, "Taken")).toHaveTextContent("$500");
        expect(card(region, "Left")).toHaveTextContent("$1,200still to take");
        expect(card(region, "Cash in account")).toHaveTextContent("$464");
        // no pocket money has moved, and nothing is left unconverted
        expect(within(region).queryByText("Moved to the pocket money")).not.toBeInTheDocument();
        expect(within(region).queryByText(/Left out of every figure above/)).not.toBeInTheDocument();
    });

    it("breaks the spending down by category and by payee, in the order given", async () => {
        renderApp(path, karim, ...siteHandlers);
        const region = await account();
        expect((await within(region).findByText("Materials")).closest(".rb")).toHaveTextContent("$6,036");
        const payees = within(region).getAllByText(/^(Tile House|Steel Co|Sipes|Holcim)$/);
        expect(payees.map((p) => p.textContent)).toEqual(["Tile House", "Steel Co", "Sipes", "Holcim"]);
        expect(payees[0].closest(".rb")).toHaveTextContent("$3,960");
    });

    it("calls an expense with no supplier No payee, and a category by its name", async () => {
        renderApp(path, karim, withFigures({
            byCategory: [{ category: "contractor", spentUsd: 2000 }, { category: "equipment", spentUsd: 500 }],
            byPayee: [{ payee: "Tile House", spentUsd: 2000 }, { payee: null, spentUsd: 500 }],
        }), ...siteHandlers);
        const region = await account();
        expect((await within(region).findByText("Contractor")).closest(".rb")).toHaveTextContent("$2,000");
        expect(within(region).getByText("Equipment").closest(".rb")).toHaveTextContent("$500");
        expect(within(region).getByText("No payee").closest(".rb")).toHaveTextContent("$500");
    });

    it("says paid ahead for a negative rest to pay, and over by for supervision taken beyond what is due", async () => {
        renderApp(path, karim, withFigures({
            restToPayUsd: -500, supervision: { dueUsd: 1700, takenUsd: 2000, leftUsd: -300 }, cashInAccountUsd: -150,
        }), ...siteHandlers);
        const region = await account();
        expect(await within(region).findByText("Paid ahead")).toBeInTheDocument();
        expect(line(region, "Paid ahead")).toHaveTextContent("$500");
        expect(line(region, "Paid ahead")).not.toHaveTextContent("−");
        expect(within(region).queryByText("Rest to pay")).not.toBeInTheDocument();
        expect(card(region, "Over by")).toHaveTextContent("$300taken beyond what is due");
        expect(card(region, "Over by").querySelector("b")).toHaveClass("down");
        expect(within(region).queryByText("Left")).not.toBeInTheDocument();
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
        await waitFor(() => expect(card(region, "Moved to the pocket money")).toBeTruthy());
        expect(card(region, "Moved to the pocket money")).toHaveTextContent("$1,000set aside from this site");
        expect(card(region, "Paid by the pocket money")).toHaveTextContent("$250paid to this site");
        expect(card(region, "Cash in account")).toHaveTextContent("pocket money counted");
    });

    it("lists costs with no exchange rate apart, saying they are left out of every figure", async () => {
        renderApp(path, karim, withFigures({
            unconverted: [{ source: "site_expense", currency: "LBP", amount: 4500000 }, { source: "ground_labour", currency: "LBP", amount: 900000 }],
        }), ...siteHandlers);
        const note = (await within(await account()).findByText(/Left out of every figure above/)).closest(".banner") as HTMLElement;
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
        const region = await account();
        expect(await within(region).findByRole("alert")).toHaveTextContent("The account is only kept for client sites.");
        await userEvent.click(within(region).getByRole("button", { name: "Try again" }));
        expect(await within(region).findByText("Client total")).toBeInTheDocument();
        expect(calls).toBe(2);
    });

    it("is left out for someone without financial:view, who never causes it to be asked for", async () => {
        const asked: string[] = [];
        renderApp(path, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/projects/:id/account-figures", () => { asked.push("figures"); return HttpResponse.json(accountFigures); }),
            http.get("/api/projects/:id/supervision-withdrawals", () => { asked.push("supervision"); return HttpResponse.json(supervisionWithdrawals); }),
            ...siteHandlers);
        expect(await screen.findByText("4 weeks reported", { selector: ".kpi-delta span" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Account" })).not.toBeInTheDocument();
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
        renderApp(path, karim,
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

    it("can't be labelled by someone who may not record payments", async () => {
        renderApp(path, withPermissions(karim, { revoke: [P.PAYMENT_RECORD, P.PAYMENT_VOID] }), ...siteHandlers);
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
        renderApp(path, karim, ...siteHandlers);
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
        renderApp(path, karim, http.get("/api/projects/:id/supervision-withdrawals", () => HttpResponse.json([])), ...siteHandlers);
        expect(await within(await list()).findByText("Nothing taken yet.")).toBeInTheDocument();
    });

    it("records the amount, the day (today unless changed) and a note, and shows it in the list", async () => {
        const api = server();
        renderApp(path, karim, ...api.handlers, ...siteHandlers);
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
        renderApp(path, karim, ...api.handlers, ...siteHandlers);
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "75.5");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toEqual([{ amountUsd: 75.5, takenOn: "2026-09-30", note: null }]));
    });

    it("says what is missing, live, and sends nothing until the amount is right", async () => {
        const api = server();
        renderApp(path, karim, ...api.handlers, ...siteHandlers);
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

    it("takes no day in the future, and shows the API's refusal of one beside the day", async () => {
        const message = "Supervision can't be taken on a day that hasn't come yet.";
        renderApp(path, karim,
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
        renderApp(path, karim, http.post("/api/projects/:id/supervision-withdrawals", () => refusal(400, "validation_failed", "One or more fields are invalid.", { amountUsd: [message] })), ...siteHandlers);
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "10");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(await within(dialog).findByText(message)).toBeInTheDocument();
        expect(within(dialog).queryByText("One or more fields are invalid.")).not.toBeInTheDocument();
    });

    it("shows another refusal in the footer", async () => {
        renderApp(path, karim, http.post("/api/projects/:id/supervision-withdrawals", () => refusal(422, "not_for_this_domain", "Supervision is only taken on client sites.", null)), ...siteHandlers);
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "10");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("Supervision is only taken on client sites.");
    });

    it("removes one only after asking, and keeps it when told to", async () => {
        const api = server();
        renderApp(path, karim, ...api.handlers, ...siteHandlers);
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
        renderApp(path, withPermissions(karim, { revoke: [P.PAYMENT_RECORD] }), ...siteHandlers);
        const region = await list();
        expect(await within(region).findByText("Second instalment")).toBeInTheDocument();
        expect(within(region).queryByRole("button", { name: "Record supervision taken" })).not.toBeInTheDocument();
        expect(within(region).queryByRole("button", { name: /^Remove the supervision taken/ })).not.toBeInTheDocument();
    });

    it("is recorded and removed on a finished site as on an open one", async () => {
        const finished = { ...project, status: "completed", completedAt: "2026-09-29T09:00:00Z", finalizedAt: "2026-09-29T09:00:00Z", money: { ...project.money!, isLocked: true } };
        const api = server();
        renderApp(path, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(finished)), ...api.handlers, ...siteHandlers);
        const region = await list();
        expect(await within(region).findByRole("button", { name: "Remove the supervision taken on Sep 25, 2026" })).toBeInTheDocument();
        const dialog = await openForm();
        await userEvent.type(within(dialog).getByLabelText("Amount taken"), "40");
        await userEvent.click(within(dialog).getByRole("button", { name: "Record" }));
        await waitFor(() => expect(api.posted).toEqual([{ amountUsd: 40, takenOn: "2026-09-30", note: null }]));
    });
});
