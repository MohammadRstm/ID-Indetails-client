import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { permissionsOf } from "@/app/permissions/permissions";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { homePath } from "./home";
import { canOpen, companyNav, domainNav, domainRoutes, pageFor } from "./routeTable";

const navLabels = (user: typeof personas.designAdmin, domain: "design" | "execution") =>
    domainNav(permissionsOf(user), domain).map((item) => item.label);

describe("the route table", () => {
    it("gives every route a page for admins or employees", () => {
        for (const route of domainRoutes) {
            expect(route.admin ?? route.employee, route.path).toBeTruthy();
        }
    });

    it("builds each persona's sidebar from what they may open", () => {
        expect(navLabels(personas.designAdmin, "design"))
            .toEqual(["Overview", "Projects", "Clients", "Employees", "Meetings", "Activity", "Reports", "Settings"]);
        // Execution runs on site, not on a clock: no Employees list, Activity or Reports.
        expect(navLabels(personas.executionAdmin, "execution"))
            .toEqual(["Dashboard", "Projects", "Clients", "Meetings", "Settings"]);
        expect(navLabels(personas.designEmployee, "design")).toEqual(["Projects", "My work", "My pay", "Meetings", "Profile"]);
        expect(navLabels(personas.executionEmployee, "execution")).toEqual(["Projects", "My work", "Meetings", "Profile"]);
        expect(navLabels(personas.superAdmin, "execution"))
            .toEqual(["Dashboard", "Projects", "Clients", "Financials", "Meetings", "Settings"]);
        expect(companyNav(permissionsOf(personas.superAdmin)).map((i) => i.label))
            .toEqual(["Overview", "Expenses", "Salaries", "Project pay", "Schedules", "Website", "Proton", "Settings"]);
        expect(companyNav(permissionsOf(personas.designAdmin))).toEqual([]);
    });

    it("follows personal grants and revokes, not the role", () => {
        // the money is the super admins' until one of them hands it to an admin
        expect(navLabels(withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING }), "design")).toContain("Financials");
        expect(navLabels(withPermissions(personas.executionAdmin, { grant: [P.FINANCIAL_VIEW] }), "execution")).toContain("Financials");
        const noMoney = withPermissions(personas.designAdmin, { revoke: [P.FINANCIAL_VIEW, P.REPORT_VIEW] });
        expect(navLabels(noMoney, "design")).not.toContain("Financials");
        expect(navLabels(noMoney, "design")).not.toContain("Overview");
        const noActivity = withPermissions(personas.designAdmin, { revoke: [P.ACTIVITY_VIEW] });
        expect(navLabels(noActivity, "design")).not.toContain("Activity");
        // an employee given activity:view gets the page, and loses it again when it is taken back
        const watcher = withPermissions(personas.designEmployee, { grant: [P.ACTIVITY_VIEW] });
        expect(navLabels(watcher, "design")).toEqual(["Projects", "My work", "My pay", "Meetings", "Activity", "Profile"]);
        expect(navLabels(withPermissions(watcher, { revoke: [P.ACTIVITY_VIEW] }), "design")).not.toContain("Activity");
        expect(navLabels(withPermissions(personas.executionEmployee, { grant: [P.ACTIVITY_VIEW] }), "execution")).not.toContain("Activity");
    });

    it("gives an employee each admin page as soon as a permission opens it, and takes it away again", () => {
        const employee = personas.designEmployee;
        const plus = (...grant: (typeof P)[keyof typeof P][]) => navLabels(withPermissions(employee, { grant }), "design");
        expect(plus(P.REPORT_VIEW)).toEqual(["Overview", "Projects", "My work", "My pay", "Meetings", "Reports", "Profile"]);
        expect(plus(P.CLIENT_VIEW)).toContain("Clients");
        expect(plus(P.FINANCIAL_VIEW)).toContain("Financials");
        expect(plus(P.TEAM_MANAGE)).toContain("Settings");
        // the Employees list, with everyone's hours once they may see them
        expect(plus(P.EMPLOYEE_VIEW)).toContain("Employees");
        expect(canOpen(permissionsOf(withPermissions(employee, { grant: [P.EMPLOYEE_VIEW] })), "design", "people/12")).toBe(true);
        // an action alone, without what shows it, opens nothing
        expect(plus(P.CLIENT_CREATE)).toEqual(navLabels(employee, "design"));
        // with everything, the admin's pages and their own
        const all = withPermissions(employee, { grant: Object.values(P) });
        expect(navLabels(all, "design")).toEqual(
            ["Overview", "Projects", "Clients", "Employees", "Financials", "My work", "My pay", "Meetings", "Activity", "Reports", "Profile", "Settings"]);
        expect(navLabels(withPermissions(all, { revoke: [P.FINANCIAL_VIEW, P.CLIENT_VIEW] }), "design")).not.toContain("Clients");
    });

    it("starts each person in the right place", () => {
        expect(homePath(permissionsOf(personas.superAdmin))).toBe("/company");
        expect(homePath(permissionsOf(personas.designAdmin))).toBe("/design/overview");
        expect(homePath(permissionsOf(personas.executionAdmin))).toBe("/execution/overview");
        expect(homePath(permissionsOf(personas.designEmployee))).toBe("/design/projects");
        expect(homePath(permissionsOf(personas.executionEmployee))).toBe("/execution/projects");
        // No report:view: the first thing they can open instead.
        expect(homePath(permissionsOf(withPermissions(personas.designAdmin, { revoke: [P.REPORT_VIEW] })))).toBe("/design/projects");
        // A grant that opens the other domain brings the launcher.
        const both = withPermissions(personas.designAdmin, { grant: [P.PROJECT_PRICING_MANAGE], visibleDomains: ["design", "execution"] });
        expect(homePath(permissionsOf(both))).toBe("/company");
    });

    it("says which pages a person may open, from a path", () => {
        const admin = permissionsOf(personas.designAdmin);
        const employee = permissionsOf(personas.designEmployee);
        expect(canOpen(admin, "design", "clients/4")).toBe(true);
        expect(canOpen(admin, "design", "financials?tab=billing")).toBe(false);
        expect(canOpen(permissionsOf(withPermissions(personas.designAdmin, { grant: [P.FINANCIAL_VIEW] })), "design", "financials?tab=billing")).toBe(true);
        expect(canOpen(employee, "design", "clients/4")).toBe(false);
        expect(canOpen(employee, "design", "projects/1")).toBe(true);
        // Another domain's pages, even with the right permissions.
        expect(canOpen(admin, "execution", "projects/1")).toBe(false);
        expect(canOpen(admin, "design", "no-such-page")).toBe(false);
    });

    it("gives everyone the same projects page, its parts by permission", () => {
        const projects = domainRoutes.find((r) => r.path === "projects")!;
        expect(projects.employee).toBeUndefined();
        expect(pageFor(projects, permissionsOf(personas.designAdmin))).toBe(projects.admin);
        expect(pageFor(projects, permissionsOf(personas.designEmployee))).toBe(projects.admin);
        // a page that is only someone's own still goes by workspace
        const myWork = domainRoutes.find((r) => r.path === "my-work")!;
        expect(pageFor(myWork, permissionsOf(personas.designEmployee))).toBe(myWork.employee);
        expect(pageFor(myWork, permissionsOf(personas.designAdmin))).toBeUndefined();
    });
});

describe("the guards", () => {
    it("sends a signed-out visitor to sign in", async () => {
        renderApp("/design/projects", null);
        expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/login");
    });

    it("says an employee has no access to an admin page their permissions don't open", async () => {
        renderApp("/design/financials", personas.designEmployee);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });

    it("keeps people out of a domain they can't see", async () => {
        renderApp("/execution/projects", personas.designAdmin);
        await waitFor(() => expect(window.location.pathname).toBe("/design/overview"));
    });

    it("says so when a permission is missing", async () => {
        // a plain admin holds no financial:view
        renderApp("/design/financials", personas.designAdmin);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });

    it("asks for a new password before anything else", async () => {
        renderApp("/design/projects", { ...personas.superAdmin, mustChangePassword: true });
        expect(await screen.findByRole("heading", { name: "Choose your own password" })).toBeInTheDocument();
    });

    it("shows the sidebar each persona may use", async () => {
        renderApp("/design/projects", personas.designEmployee);
        const nav = await screen.findByRole("navigation");
        expect(within(nav).getByText("My pay")).toBeInTheDocument();
        expect(within(nav).queryByText("Financials")).not.toBeInTheDocument();
        expect(within(nav).queryByText("All areas")).not.toBeInTheDocument();
    });

    it("lands a super admin on the launcher", async () => {
        renderApp("/", personas.superAdmin);
        expect(await screen.findByRole("heading", { name: "What would you like to manage?" })).toBeInTheDocument();
        expect(screen.getByText("Company overview")).toBeInTheDocument();
    });
    it("gives the launcher a way into the company pages someone was granted without the overview", async () => {
        // a design admin given salary:view alone
        renderApp("/", withPermissions(personas.designAdmin, { grant: [P.SALARY_VIEW] }));
        expect(await screen.findByRole("heading", { name: "What would you like to manage?" })).toBeInTheDocument();
        expect(screen.queryByText("Company overview")).not.toBeInTheDocument();
        const tile = screen.getByText("Company").closest("button") as HTMLElement;
        expect(within(tile).getByText(/Salaries/)).toBeInTheDocument();
    });
});
