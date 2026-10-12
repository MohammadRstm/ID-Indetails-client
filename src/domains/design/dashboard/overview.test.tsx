import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { overview, overviewHandlers } from "@/test/fixtures/overview";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const nadia = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });

// Wednesday 30 September 2026, 9 AM in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
    localStorage.clear();
});
afterEach(() => vi.useRealTimers());

/** The cards' titles, top to bottom. */
const cardOrder = () => [...document.querySelectorAll("[data-bd]")].map((el) => (el as HTMLElement).dataset.bd);
/** The figures card opens on Financial for those who see money: its activity is a tab away. */
const showActivity = async () => userEvent.click(await screen.findByRole("tab", { name: "Activity" }));

describe("Overview", () => {
    it("greets the admin and sums up the quarter", async () => {
        renderApp("/design/overview", nadia, ...overviewHandlers);
        expect(await screen.findByRole("heading", { name: "Good morning, Nadia" })).toBeInTheDocument();
        expect(screen.getByText("Wednesday, September 30, 2026 · Q3 2026 · week 40")).toBeInTheDocument();
        expect(await screen.findByText(`${overview.overview.entries} entries · ${overview.overview.peopleCount} people · ${overview.overview.projectCount} projects`)).toBeInTheDocument();
        await showActivity();
        expect(screen.getByText("Hours logged · Q3 2026 to date")).toBeInTheDocument();
        // the money attention's overdue invoice leads the follow-ups
        expect(await screen.findByText(/ID-2026-003 is \d+ days overdue/)).toBeInTheDocument();
        expect(screen.getAllByText(overview.deadlines.items[0].text).length).toBeGreaterThan(0);
        expect(cardOrder()).toEqual(["figures", "hours", "followups", "time", "status", "revcost", "profit", "invoiced", "owed", "clients"]);
    });

    it("shows the money figures first, and the activity on its own tab", async () => {
        renderApp("/design/overview", nadia, ...overviewHandlers);
        expect(await screen.findByRole("tab", { name: "Financial", selected: true })).toBeInTheDocument();
        // the figures load in place of placeholder tiles: wait for the loaded one
        await waitFor(() => expect(screen.getByText("Net profit", { selector: ".kpi-label" }).closest(".kpi")).toHaveTextContent("revenue less"));
        expect(screen.queryByText("Active projects")).not.toBeInTheDocument();
        await showActivity();
        expect(screen.getByText("Active projects")).toBeInTheDocument();
        expect(screen.queryByText("Net profit", { selector: ".kpi-label" })).not.toBeInTheDocument();
    });

    it("keeps fewer than eight figures on one line that scrolls, with arrows instead of a scroll bar", async () => {
        renderApp("/design/overview", nadia, ...overviewHandlers);
        await waitFor(() => expect(document.querySelector(".kpis")).toHaveClass("kpis-row"));
    });

    it("tells revenue received apart from the revenue expected from what was agreed", async () => {
        renderApp("/design/overview", nadia, ...overviewHandlers);
        const expected = () => screen.getByText("Expected revenue", { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
        await waitFor(() => expect(expected()).toHaveTextContent(money.short(42000)));
        expect(expected()).toHaveTextContent("payments agreed on projects, in this period");
        expect((screen.getByText(/^Revenue · /, { selector: ".kpi-label" }).closest(".kpi") as HTMLElement)).toHaveTextContent("received from clients");
    });

    it("asks for the period picked", async () => {
        const asked: string[] = [];
        renderApp("/design/overview", nadia,
            http.get("/api/reports/overview", ({ request }) => {
                asked.push(new URL(request.url).searchParams.get("period") ?? "");
                return HttpResponse.json(overview.overview);
            }),
            ...overviewHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "This month" }));
        await userEvent.click(screen.getByRole("tab", { name: "Last 30 days" }));
        await waitFor(() => expect(asked).toEqual(["quarter", "month", "last30"]));
        await showActivity();
        expect(await screen.findByText("Hours logged · Last 30 days")).toBeInTheDocument();
    });

    it("takes days picked for a custom period", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/overview", nadia,
            http.get("/api/reports/overview", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(overview.overview); }),
            ...overviewHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Custom" }));
        const from = screen.getByLabelText("From");
        await userEvent.clear(from);
        await userEvent.type(from, "Sep 1, 2026");
        await userEvent.tab();
        await waitFor(() => expect(asked.some((q) => q.get("period") === "custom" && q.get("from") === "2026-09-01")).toBe(true));
        expect(asked.find((q) => q.get("from") === "2026-09-01")!.get("to")).toBeTruthy();
    });

    it("keeps the money cards, and every money request, for financial:view", async () => {
        const asked: string[] = [];
        renderApp("/design/overview", withPermissions(nadia, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/finance/*", ({ request }) => { asked.push(new URL(request.url).pathname); return HttpResponse.json({}); }),
            ...overviewHandlers);
        await screen.findByText(`${overview.overview.entries} entries · ${overview.overview.peopleCount} people · ${overview.overview.projectCount} projects`);
        expect(cardOrder()).toEqual(["figures", "hours", "followups", "time", "status"]);
        expect(screen.queryByText("Money owed to us")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("shows a plain Design admin no money: no money cards or requests, and no Financials", async () => {
        const asked: string[] = [];
        renderApp("/design/overview", personas.designAdmin,
            http.get("/api/finance/*", ({ request }) => { asked.push(new URL(request.url).pathname); return HttpResponse.json({}); }),
            ...overviewHandlers);
        await screen.findByText(`${overview.overview.entries} entries · ${overview.overview.peopleCount} people · ${overview.overview.projectCount} projects`);
        expect(cardOrder()).toEqual(["figures", "hours", "followups", "time", "status"]);
        expect(screen.queryByText(/^Revenue · /, { selector: ".kpi-label" })).not.toBeInTheDocument();
        expect(screen.queryByText("Expected revenue", { selector: ".kpi-label" })).not.toBeInTheDocument();
        expect(within(screen.getByRole("navigation")).queryByText("Financials")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("shows who is online only with work_entry:view_all", async () => {
        let askedForPeople = false;
        renderApp("/design/overview", withPermissions(nadia, { revoke: [P.WORK_ENTRY_VIEW_ALL] }),
            http.get("/api/work/people", () => { askedForPeople = true; return HttpResponse.json([]); }),
            ...overviewHandlers);
        await showActivity();
        await screen.findByText("Logging this week");
        expect(screen.queryByText("Online now")).not.toBeInTheDocument();
        expect(askedForPeople).toBe(false);
    });

    it("lays the cards out as the person saved them", async () => {
        const order = ["status", "figures", "hours", "followups", "time", "revcost", "profit", "invoiced", "owed", "clients"];
        renderApp("/design/overview", nadia,
            http.get("/api/me/board-layouts/overview-design", () => HttpResponse.json({ key: "overview-design", order, savedAt: "2026-09-29T08:00:00Z" })),
            ...overviewHandlers);
        await waitFor(() => expect(cardOrder()).toEqual(order));
    });

    it("saves a new arrangement, and forgets it on Reset", async () => {
        const saved: unknown[] = [];
        let deleted = false;
        renderApp("/design/overview", nadia,
            http.put("/api/me/board-layouts/overview-design", async ({ request }) => {
                const body = await request.json() as { order: string[] };
                saved.push(body);
                return HttpResponse.json({ key: "overview-design", ...body, savedAt: "2026-09-30T06:00:00Z" });
            }),
            http.delete("/api/me/board-layouts/overview-design", () => { deleted = true; return new HttpResponse(null, { status: 204 }); }),
            ...overviewHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Customize" }));
        expect(screen.getByText("Arranging this page")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Move Key figures later" }));
        await waitFor(() => expect(saved).toEqual([{ order: ["hours", "figures", "followups", "time", "status", "revcost", "profit", "invoiced", "owed", "clients"] }]));
        expect(cardOrder().slice(0, 2)).toEqual(["hours", "figures"]);
        await userEvent.click(screen.getByRole("button", { name: "Reset" }));
        await waitFor(() => expect(deleted).toBe(true));
        expect(cardOrder().slice(0, 2)).toEqual(["figures", "hours"]);
        const bar = screen.getByText("Arranging this page").closest(".bd-bar") as HTMLElement;
        await userEvent.click(within(bar).getByRole("button", { name: "Done" }));
        expect(screen.queryByText("Arranging this page")).not.toBeInTheDocument();
    });

    it("needs report:view", async () => {
        renderApp("/design/overview", withPermissions(nadia, { revoke: [P.REPORT_VIEW] }), ...overviewHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });
});
