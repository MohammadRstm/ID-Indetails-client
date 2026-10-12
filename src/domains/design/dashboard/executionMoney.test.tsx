import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { executionMoney, executionMoneyHandlers } from "@/test/fixtures/executionMoney";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const s = executionMoney.summary;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Execution's dashboard", () => {
    it("is the overview board without the cards about logged work", async () => {
        const asked: string[] = [];
        renderApp("/execution/overview", karim,
            http.get("/api/reports/overview", () => { asked.push("overview"); return HttpResponse.json({}); }),
            http.get("/api/dashboard/execution/deadlines", () => { asked.push("deadlines"); return HttpResponse.json({ items: [] }); }),
            ...executionMoneyHandlers);
        expect(await screen.findByText("Good afternoon, Karim")).toBeInTheDocument();
        expect(await screen.findByText("Projects by status")).toBeInTheDocument();
        for (const title of ["Revenue against cost", "Profit by project", "Invoiced against collected", "Money owed to us", "Top clients"]) {
            expect(screen.getByText(title)).toBeInTheDocument();
        }
        for (const title of ["Hours logged per week", "Needs attention & deadlines", "Where the time went", "Work entries", "Online now"]) {
            expect(screen.queryByText(title)).not.toBeInTheDocument();
        }
        expect(screen.getByText(`materials ${money.short(s.cost.materials)} · ground labour ${money.short(s.cost.groundLabour)} · project expenses $0`)).toBeInTheDocument();
        expect(screen.getByText("revenue less materials, ground labour and expenses")).toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("counts its projects by status from the dashboard", async () => {
        renderApp("/execution/overview", karim, ...executionMoneyHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Activity" }));
        await waitFor(() => {
            const active = screen.getByText("Active projects").closest(".kpi") as HTMLElement;
            expect(within(active).getByText(String(executionMoney.dashboard.activeProjects))).toBeInTheDocument();
        });
        expect(await screen.findByText("Longest running")).toBeInTheDocument();
    });

    it("keeps the money off it without financial:view", async () => {
        renderApp("/execution/overview", withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }), ...executionMoneyHandlers);
        expect(await screen.findByText("Projects by status")).toBeInTheDocument();
        expect(screen.queryByText("Revenue against cost")).not.toBeInTheDocument();
        expect(screen.queryByText("Net profit")).not.toBeInTheDocument();
    });
});

describe("Execution's financials", () => {
    it("split a site's cost into materials, ground labour and expenses", async () => {
        renderApp("/execution/financials", karim, ...executionMoneyHandlers);
        await waitFor(() => {
            const materials = screen.getByText("Materials", { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
            expect(within(materials).getByText(money.short(s.cost.materials))).toBeInTheDocument();
        });
        expect(screen.getByText("Ground labour", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(screen.queryByText("Employee labour")).not.toBeInTheDocument();
        expect(screen.getByText(/Materials, ground labour and expenses include internal work\./)).toBeInTheDocument();
    });

    it("list the sites without hours, with a column for each kind of cost", async () => {
        renderApp("/execution/financials?tab=projects", karim, ...executionMoneyHandlers);
        const table = (await screen.findByText("Profitability by project")).closest(".panel") as HTMLElement;
        const heads = (await within(table).findAllByRole("columnheader")).map((h) => h.textContent);
        expect(heads).toEqual(expect.arrayContaining(["Materials", "Ground labour", "Expenses"]));
        expect(heads).not.toContain("Hours");
        expect(heads).not.toContain("Labour");
        expect(within(table).getByText("Margin needs 5% progress before it is shown.")).toBeInTheDocument();
    });

    it("show a site's cost by kind in the Costs tab", async () => {
        renderApp("/execution/financials?tab=costs", karim, ...executionMoneyHandlers);
        expect(await screen.findByText("Site cost by kind")).toBeInTheDocument();
        expect(screen.queryByText("Labour cost by employee")).not.toBeInTheDocument();
    });

    it("export the sites' CSV", async () => {
        const exported: string[] = [];
        URL.createObjectURL = vi.fn(() => "blob:csv");
        URL.revokeObjectURL = vi.fn();
        renderApp("/execution/financials", karim,
            http.get("/api/finance/execution/projects/export", () => { exported.push("execution"); return new HttpResponse("a,b", { headers: { "content-type": "text/csv" } }); }),
            ...executionMoneyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Export" }));
        await vi.waitFor(() => expect(exported).toEqual(["execution"]));
    });
});

describe("Execution's dashboard, when it can't be loaded", () => {
    it("says so, with a way to try again", async () => {
        renderApp("/execution/overview", karim,
            http.get("/api/dashboard/execution", () => HttpResponse.json({ code: "forbidden", message: "You can't see that." }, { status: 403 })),
            ...executionMoneyHandlers);
        expect(await screen.findByText(/Couldn't load the dashboard\./)).toBeInTheDocument();
    });
});
