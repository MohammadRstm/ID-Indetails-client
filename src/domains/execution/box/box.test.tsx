import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import { money } from "@/shared/format/money";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

type BoxProject = Schemas["BoxProjectResponse"];

const row = (id: number, title: string, over: Partial<BoxProject> = {}): BoxProject => ({
    id, title, clientName: "Karam family", status: "active", boxState: "in", contributed: 0, fromBox: 0, cashProfit: 0, ...over,
});
const villa = row(31, "Dbayeh marina villa", { contributed: 6000, cashProfit: 2400 });
const loft = row(30, "Mar Mikhael loft", { contributed: 1000, fromBox: 200, cashProfit: -700 });
const lobby = row(32, "Achrafieh lobby", { status: "completed", boxState: "pending", contributed: 1500, cashProfit: 300 });
const shop = row(33, "Jbeil shop", { status: "completed", boxState: "removed", contributed: 0, cashProfit: -2100 });
const box: Schemas["BoxResponse"] = {
    balance: 6300, currency: "USD", contributing: [villa, loft, lobby], contributedTotal: 8500, inTheRed: [shop, loft], pending: [lobby],
};
const entries = {
    items: [
        { id: 3, kind: "transfer", amount: -200, project: { id: 30, title: loft.title }, note: "Tiles", createdAt: "2026-09-29T09:00:00Z", by: { id: 1, name: "Rana Haddad" } },
        { id: 2, kind: "payment_in", amount: 6000, project: { id: 31, title: villa.title }, note: null, createdAt: "2026-09-20T09:00:00Z", by: { id: 1, name: "Rana Haddad" } },
    ],
    page: 1, pageSize: 30, totalCount: 2,
};
const boxHandlers = [
    http.get("/api/execution/box", () => HttpResponse.json(box)),
    http.get("/api/execution/box/entries", () => HttpResponse.json(entries)),
];
const titles = (table: HTMLElement) => within(table).getAllByRole("row").slice(1, -1).map((r) => within(r).getAllByRole("cell")[0].querySelector("a")!.textContent);

describe("the Execution box", () => {
    it("opens on its contributors: the vault first, then every project, the deepest in the red reddest", async () => {
        renderApp("/execution/box", personas.superAdmin, ...boxHandlers, ...siteHandlers);
        expect(await screen.findByRole("heading", { name: "The box" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Contributors" })).toHaveAttribute("aria-selected", "true");
        const vault = (await screen.findByText("In the box")).parentElement!;
        expect(vault).toHaveTextContent(money.fmt(6300));

        const projects = screen.getByLabelText("Projects");
        // the vault comes before the table
        expect(vault.compareDocumentPosition(projects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // deepest in the red first, and a site that left the box but is in the red is there too
        expect(titles(projects)).toEqual(["Jbeil shop", "Mar Mikhael loft", "Achrafieh lobby", "Dbayeh marina villa"]);
        const profit = (title: string) => (within(projects).getByText(title).closest("tr") as HTMLElement).querySelectorAll("td")[4] as HTMLElement;
        expect(profit("Jbeil shop")).toHaveAttribute("data-red", "60");
        expect(profit("Mar Mikhael loft")).toHaveAttribute("data-red", "28");
        expect(profit("Dbayeh marina villa")).not.toHaveAttribute("data-red");
        expect(within(projects).getByText("Jbeil shop").closest("tr")).toHaveTextContent("Out of the box");
        expect(within(projects).getByText("Achrafieh lobby").closest("tr")).toHaveTextContent("Decision due");
        expect(within(projects).getAllByRole("row").at(-1)).toHaveTextContent(`Total put in${money.exact(8500)}`);
        expect(within(projects).getAllByRole("button", { name: /Move money to/ })).toHaveLength(2);

        // a site closed by someone who can't see money waits below
        expect(screen.getByLabelText("Waiting for a decision")).toHaveTextContent("Achrafieh lobby");
        expect(screen.queryByLabelText("Transactions")).not.toBeInTheDocument();
    });

    it("filters the projects by name, by red or green, and sorts them", async () => {
        renderApp("/execution/box", personas.superAdmin, ...boxHandlers, ...siteHandlers);
        const projects = await screen.findByLabelText("Projects");
        await userEvent.click(within(projects).getByRole("tab", { name: "In the green" }));
        expect(titles(projects)).toEqual(["Achrafieh lobby", "Dbayeh marina villa"]);
        await userEvent.click(within(projects).getByRole("tab", { name: "In the red" }));
        expect(titles(projects)).toEqual(["Jbeil shop", "Mar Mikhael loft"]);
        await userEvent.click(within(projects).getByRole("tab", { name: "All" }));

        await userEvent.click(within(projects).getByLabelText("Sort the projects"));
        await userEvent.click(screen.getByRole("option", { name: "Most put in first" }));
        expect(titles(projects)).toEqual(["Dbayeh marina villa", "Achrafieh lobby", "Mar Mikhael loft", "Jbeil shop"]);

        await userEvent.type(within(projects).getByLabelText("Search the projects"), "mar");
        expect(titles(projects)).toEqual(["Dbayeh marina villa", "Mar Mikhael loft"]);
    });

    it("lists every movement on its own tab, 30 a page, searched and filtered by the API", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/execution/box?tab=transactions", personas.superAdmin,
            http.get("/api/execution/box/entries", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(entries); }),
            ...boxHandlers, ...siteHandlers);
        const moves = await screen.findByLabelText("Transactions");
        const rows = await within(moves).findAllByRole("row");
        expect(rows[1]).toHaveTextContent(`Moved to projectTilesMar Mikhael loftRana Haddad−${money.exact(200)}`);
        expect(rows[2]).toHaveTextContent(`+${money.exact(6000)}`);
        expect(screen.queryByText("In the box")).not.toBeInTheDocument();
        expect(asked[0].get("pageSize")).toBe("30");

        await userEvent.click(within(moves).getByLabelText("Filter by movement"));
        await userEvent.click(screen.getByRole("option", { name: "Moved to project" }));
        await userEvent.click(within(moves).getByLabelText("Filter by project"));
        await userEvent.click(screen.getByRole("option", { name: "Jbeil shop" }));
        await userEvent.type(within(moves).getByLabelText("Search the transactions"), "tiles");
        await waitFor(() => expect(asked.at(-1)?.get("search")).toBe("tiles"));
        expect(asked.at(-1)?.get("kind")).toBe("transfer");
        expect(asked.at(-1)?.get("projectId")).toBe("33");
    });

    it("moves money to a site in the red, never more than brings it back to zero", async () => {
        const sent: unknown[] = [];
        renderApp("/execution/box", personas.superAdmin,
            http.post("/api/execution/box/transfers", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(box); }),
            ...boxHandlers, ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Move money to Mar Mikhael loft" }));
        const dialog = await screen.findByRole("dialog", { name: "Move money" });
        const amount = within(dialog).getByLabelText("Amount");
        await userEvent.clear(amount);
        await userEvent.type(amount, "900");
        await userEvent.click(within(dialog).getByRole("button", { name: "Move money" }));
        expect(within(dialog).getByText(`${money.exact(700)} brings the project back to zero: move at most that.`)).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.clear(amount);
        await userEvent.type(amount, "450");
        await userEvent.type(within(dialog).getByLabelText("Note"), " Tiles until the client pays ");
        await userEvent.click(within(dialog).getByRole("button", { name: "Move money" }));
        await waitFor(() => expect(sent).toEqual([{ projectId: 30, amount: 450, note: "Tiles until the client pays" }]));
    });

    it("removes or keeps the money of a site closed by someone who can't see money", async () => {
        const sent: unknown[] = [];
        renderApp("/execution/box", personas.superAdmin,
            http.post("/api/execution/box/projects/:id/decision", async ({ params, request }) => {
                sent.push({ id: Number(params.id), ...(await request.json() as object) });
                return HttpResponse.json(box);
            }),
            ...boxHandlers, ...siteHandlers);
        const pending = await screen.findByLabelText("Waiting for a decision");
        await userEvent.click(within(pending).getByRole("button", { name: "Keep" }));
        await waitFor(() => expect(sent).toEqual([{ id: 32, decision: "keep" }]));
    });
});

describe("closing and reopening a site, for whoever sees money", () => {
    const statusCalls = (log: string[]) => http.post("/api/projects/:id/:action", ({ params, request }) => {
        const box = new URL(request.url).searchParams.get("box");
        log.push(`${String(params.action)}${box ? `?box=${box}` : ""}`);
        return HttpResponse.json(site.project);
    });

    it("asks in the close-out review what happens to its money, removal recommended", async () => {
        const log: string[] = [];
        renderApp(`/execution/projects/${site.project.id}?complete=1`, personas.superAdmin, statusCalls(log), ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: `Close ${site.project.title}` });
        const choice = within(dialog).getByRole("radiogroup", { name: "The Execution box" });
        expect(within(choice).getByRole("radio", { name: /Remove its revenue from the box \(recommended\)/ })).toBeChecked();
        await userEvent.click(within(choice).getByRole("radio", { name: /Keep it in the box/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Complete project" }));
        await waitFor(() => expect(log).toEqual(["complete?box=keep"]));
    });

    it("asks before archiving an open site", async () => {
        const log: string[] = [];
        renderApp(`/execution/projects/${site.project.id}`, personas.superAdmin, statusCalls(log), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Archive project" }));
        const dialog = await screen.findByRole("dialog", { name: `Archive ${site.project.title}` });
        await userEvent.click(within(dialog).getByRole("button", { name: "Archive project" }));
        await waitFor(() => expect(log).toEqual(["archive?box=remove"]));
    });

    it("asks a removed site's reopening whether its earlier revenue goes back", async () => {
        const log: string[] = [];
        const removed = { ...site.project, status: "completed", completedAt: "2026-09-28T09:00:00Z", money: { ...site.project.money!, boxState: "removed" } };
        renderApp(`/execution/projects/${removed.id}`, personas.superAdmin, statusCalls(log),
            http.get("/api/projects/:id", () => HttpResponse.json(removed)), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Reopen project" }));
        const dialog = await screen.findByRole("dialog", { name: `Reopen ${removed.title}` });
        await userEvent.click(within(dialog).getByRole("radio", { name: /Count afresh from today/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Reopen project" }));
        await waitFor(() => expect(log).toEqual(["reopen?box=fresh"]));
    });

    it("leaves a kept site's reopening alone, and asks nothing of whoever can't see money", async () => {
        const log: string[] = [];
        const kept = { ...site.project, status: "completed", completedAt: "2026-09-28T09:00:00Z", money: { ...site.project.money!, boxState: "in" } };
        renderApp(`/execution/projects/${kept.id}`, personas.superAdmin, statusCalls(log),
            http.get("/api/projects/:id", () => HttpResponse.json(kept)), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Reopen project" }));
        await waitFor(() => expect(log).toEqual(["reopen"]));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes without asking for an admin who can't see money: the site then waits on the Box page", async () => {
        const log: string[] = [];
        const noMoney = { ...site.project, money: null };
        renderApp(`/execution/projects/${noMoney.id}?complete=1`, personas.executionAdmin, statusCalls(log),
            http.get("/api/projects/:id", () => HttpResponse.json(noMoney)), ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: `Close ${noMoney.title}` });
        expect(within(dialog).queryByRole("radiogroup", { name: "The Execution box" })).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Complete project" }));
        await waitFor(() => expect(log).toEqual(["complete"]));
    });
});

describe("a site's money", () => {
    it("counts what the box moved to it in its profit so far", async () => {
        const helped = {
            ...site.losingProject,
            money: { ...site.losingProject.money!, fromBox: 400, cashProfit: (site.losingProject.money!.cashProfit ?? 0) + 400 },
        };
        renderApp(`/execution/projects/${helped.id}?tab=financials`, personas.superAdmin,
            http.get("/api/projects/:id", () => HttpResponse.json(helped)), ...siteHandlers);
        const owed = (await screen.findByText("From the box", { selector: "span" })).closest("div") as HTMLElement;
        expect(owed).toHaveTextContent(money.exact(400));
        expect(screen.getByText(`${money.short(400)} from the box`, { selector: "b" })).toBeInTheDocument();
    });
});
