import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { permissionsOf } from "@/app/permissions/permissions";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { homePath } from "./home";
import { companyNav, domainNav, domainRoutes, pageFor } from "./routeTable";

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
            .toEqual(["Overview", "Projects", "Clients", "Employees", "Financials", "Meetings", "Activity", "Reports", "Settings"]);
        // Execution runs on site, not on a clock: no Employees list, Activity or Reports.
        expect(navLabels(personas.executionAdmin, "execution"))
            .toEqual(["Dashboard", "Projects", "Clients", "Financials", "Meetings", "Settings"]);
        expect(navLabels(personas.designEmployee, "design")).toEqual(["Projects", "My work", "My pay", "Meetings", "Profile"]);
        expect(navLabels(personas.executionEmployee, "execution")).toEqual(["Projects", "My work", "Meetings", "Profile"]);
        expect(navLabels(personas.superAdmin, "execution"))
            .toEqual(["Dashboard", "Projects", "Clients", "Financials", "Meetings", "Settings"]);
        expect(companyNav(permissionsOf(personas.superAdmin)).map((i) => i.label))
            .toEqual(["Overview", "Expenses", "Salaries", "Project pay", "Schedules"]);
        expect(companyNav(permissionsOf(personas.designAdmin))).toEqual([]);
    });

    it("follows personal grants and revokes, not the role", () => {
        const noMoney = withPermissions(personas.designAdmin, { revoke: [P.FINANCIAL_VIEW, P.REPORT_VIEW] });
        expect(navLabels(noMoney, "design")).not.toContain("Financials");
        expect(navLabels(noMoney, "design")).not.toContain("Overview");
        const noActivity = withPermissions(personas.designAdmin, { revoke: [P.ACTIVITY_VIEW] });
        expect(navLabels(noActivity, "design")).not.toContain("Activity");
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

    it("hands admins the admin page and employees the employee page", () => {
        const projects = domainRoutes.find((r) => r.path === "projects")!;
        expect(pageFor(projects, permissionsOf(personas.designAdmin))).toBe(projects.admin);
        expect(pageFor(projects, permissionsOf(personas.designEmployee))).toBe(projects.employee);
    });
});

describe("the guards", () => {
    it("sends a signed-out visitor to sign in", async () => {
        renderApp("/design/projects", null);
        expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/login");
    });

    it("keeps employees out of admin pages by sending them home", async () => {
        renderApp("/design/financials", personas.designEmployee);
        await waitFor(() => expect(window.location.pathname).toBe("/design/projects"));
    });

    it("keeps people out of a domain they can't see", async () => {
        renderApp("/execution/projects", personas.designAdmin);
        await waitFor(() => expect(window.location.pathname).toBe("/design/overview"));
    });

    it("says so when a permission is missing", async () => {
        renderApp("/design/financials", withPermissions(personas.designAdmin, { revoke: [P.FINANCIAL_VIEW] }));
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
});
