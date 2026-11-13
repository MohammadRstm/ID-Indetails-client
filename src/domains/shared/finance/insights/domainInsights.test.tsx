import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { money } from "@/shared/format/money";
import { fmtH } from "@/shared/format/time";
import { domainInsightHandlers, domainInsights } from "@/test/fixtures/domainInsights";
import { executionMoneyHandlers } from "@/test/fixtures/executionMoney";
import { financialsHandlers } from "@/test/fixtures/financials";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const path = "/design/financials?tab=insights";
const risks = domainInsights.designRisks;
const spending = domainInsights.designSpending;
const labour = domainInsights.designLabour;
const forbidden = () => HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed." }, { status: 403 });

const listed = (list: HTMLElement) => within(list).getAllByRole("listitem").map((r) => r.getAttribute("aria-label"));
const spendingPanel = () => screen.getByText("Spending by category", { selector: ".panel-title" }).closest(".panel") as HTMLElement;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("the Financials page's Insights tab", () => {
    it("comes after Costs, and asks for nothing until it is opened", async () => {
        const asked: string[] = [];
        renderApp("/design/financials", rana,
            http.get("/api/finance/insights/:domain/risks", () => { asked.push("risks"); return HttpResponse.json(risks); }),
            http.get("/api/finance/insights/:domain/expenses", () => { asked.push("expenses"); return HttpResponse.json(spending); }),
            http.get("/api/finance/insights/:domain/labour", () => { asked.push("labour"); return HttpResponse.json(labour); }),
            ...financialsHandlers);
        await screen.findByText("Revenue against cost, month by month");
        const tabs = within(screen.getByRole("tab", { name: "Costs" }).parentElement as HTMLElement).getAllByRole("tab");
        expect(tabs.at(-1)).toHaveTextContent("Insights");
        expect(asked).toEqual([]);

        await userEvent.click(screen.getByRole("tab", { name: "Insights" }));
        expect(await screen.findByRole("region", { name: "Projects at risk" })).toBeInTheDocument();
        await waitFor(() => expect([...asked].sort()).toEqual(["expenses", "labour", "risks"]));
    });
});

describe("projects at risk", () => {
    it("lists each project the API found at risk, most pressing first, with what was found and the rule that found it", async () => {
        renderApp(path, rana, ...domainInsightHandlers, ...financialsHandlers);
        const panel = await screen.findByRole("region", { name: "Projects at risk" });
        expect(await within(panel).findByText("7 client projects checked on Sep 30, 2026, the most pressing first.")).toBeInTheDocument();
        const list = within(panel).getByRole("list", { name: "Projects at risk" });
        expect(listed(list)).toEqual(risks.projects.map((p) => p.title));

        const loft = within(list).getByRole("listitem", { name: "Gemmayze loft renovation" });
        expect(within(loft).getByText("Profit at zero")).toHaveClass("pill-neg");
        expect(loft).toHaveTextContent(risks.projects[0].risks[0].fact);
        expect(loft).toHaveTextContent(`Rule: ${risks.projects[0].risks[0].rule}`);
        expect(within(loft).getByText("Department over budget")).toHaveClass("pill-low");
        // its name opens the project's own Insights tab
        expect(within(loft).getByRole("link", { name: "Gemmayze loft renovation" })).toHaveAttribute("href", "/design/projects/11?tab=insights");

        const beach = within(list).getByRole("listitem", { name: "Batroun beach house" });
        expect(within(beach).getByText("On hold")).toBeInTheDocument();
        for (const label of ["Projected loss", "Close to zero", "Refused change waiting", "No exchange rate"]) expect(within(beach).getByText(label)).toBeInTheDocument();
        expect(within(within(list).getByRole("listitem", { name: "Jounieh showroom" })).getByText("Settled at a loss")).toBeInTheDocument();
        expect(within(panel).getByRole("note", { name: "How the risks are found" })).toHaveTextContent("Internal projects: cost centres, never a risk of loss.");
    });

    it("counts the projects of each kind as the API does, and shows just one kind's when it is picked", async () => {
        renderApp(path, rana, ...domainInsightHandlers, ...financialsHandlers);
        const panel = await screen.findByRole("region", { name: "Projects at risk" });
        const kinds = await within(panel).findByRole("group", { name: "Kind of risk" });
        expect(within(kinds).getAllByRole("button").map((b) => b.textContent)).toEqual([
            "All4", "Profit at zero1", "Projected loss1", "Close to zero1", "Refused change waiting1", "Department over budget1", "No exchange rate2", "Settled at a loss1",
        ]);
        await userEvent.click(within(kinds).getByRole("button", { name: /^No exchange rate/ }));
        const list = within(panel).getByRole("list", { name: "Projects at risk" });
        expect(listed(list)).toEqual(["Batroun beach house", "Achrafieh clinic"]);
        await userEvent.click(within(kinds).getByRole("button", { name: /^All/ }));
        expect(listed(list)).toHaveLength(4);
    });

    it("says so when no project is at risk", async () => {
        renderApp(path, rana, http.get("/api/finance/insights/:domain/risks", () => HttpResponse.json(domainInsights.noRisks)), ...domainInsightHandlers, ...financialsHandlers);
        const panel = await screen.findByRole("region", { name: "Projects at risk" });
        expect(await within(panel).findByText("No project is at risk")).toBeInTheDocument();
        expect(within(panel).getByText("No client project has a risk by these rules.")).toBeInTheDocument();
        expect(within(panel).getByText(/^7 client projects checked/)).toBeInTheDocument();
        expect(within(panel).queryByRole("group", { name: "Kind of risk" })).toBeNull();
    });
});

describe("spending", () => {
    it("stacks each month's spending by category and lists what is unusual in it, as the API gives them", async () => {
        const asked: (string | null)[] = [];
        renderApp(path, rana,
            http.get("/api/finance/insights/:domain/expenses", ({ request }) => {
                asked.push(new URL(request.url).searchParams.get("months"));
                return HttpResponse.json(spending);
            }),
            ...domainInsightHandlers, ...financialsHandlers);
        await screen.findByRole("region", { name: "Projects at risk" });
        const figure = spendingPanel();
        expect(await within(figure).findByRole("img", { name: "Spending by category over the last 12 months" })).toBeInTheDocument();
        expect(asked[0]).toBe("12");
        // every category of Design's own list, in its order
        expect([...figure.querySelectorAll(".legend span")].map((s) => s.textContent))
            .toEqual(["Assets & licences", "Services", "Contractor", "Software", "Travel", "Hardware", "Other"]);
        // what has no exchange rate on its day is shown apart, in no figure
        expect(within(figure).getByText(/With no exchange rate on its day/)).toHaveTextContent(`+ ${money.short(4500000, "LBP")}`);

        // the table twin shows each month's figures as they came
        await userEvent.click(within(figure).getByRole("button", { name: "Table" }));
        const september = within(figure).getAllByRole("row").at(-1) as HTMLElement;
        for (const text of ["September 2026", money.fmt(3400), money.fmt(600), money.fmt(4140)]) expect(september).toHaveTextContent(text);

        const unusual = screen.getByRole("region", { name: "Unusual spending" });
        const [month, twice] = within(within(unusual).getByRole("table", { name: "Unusual spending" })).getAllByRole("row").slice(1);
        expect(within(month).getByText("Unusual month")).toBeInTheDocument();
        for (const text of ["September 2026", "Contractor", "Every project", spending.anomalies[0].fact, `Rule: ${spending.anomalies[0].rule}`, money.fmt(3400)]) {
            expect(month).toHaveTextContent(text);
        }
        expect(within(twice).getByText("Same amount twice")).toBeInTheDocument();
        expect(twice).toHaveTextContent("Sep 14, 2026");
        expect(twice).toHaveTextContent(spending.anomalies[1].fact);
        // the project opens where its expenses are
        expect(within(twice).getByRole("link", { name: "Villa Mounir interiors" })).toHaveAttribute("href", "/design/projects/2?tab=financials");
        expect(within(unusual).getByRole("note", { name: "How spending is judged" })).toHaveTextContent("This month runs to today.");

        // more months asks the API for them
        await userEvent.click(within(figure).getByRole("tab", { name: "24 months" }));
        await waitFor(() => expect(asked.at(-1)).toBe("24"));
        expect(await within(unusual).findByText("What the owner's rules call unusual in the last 24 months, newest first.")).toBeInTheDocument();
    });

    it("says so when nothing is unusual", async () => {
        renderApp(path, rana, http.get("/api/finance/insights/:domain/expenses", () => HttpResponse.json(domainInsights.nothingUnusual)), ...domainInsightHandlers, ...financialsHandlers);
        const unusual = await screen.findByRole("region", { name: "Unusual spending" });
        expect(await within(unusual).findByText("Nothing unusual")).toBeInTheDocument();
        expect(within(unusual).queryByRole("table")).toBeNull();
        expect(within(spendingPanel()).queryByText(/With no exchange rate on its day/)).toBeNull();
    });
});

describe("when the insights don't load", () => {
    it("says why beside each, and tries again", async () => {
        let failing = true;
        renderApp(path, rana,
            http.get("/api/finance/insights/:domain/risks", () => (failing ? forbidden() : HttpResponse.json(risks))),
            http.get("/api/finance/insights/:domain/expenses", () => (failing ? forbidden() : HttpResponse.json(spending))),
            ...domainInsightHandlers, ...financialsHandlers);
        const panel = await screen.findByRole("region", { name: "Projects at risk" });
        expect(await within(panel).findByText(/Couldn't load the projects at risk\./)).toBeInTheDocument();
        const figure = spendingPanel();
        expect(await within(figure).findByText(/Couldn't load the spending\./)).toBeInTheDocument();
        // the months can still be picked; the unusual spending waits for the spending
        expect(within(figure).getByRole("tab", { name: "12 months" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Unusual spending" })).toBeNull();

        failing = false;
        await userEvent.click(within(panel).getByRole("button", { name: "Try again" }));
        expect(await within(panel).findByRole("listitem", { name: "Gemmayze loft renovation" })).toBeInTheDocument();
        await userEvent.click(within(figure).getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("region", { name: "Unusual spending" })).toBeInTheDocument();
        expect(await within(figure).findByRole("img", { name: "Spending by category over the last 12 months" })).toBeInTheDocument();
    });
});

describe("labour", () => {
    const labourRegion = () => screen.findByRole("region", { name: "Labour" });

    it("shows Design's labour by month, department and project, as the API gives it", async () => {
        const asked: (string | null)[] = [];
        renderApp(path, rana,
            http.get("/api/finance/insights/:domain/labour", ({ request }) => {
                asked.push(new URL(request.url).searchParams.get("months"));
                return HttpResponse.json(labour);
            }),
            ...domainInsightHandlers, ...financialsHandlers);
        const region = await labourRegion();
        expect(await within(region).findByRole("img", { name: "Labour cost over the last 12 months" })).toBeInTheDocument();
        expect(asked[0]).toBe("12");

        // the headline figures, with the API's own share outside the scope
        const kpi = (label: string) => within(region).getByText(label, { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
        expect(kpi("Hours logged")).toHaveTextContent(fmtH(labour.total.minutes));
        expect(kpi("Outside the scope")).toHaveTextContent(money.pct(labour.total.outsideScopeShare));
        expect(kpi("Outside the scope")).toHaveTextContent(fmtH(labour.total.outsideScopeMinutes));
        expect(within(region).getByText(/With no exchange rate on its day/)).toHaveTextContent(`+ ${money.short(1200000, "LBP")}`);

        // each department, the costliest first, with its share; never a person
        const departments = within(region).getByRole("table", { name: "Labour by department" });
        const departmentRows = within(departments).getAllByRole("row").slice(1) as HTMLTableRowElement[];
        expect(departmentRows.map((r) => r.cells[0].textContent)).toEqual(["Architecture", "Interiors", "No department"]);
        for (const text of [money.fmt(45200), fmtH(180000), fmtH(20400), money.pct(0.5231)]) expect(departmentRows[0]).toHaveTextContent(text);

        // each project: client work opens its Insights tab, internal work its Financials tab
        const projects = within(region).getByRole("table", { name: "Labour by project" });
        const loft = within(projects).getByRole("row", { name: /Gemmayze loft renovation/ });
        for (const text of [money.fmt(28400), fmtH(112800), fmtH(16800), money.pct(0.3287)]) expect(loft).toHaveTextContent(text);
        expect(within(loft).getByRole("link", { name: "Gemmayze loft renovation" })).toHaveAttribute("href", "/design/projects/11?tab=insights");
        const studio = within(projects).getByRole("row", { name: /Studio admin/ });
        expect(within(studio).getByText("Internal")).toBeInTheDocument();
        expect(within(studio).getByRole("link", { name: "Studio admin" })).toHaveAttribute("href", "/design/projects/30?tab=financials");
        expect(within(region).getByRole("note", { name: "How labour is counted" })).toHaveTextContent("paid breaks included");

        // the table twin shows each month as it came
        await userEvent.click(within(region).getByRole("button", { name: "Table" }));
        const september = within(region).getAllByRole("row").find((r) => r.textContent?.startsWith("September 2026")) as HTMLElement;
        for (const text of [money.fmt(6400), fmtH(26100), money.fmt(500), fmtH(2400)]) expect(september).toHaveTextContent(text);

        // more months asks the API for them
        await userEvent.click(within(region).getByRole("tab", { name: "24 months" }));
        await waitFor(() => expect(asked.at(-1)).toBe("24"));
    });

    it("is Design's alone: Execution's Insights tab neither shows nor asks for it", async () => {
        let askedForLabour = false;
        renderApp("/execution/financials?tab=insights", rana,
            http.get("/api/finance/insights/:domain/risks", () => HttpResponse.json({ ...risks, domain: "execution" })),
            http.get("/api/finance/insights/:domain/expenses", () => HttpResponse.json({ ...domainInsights.nothingUnusual, domain: "execution" })),
            http.get("/api/finance/insights/:domain/labour", () => { askedForLabour = true; return HttpResponse.json(labour); }),
            ...executionMoneyHandlers);
        expect(await screen.findByRole("region", { name: "Unusual spending" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Labour" })).toBeNull();
        expect(askedForLabour).toBe(false);
    });

    it("says so when no hours were logged in the months picked", async () => {
        renderApp(path, rana, http.get("/api/finance/insights/:domain/labour", () => HttpResponse.json(domainInsights.noLabour)), ...domainInsightHandlers, ...financialsHandlers);
        const region = await labourRegion();
        expect(await within(region).findByText("No labour in these months")).toBeInTheDocument();
        expect(within(region).queryByRole("table", { name: "Labour by department" })).toBeNull();
        expect(within(region).queryByRole("table", { name: "Labour by project" })).toBeNull();
        expect(within(region).queryByText(/With no exchange rate on its day/)).toBeNull();
    });

    it("says why when it doesn't load, and tries again", async () => {
        let failing = true;
        renderApp(path, rana,
            http.get("/api/finance/insights/:domain/labour", () => (failing ? forbidden() : HttpResponse.json(labour))),
            ...domainInsightHandlers, ...financialsHandlers);
        const region = await labourRegion();
        expect(await within(region).findByText(/Couldn't load the labour\./)).toBeInTheDocument();
        expect(within(region).queryByRole("table", { name: "Labour by project" })).toBeNull();

        failing = false;
        await userEvent.click(within(region).getByRole("button", { name: "Try again" }));
        expect(await within(region).findByRole("table", { name: "Labour by project" })).toBeInTheDocument();
    });
});
