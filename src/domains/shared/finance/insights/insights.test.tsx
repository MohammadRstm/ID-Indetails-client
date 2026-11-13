import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { money } from "@/shared/format/money";
import { insightHandlers, insights } from "@/test/fixtures/insights";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// Admins a super admin has handed the money to: admins don't hold it by default
const nadia = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const project = projectWork.project;
const path = `/design/projects/${project.id}`;
const design = insights.design;

// the page's own tabs, without their counts
const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
const kpi = (panel: HTMLElement, label: string) => within(panel).getByText(label, { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
const step = (panel: HTMLElement, label: string) => within(panel).getByText(label, { selector: ".pb-lab" }).closest(".pb") as HTMLElement;
const tryIt = (whatIf: HTMLElement) => userEvent.click(within(whatIf).getByRole("button", { name: "Try it" }));
/** Answers the what-if with this, keeping what was asked. */
function scenarioAnswering(answer: () => Response, asked: Record<string, string>[] = []) {
    return http.get("/api/finance/insights/projects/:id/scenario", ({ request }) => {
        const seen: Record<string, string> = {};
        new URL(request.url).searchParams.forEach((value, key) => { seen[key] = value; });
        asked.push(seen);
        return answer();
    });
}

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("who gets a project's Insights tab", () => {
    it("gives whoever sees the money the tab, after the money tabs", async () => {
        renderApp(path, nadia, ...insightHandlers, ...projectWorkHandlers);
        await screen.findByRole("tab", { name: "Insights" });
        expect(tabs().slice(0, 4)).toEqual(["Financials", "Client payments", "Variation orders", "Insights"]);
    });

    it("gives no one else the tab, even by link, and asks nothing", async () => {
        const asked: string[] = [];
        renderApp(`${path}?tab=insights`, personas.designAdmin,
            http.get("/api/finance/insights/projects/:id", () => { asked.push("insights"); return HttpResponse.json({}, { status: 403 }); }),
            ...projectWorkHandlers);
        expect(await screen.findByText("Total hours")).toBeInTheDocument();
        expect(tabs()).not.toContain("Insights");
        expect(asked).toEqual([]);
    });

    it("leaves it off an internal Design project, which has no price", async () => {
        const internal = { ...project, billingType: "internal", client: null };
        renderApp(path, nadia, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)), ...insightHandlers, ...projectWorkHandlers);
        await screen.findByRole("tab", { name: "Financials" });
        expect(tabs()).not.toContain("Insights");
    });
});

describe("a project's insights", () => {
    it("shows the agreed figures, where the profit comes from, the departments and how it was worked out, as the API gives them", async () => {
        renderApp(`${path}?tab=insights`, nadia, ...insightHandlers, ...projectWorkHandlers);
        const panel = await screen.findByRole("region", { name: "Profitability" });
        expect(kpi(panel, "Agreed revenue")).toHaveTextContent(money.exact(design.agreedRevenue));
        expect(kpi(panel, "Agreed profit")).toHaveTextContent(money.exact(design.agreedProfit));
        expect(kpi(panel, "Margin")).toHaveTextContent(money.pct(design.margin));
        expect(within(kpi(panel, "Profit floor")).getByText("Healthy")).toHaveClass("pill-high");
        expect(kpi(panel, "Client still owes")).toHaveTextContent(money.exact(design.owed));
        // a site's cash profit is a site's alone
        expect(within(panel).queryByText("Profit so far", { selector: ".kpi-label" })).toBeNull();

        // each step, signed: what adds to the profit and what takes from it, then the profit they come to
        expect(step(panel, "Price first agreed")).toHaveTextContent(money.short(18000));
        expect(step(panel, "Variation orders")).toHaveTextContent(money.short(8000));
        expect(step(panel, "Employee labour")).toHaveTextContent(money.short(-1915.48));
        expect(step(panel, "Employee labour").querySelector(".pb-val")).toHaveClass("down");
        expect(step(panel, "Project expenses").querySelector(".pb-val")).toHaveClass("down");
        const total = panel.querySelector(".cost-row.strong") as HTMLElement;
        expect(total).toHaveTextContent("Agreed profit");
        expect(total).toHaveTextContent(money.exact(design.agreedProfit));
        expect(within(panel).getByRole("note", { name: "How this is worked out" })).toHaveTextContent("The margin shows once the project is done");

        const departments = screen.getByRole("region", { name: "Departments" });
        const architecture = within(departments).getByRole("row", { name: "Architecture" });
        for (const text of ["60%", money.fmt(15600), money.fmt(1300), money.fmt(14300), "68%"]) expect(architecture).toHaveTextContent(text);
        // pounds logged with no rate on their day are shown apart, not converted
        expect(within(departments).getByRole("row", { name: "Interiors" })).toHaveTextContent(`+ ${money.short(4500000, "LBP")}`);
        expect(within(departments).getByRole("row", { name: "Other hours" })).toHaveTextContent("In no budget");
    });

    it("shows each department's hours against those planned, as the API works out its progress, and a dash with no plan", async () => {
        renderApp(`${path}?tab=insights`, nadia, ...insightHandlers, ...projectWorkHandlers);
        const departments = await screen.findByRole("region", { name: "Departments" });
        const architecture = within(departments).getByRole("row", { name: "Architecture" });
        expect(within(architecture).getByText("100h of 80h")).toBeInTheDocument();
        expect(within(architecture).getByText("125%").previousElementSibling).toHaveClass("warn");
        expect(within(within(departments).getByRole("row", { name: "Interiors" })).queryByText(/ of /)).toBeNull();
        expect(within(within(departments).getByRole("row", { name: "Other hours" })).queryByText(/ of /)).toBeNull();
    });

    it("leaves the planned hours out while no department has a plan", async () => {
        const unplanned = { ...design, departments: design.departments!.map((d) => ({ ...d, plannedMinutes: null, progress: null })) };
        renderApp(`${path}?tab=insights`, nadia, http.get("/api/finance/insights/projects/:id", () => HttpResponse.json(unplanned)), ...insightHandlers, ...projectWorkHandlers);
        const departments = await screen.findByRole("region", { name: "Departments" });
        expect(within(departments).queryByRole("columnheader", { name: "Planned hours" })).toBeNull();
    });

    it("shows a site's profit so far and its own steps, with no departments", async () => {
        renderApp(`/execution/projects/${site.project.id}?tab=insights`, karim, ...insightHandlers, ...siteHandlers);
        const panel = await screen.findByRole("region", { name: "Profitability" });
        expect(kpi(panel, "Profit so far")).toHaveTextContent(money.exact(insights.site.siteCashProfit!));
        expect(kpi(panel, "Client still owes")).toHaveTextContent(money.exact(insights.site.owed));
        for (const label of ["Price first agreed", "Variation orders", "Supervision", "Site expenses", "Ground labour"]) expect(step(panel, label)).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Departments" })).toBeNull();
        // a site's own levers: its supervision, and its expenses and ground labour for an extra cost
        const whatIf = screen.getByRole("region", { name: "What if" });
        expect(within(whatIf).getByLabelText("Supervision")).toBeInTheDocument();
        expect(within(whatIf).getByLabelText("Where the cost goes")).toHaveTextContent("Site expenses");
    });

    it("shows a site's progress by value once its staff have recorded executed quantities", async () => {
        renderApp(`/execution/projects/${site.project.id}?tab=insights`, karim, ...insightHandlers, ...siteHandlers);
        const panel = await screen.findByRole("region", { name: "Profitability" });
        expect(kpi(panel, "Executed (by value)")).toHaveTextContent("42.0%");
    });

    it("leaves the progress by value out until a line has a record", async () => {
        renderApp(`/execution/projects/${site.project.id}?tab=insights`, karim,
            http.get("/api/finance/insights/projects/:id", () => HttpResponse.json({ ...insights.site, executedProgress: null })), ...insightHandlers, ...siteHandlers);
        const panel = await screen.findByRole("region", { name: "Profitability" });
        expect(kpi(panel, "Profit so far")).toBeInTheDocument();
        expect(within(panel).queryByText("Executed (by value)", { selector: ".kpi-label" })).toBeNull();
    });

    it("says why it couldn't load", async () => {
        renderApp(`${path}?tab=insights`, nadia,
            http.get("/api/finance/insights/projects/:id", () => HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed." }, { status: 403 })),
            ...projectWorkHandlers);
        expect(await screen.findByText(/Couldn't load the project's insights\./)).toBeInTheDocument();
    });
});

describe("what if…", () => {
    it("tries a change and shows today's figures beside the changed ones, saving nothing", async () => {
        const asked: Record<string, string>[] = [];
        renderApp(`${path}?tab=insights`, nadia, scenarioAnswering(() => HttpResponse.json(insights.designScenario), asked), ...insightHandlers, ...projectWorkHandlers);
        const whatIf = await screen.findByRole("region", { name: "What if" });
        expect(within(whatIf).getByText(/Nothing is saved\./)).toBeInTheDocument();

        // nothing chosen yet: it says so, and asks nothing
        await tryIt(whatIf);
        expect(within(whatIf).getByText("Choose at least one change to try.")).toBeInTheDocument();
        expect(asked).toEqual([]);

        await userEvent.type(within(whatIf).getByLabelText("Variation order"), "2000");
        await tryIt(whatIf);
        const result = await within(whatIf).findByRole("region", { name: "What the changes would do" });
        expect(asked).toEqual([{ voAmount: "2000" }]);
        const revenue = within(result).getByRole("row", { name: "Agreed revenue" });
        expect(revenue).toHaveTextContent(money.exact(26000));
        expect(revenue).toHaveTextContent(money.exact(28000));
        expect(within(result).getByRole("row", { name: "Agreed profit" })).toHaveTextContent(money.exact(insights.designScenario.after.agreedProfit));
        expect(result.querySelector(".cost-row.strong")).toHaveTextContent(`Profit change+${money.exact(2000)}`);
        expect(within(result).queryByText("The profit floor would refuse this.")).toBeNull();
    });

    it("warns when the profit floor would refuse the changes for real", async () => {
        const asked: Record<string, string>[] = [];
        renderApp(`${path}?tab=insights`, nadia, scenarioAnswering(() => HttpResponse.json(insights.designFloorScenario), asked), ...insightHandlers, ...projectWorkHandlers);
        const whatIf = await screen.findByRole("region", { name: "What if" });
        await userEvent.type(within(whatIf).getByLabelText("Extra cost"), "30000");
        await tryIt(whatIf);
        expect(await within(whatIf).findByText("The profit floor would refuse this.")).toBeInTheDocument();
        expect(asked).toEqual([{ extraCost: "30000", extraCostSource: "labour" }]);
        const result = within(whatIf).getByRole("region", { name: "What the changes would do" });
        expect(within(result).getByRole("row", { name: "Profit floor" })).toHaveTextContent("At zero or below");
    });

    it("keeps a variation order and a settlement apart, and says why the API refused the changes", async () => {
        renderApp(`${path}?tab=insights`, nadia,
            scenarioAnswering(() => HttpResponse.json({ type: "business_rule", code: "nothing_owed", message: "The client owes nothing on this project." }, { status: 422 })),
            ...insightHandlers, ...projectWorkHandlers);
        const whatIf = await screen.findByRole("region", { name: "What if" });
        const vo = within(whatIf).getByLabelText("Variation order");
        await userEvent.type(vo, "2000");
        await userEvent.click(within(whatIf).getByLabelText("What the client still owes"));
        await userEvent.click(screen.getByRole("option", { name: "Excused" }));
        // a settlement sets the price to what the client paid, so a variation order can't go with it
        expect(vo).toBeDisabled();
        expect(vo).toHaveValue("");

        await tryIt(whatIf);
        expect(await within(whatIf).findByText("The client owes nothing on this project.")).toBeInTheDocument();
        expect(within(whatIf).queryByRole("region", { name: "What the changes would do" })).toBeNull();
    });
});
