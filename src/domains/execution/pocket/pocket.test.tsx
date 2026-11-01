import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import { money } from "@/shared/format/money";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

type PocketRequest = Schemas["PocketRequestResponse"];

const rana = { id: 1, name: "Rana Haddad" };
const request = (over: Partial<PocketRequest> = {}): PocketRequest => ({
    id: 7, project: { id: 30, title: "Mar Mikhael loft" }, status: "pending", suggestedAmount: 120, suggestedNow: 150, cashProfit: -300,
    approvedAmount: null, note: "Tiles came in dearer", requestedAt: "2026-09-28T09:00:00Z", requestedBy: null,
    decidedAt: null, decidedBy: null, decisionNote: null, ...over,
});
const pocket: Schemas["PocketResponse"] = { balance: 900, currency: "USD", contributedTotal: 1200, paidOutTotal: 300, pending: [request()] };
const entry = (id: number, kind: "contribution" | "payout", amount: number, title: string, note: string | null = null) => ({
    id, kind, amount, project: { id: 30 + id, title }, requestId: kind === "payout" ? 5 : null, note, createdAt: "2026-09-20T09:00:00Z", by: rana,
});
const contributions = { items: [entry(1, "contribution", 800, "Dbayeh marina villa", "After the second payment"), entry(2, "contribution", 400, "Rawda Block A")], page: 1, pageSize: 20, totalCount: 2 };
const payouts = { items: [entry(3, "payout", -300, "Mar Mikhael loft")], page: 1, pageSize: 30, totalCount: 1 };

/** Answers the pocket's calls, and keeps what each list call asked for. */
const pocketHandlers = (asked: URLSearchParams[] = []) => [
    http.get("/api/execution/pocket", () => HttpResponse.json(pocket)),
    http.get("/api/execution/pocket/entries", ({ request: r }) => {
        const q = new URL(r.url).searchParams;
        asked.push(q);
        return HttpResponse.json(q.get("kind") === "payout" ? payouts : contributions);
    }),
];

describe("the pocket money", () => {
    it("shows the pocket and its balance, the latest contributions under it, and the requests waiting", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/execution/pocket", personas.superAdmin, ...pocketHandlers(asked), ...siteHandlers);
        expect(await screen.findByRole("heading", { name: "Pocket money" })).toBeInTheDocument();
        const hero = await screen.findByLabelText("In the pocket");
        expect(hero).toHaveTextContent(money.fmt(900));
        expect(hero).toHaveTextContent(`${money.exact(1200)} moved in · ${money.exact(300)} paid out`);

        const list = await screen.findByLabelText("Contributions");
        const rows = await within(list).findAllByRole("row");
        expect(rows[1]).toHaveTextContent(`Dbayeh marina villaAfter the second paymentRana Haddad+${money.exact(800)}`);
        expect(asked[0].get("kind")).toBe("contribution");
        // the contributions come before the requests
        const waiting = screen.getByLabelText("Waiting for a decision");
        expect(list.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(waiting).getByText("Mar Mikhael loft").closest("tr")).toHaveTextContent(`Raised by the system${money.exact(-300)}${money.exact(150)}`);
    });

    it("approves the amount the super admin chooses, never more than the pocket holds", async () => {
        const sent: unknown[] = [];
        renderApp("/execution/pocket", personas.superAdmin,
            http.post("/api/execution/pocket/requests/:id/approve", async ({ params, request: r }) => {
                sent.push({ id: Number(params.id), ...(await r.json() as object) });
                return HttpResponse.json(request({ status: "approved", approvedAmount: 200 }));
            }),
            ...pocketHandlers(), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Approve Mar Mikhael loft" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve the request" });
        expect(dialog).toHaveTextContent(`Suggested ${money.exact(150)}`);
        const amount = within(dialog).getByLabelText("Amount");
        await userEvent.clear(amount);
        await userEvent.type(amount, "1000");
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve and pay" }));
        expect(within(dialog).getByText(`The pocket money holds ${money.exact(900)}.`)).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.clear(amount);
        await userEvent.type(amount, "200");
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve and pay" }));
        await waitFor(() => expect(sent).toEqual([{ id: 7, amount: 200 }]));
    });

    it("denies a request after asking", async () => {
        const sent: unknown[] = [];
        renderApp("/execution/pocket", personas.superAdmin,
            http.post("/api/execution/pocket/requests/:id/deny", async ({ params, request: r }) => {
                sent.push({ id: Number(params.id), ...(await r.json() as object) });
                return HttpResponse.json(request({ status: "denied" }));
            }),
            ...pocketHandlers(), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Deny Mar Mikhael loft" }));
        const dialog = await screen.findByRole("dialog", { name: "Deny the request?" });
        await userEvent.type(within(dialog).getByLabelText("Why (optional)"), "Raise the price instead");
        await userEvent.click(within(dialog).getByRole("button", { name: "Deny" }));
        await waitFor(() => expect(sent).toEqual([{ id: 7, note: "Raise the price instead" }]));
    });

    it("lists the transactions incoming and outgoing apart, 30 a page, searched by the API", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/execution/pocket?tab=transactions", personas.superAdmin, ...pocketHandlers(asked), ...siteHandlers);
        const moves = await screen.findByLabelText("Transactions");
        await within(moves).findByText("Dbayeh marina villa");
        expect(asked.at(-1)?.get("kind")).toBe("contribution");
        expect(asked.at(-1)?.get("pageSize")).toBe("30");
        expect(screen.queryByLabelText("In the pocket")).not.toBeInTheDocument();

        await userEvent.click(within(moves).getByRole("tab", { name: "Outgoing" }));
        expect(await within(moves).findByText("Mar Mikhael loft")).toBeInTheDocument();
        expect(within(moves).getByRole("columnheader", { name: "Paid to" })).toBeInTheDocument();
        expect(asked.at(-1)?.get("kind")).toBe("payout");

        await userEvent.type(within(moves).getByLabelText("Search the transactions"), "tiles");
        await waitFor(() => expect(asked.at(-1)?.get("search")).toBe("tiles"));
        expect(asked.at(-1)?.get("kind")).toBe("payout");
    });
});

describe("a site's pocket money", () => {
    const profit = site.project.money!.profit;

    it("moves part of the site's profit into the pocket, never all of it", async () => {
        const sent: unknown[] = [];
        renderApp(`/execution/projects/${site.project.id}`, personas.superAdmin,
            http.post("/api/execution/pocket/contributions", async ({ request: r }) => { sent.push(await r.json()); return HttpResponse.json(pocket); }),
            ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Move to pocket money" }));
        const dialog = await screen.findByRole("dialog", { name: "Move to pocket money" });
        const amount = within(dialog).getByLabelText("Amount");
        await userEvent.type(amount, String(Math.ceil(profit)));
        await userEvent.click(within(dialog).getByRole("button", { name: "Move to pocket" }));
        expect(within(dialog).getByText(`Move less than ${money.exact(profit)}, so the site's profit stays above zero.`)).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.clear(amount);
        await userEvent.type(amount, "1500");
        await userEvent.type(within(dialog).getByLabelText("Note"), "Set aside");
        await userEvent.click(within(dialog).getByRole("button", { name: "Move to pocket" }));
        await waitFor(() => expect(sent).toEqual([{ projectId: site.project.id, amount: 1500, note: "Set aside" }]));
    });

    it("asks the pocket for money for the site", async () => {
        const sent: unknown[] = [];
        renderApp(`/execution/projects/${site.project.id}`, personas.superAdmin,
            http.post("/api/execution/pocket/requests", async ({ request: r }) => { sent.push(await r.json()); return HttpResponse.json(request()); }),
            ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Ask the pocket money" }));
        const dialog = await screen.findByRole("dialog", { name: "Ask the pocket money" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        await waitFor(() => expect(sent).toEqual([{ projectId: site.project.id }]));
    });

    it("shows what went to and came from the pocket on the site's money", async () => {
        const moved = { ...site.losingProject, money: { ...site.losingProject.money!, toPocket: 400, fromPocket: 150 } };
        renderApp(`/execution/projects/${moved.id}?tab=financials`, personas.superAdmin,
            http.get("/api/projects/:id", () => HttpResponse.json(moved)), ...siteHandlers);
        const out = (await screen.findByText("To the pocket money", { selector: "span" })).closest("div") as HTMLElement;
        expect(out).toHaveTextContent(`−${money.exact(400)}`);
        expect((screen.getByText("From the pocket money", { selector: "span" }).closest("div") as HTMLElement)).toHaveTextContent(money.exact(150));
    });

    it("isn't offered to an admin who can't see money", async () => {
        const noMoney = { ...site.project, money: null };
        renderApp(`/execution/projects/${noMoney.id}`, personas.executionAdmin,
            http.get("/api/projects/:id", () => HttpResponse.json(noMoney)), ...siteHandlers);
        await screen.findByRole("heading", { name: noMoney.title });
        const more = screen.queryByRole("button", { name: "More actions" });
        if (more) await userEvent.click(more);
        expect(screen.queryByRole("button", { name: "Move to pocket money" })).not.toBeInTheDocument();
    });
});
