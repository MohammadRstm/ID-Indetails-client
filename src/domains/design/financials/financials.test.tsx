import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { financials, financialsHandlers } from "@/test/fixtures/financials";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const nadia = personas.designAdmin;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const range = (q: URLSearchParams | undefined) => `${q?.get("from")} to ${q?.get("to")}`;

describe("Financials", () => {
    it("sums up the year's revenue, labour and profit", async () => {
        renderApp("/design/financials", nadia, ...financialsHandlers);
        expect(await screen.findByText("Revenue, cost and profit across every project · 2026")).toBeInTheDocument();
        expect(await screen.findByText(`${Math.round(financials.summary.labourMinutes / 60).toLocaleString("en-US")} hours logged`)).toBeInTheDocument();
        expect(screen.getByText("Revenue against cost, month by month")).toBeInTheDocument();
        expect(screen.getByText("Net profit", { selector: ".panel-title" })).toBeInTheDocument();
    });

    it("asks for the period picked, all time from before any project", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/financials", nadia,
            http.get("/api/finance/design/summary", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(financials.summary); }),
            ...financialsHandlers);
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-01-01 to 2026-09-30"));
        await userEvent.click(screen.getByRole("tab", { name: "Q3 2026" }));
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-07-01 to 2026-09-30"));
        await userEvent.click(screen.getByRole("tab", { name: "All time" }));
        await waitFor(() => expect(range(asked.at(-1))).toBe("2000-01-01 to 2026-09-30"));
    });

    it("opens the tab in the link, and sorts the projects", async () => {
        renderApp("/design/financials?tab=projects", nadia, ...financialsHandlers);
        const table = (await screen.findByText("Profitability by project")).closest(".panel") as HTMLElement;
        const titles = () => within(table).getAllByRole("row").slice(1).map((r) => r.querySelector(".trunc")?.textContent);
        await within(table).findAllByRole("row");
        const byProfit = [...financials.projects.projects].filter((p) => p.billingType !== "internal").sort((a, b) => b.profit - a.profit)[0].title;
        expect(titles()[0]).toBe(byProfit);
        const az = (list: (string | null | undefined)[]) => [...list].sort((a, b) => (a ?? "").localeCompare(b ?? ""));
        // a column sorts high to low first, as the prototype's did, so names go Z to A, then A to Z
        await userEvent.click(within(table).getByRole("columnheader", { name: /Project/ }));
        expect(titles()).toEqual(az(titles()).reverse());
        await userEvent.click(within(table).getByRole("columnheader", { name: /Project/ }));
        expect(titles()).toEqual(az(titles()));
    });

    it("says so where figures don't load, and keeps the rest", async () => {
        renderApp("/design/financials?tab=projects", nadia,
            http.get("/api/finance/design/projects", () => HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed." }, { status: 403 })),
            ...financialsHandlers);
        expect(await screen.findByText(/Couldn't load the projects\./)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: /Clients/ }));
        expect(await screen.findByText(/Couldn't load the project totals\./)).toBeInTheDocument();
        expect(screen.getByText("Client ledger")).toBeInTheDocument();
    });

    it("asks for the costs only when their tab opens", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/financials", nadia,
            http.get("/api/finance/design/costs", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(financials.costs); }),
            ...financialsHandlers);
        await screen.findByText("Revenue against cost, month by month");
        expect(asked).toHaveLength(0);
        await userEvent.click(screen.getByRole("tab", { name: "Costs" }));
        expect(await screen.findByText("Biggest single expenses")).toBeInTheDocument();
        expect(range(asked[0])).toBe("2026-01-01 to 2026-09-30");
    });

    it("exports the period's projects", async () => {
        const asked: URLSearchParams[] = [];
        URL.createObjectURL = vi.fn(() => "blob:financials");
        URL.revokeObjectURL = vi.fn();
        renderApp("/design/financials", nadia,
            http.get("/api/finance/design/projects/export", ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return new HttpResponse("Project,Revenue\n", { headers: { "content-type": "text/csv" } });
            }),
            ...financialsHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Export" }));
        await waitFor(() => expect(range(asked[0])).toBe("2026-01-01 to 2026-09-30"));
    });

    it("needs financial:view", async () => {
        renderApp("/design/financials", withPermissions(nadia, { revoke: [P.FINANCIAL_VIEW] }), ...financialsHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });
});
