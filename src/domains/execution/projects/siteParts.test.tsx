import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const tarek = personas.executionEmployee;
const project = site.project;
const path = `/execution/projects/${project.id}`;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** The names of the sub-tabs of the Financials tab (the page's own tabs are in another tablist). */
const parts = async () => {
    const list = await screen.findByRole("tablist", { name: "Financials" });
    return within(list).getAllByRole("tab").map((t) => t.textContent);
};
const selectedPart = async () => {
    const list = await screen.findByRole("tablist", { name: "Financials" });
    return within(list).getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);
};
const internal = { ...project, billingType: "internal", client: null };

describe("the parts of an Execution site's Financials tab", () => {
    it("are, for someone who sees money on a client site, the overview first and then the money parts", async () => {
        renderApp(path, karim, ...siteHandlers);
        expect(await parts()).toEqual(["Overview", "Client payments", "Accounts", "BOQs", "Supervision", "Overall expenses", "Site staff"]);
        expect(await selectedPart()).toEqual(["Overview"]);
        // the site has no top-level Overview, BOQs or Supervision tab any more
        expect(screen.getByRole("tab", { name: "Financials", selected: true })).toBeInTheDocument();
        expect(screen.getAllByRole("tab", { name: /^(Overview|BOQs|Supervision)$/ })).toHaveLength(3);
    });

    it("opens the one in the link, and a click on another puts it in the link", async () => {
        renderApp(`${path}?part=supervision`, karim, ...siteHandlers);
        expect(await screen.findByRole("region", { name: "Supervision taken" })).toBeInTheDocument();
        expect(await selectedPart()).toEqual(["Supervision"]);
        await userEvent.click(screen.getByRole("tab", { name: "Client payments" }));
        expect(await screen.findByRole("region", { name: "Payments received" })).toBeInTheDocument();
        expect(await selectedPart()).toEqual(["Client payments"]);
        expect(screen.queryByRole("region", { name: "Supervision taken" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
        expect(await screen.findByText("Project money")).toBeInTheDocument();
        expect(await selectedPart()).toEqual(["Overview"]);
    });

    it("show the accounts, the BOQs and the site staff as the part asked for", async () => {
        renderApp(`${path}?part=accounts`, karim, ...siteHandlers);
        expect(await screen.findByRole("region", { name: "Price and costs" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "BOQs" }));
        expect(await screen.findByRole("region", { name: "Bills of quantities" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "Site staff" }));
        expect(await screen.findByLabelText("Site staff")).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Bills of quantities" })).not.toBeInTheDocument();
    });

    it("leave out the overview and the money parts for someone without financial:view, who opens on the first they may", async () => {
        renderApp(path, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }), ...siteHandlers);
        // boq:create keeps the BOQs: the first part left
        expect(await parts()).toEqual(["BOQs", "Overall expenses", "Site staff"]);
        expect(await selectedPart()).toEqual(["BOQs"]);
    });

    it("leave out the BOQs too for someone with none of boq:create, financial:view and project:pricing_manage", async () => {
        renderApp(path, personas.executionAdmin, ...siteHandlers);
        expect(await parts()).toEqual(["Overall expenses", "Site staff"]);
        expect(await selectedPart()).toEqual(["Overall expenses"]);
    });

    it("are only the expenses and the staff for site staff, whom the Financials tab is still open to", async () => {
        const mine = { ...site.losingProject, money: null, staff: [{ id: tarek.id, name: "Tarek Nasser" }] };
        renderApp(`/execution/projects/${mine.id}?part=accounts`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(mine)), ...siteHandlers);
        expect(await parts()).toEqual(["Overall expenses", "Site staff"]);
        // a part they may not open falls back to their first one, even when the link asks for it
        expect(await selectedPart()).toEqual(["Overall expenses"]);
        expect(screen.queryByRole("region", { name: "Price and costs" })).not.toBeInTheDocument();
    });

    it("are the overview, the expenses and the staff on an internal site, which has no client money", async () => {
        renderApp(`${path}?part=payments`, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)), ...siteHandlers);
        expect(await parts()).toEqual(["Overview", "Overall expenses", "Site staff"]);
        expect(await selectedPart()).toEqual(["Overview"]);
    });
});

describe("a link to a tab that became a part of the Financials tab", () => {
    it("opens the BOQs part from the old BOQs tab", async () => {
        renderApp(`${path}?tab=boqs`, karim, ...siteHandlers);
        expect(await screen.findByRole("region", { name: "Bills of quantities" })).toBeInTheDocument();
        expect(await selectedPart()).toEqual(["BOQs"]);
        expect(screen.getByRole("tab", { name: "Financials", selected: true })).toBeInTheDocument();
    });

    it("opens the Supervision part from the old Supervision tab", async () => {
        renderApp(`${path}?tab=supervision`, karim, ...siteHandlers);
        expect(await screen.findByRole("region", { name: "Supervision taken" })).toBeInTheDocument();
        expect(await selectedPart()).toEqual(["Supervision"]);
    });

    it("opens the expenses from the old Overview tab, where they were", async () => {
        renderApp(`${path}?tab=overview`, karim, ...siteHandlers);
        expect(await screen.findByLabelText("Item 1")).toBeInTheDocument();
        expect(await selectedPart()).toEqual(["Overall expenses"]);
    });

    it("falls back to the first part for someone who may not open the one the old link names", async () => {
        renderApp(`${path}?tab=supervision`, personas.executionAdmin, ...siteHandlers);
        expect(await parts()).toEqual(["Overall expenses", "Site staff"]);
        expect(await selectedPart()).toEqual(["Overall expenses"]);
        expect(screen.queryByRole("region", { name: "Supervision taken" })).not.toBeInTheDocument();
    });
});

describe("a site's Overall expenses part", () => {
    it("has the expenses and the ground labour as two views, the expenses first", async () => {
        renderApp(`${path}?part=expenses`, karim, ...siteHandlers);
        const views = await screen.findByRole("tablist", { name: "Overall expenses" });
        expect(within(views).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Expenses", "Ground labour"]);
        expect(within(views).getByRole("tab", { name: "Expenses", selected: true })).toBeInTheDocument();
        expect(await screen.findByLabelText("Item 1")).toBeInTheDocument();
        expect(screen.queryByText("Weekly labour")).not.toBeInTheDocument();
    });

    it("shows the ground labour view with how long it lasts first, then the weeks reported", async () => {
        renderApp(`${path}?part=expenses`, karim, ...siteHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Ground labour" }));
        const health = (await screen.findByText("Ground labour and profit")).closest(".panel") as HTMLElement;
        const weekly = (await screen.findByText("Weekly labour")).closest(".panel") as HTMLElement;
        expect(health.compareDocumentPosition(weekly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.queryByLabelText("Item 1")).not.toBeInTheDocument();
        // and back
        await userEvent.click(screen.getByRole("tab", { name: "Expenses" }));
        expect(await screen.findByLabelText("Item 1")).toBeInTheDocument();
        expect(screen.queryByText("Weekly labour")).not.toBeInTheDocument();
    });

    it("opens the view in the link", async () => {
        renderApp(`${path}?part=expenses&view=labour`, karim, ...siteHandlers);
        expect(await screen.findByText("Weekly labour")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Ground labour", selected: true })).toBeInTheDocument();
    });

    it("shows only the ground labour, without the row of views, to someone with no expense permission", async () => {
        const mine = { ...site.losingProject, money: null, staff: [{ id: tarek.id, name: "Tarek Nasser" }] };
        renderApp(`/execution/projects/${mine.id}?part=expenses&view=expenses`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(mine)), ...siteHandlers);
        expect(await screen.findByText("Weekly labour")).toBeInTheDocument();
        expect(screen.queryByRole("tablist", { name: "Overall expenses" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Item 1")).not.toBeInTheDocument();
    });

    it("shows the ground labour without the profit it lasts against for someone who does not see money", async () => {
        renderApp(`${path}?part=expenses&view=labour`, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }), ...siteHandlers);
        expect(await screen.findByText("Weekly labour")).toBeInTheDocument();
        expect(screen.queryByText("Ground labour and profit")).not.toBeInTheDocument();
    });

    it("forgets the view when another part is opened", async () => {
        renderApp(`${path}?part=expenses&view=labour`, karim, ...siteHandlers);
        await screen.findByText("Weekly labour");
        await userEvent.click(screen.getByRole("tab", { name: "Site staff" }));
        await userEvent.click(screen.getByRole("tab", { name: "Overall expenses" }));
        expect(await screen.findByLabelText("Item 1")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Expenses", selected: true })).toBeInTheDocument();
    });
});
