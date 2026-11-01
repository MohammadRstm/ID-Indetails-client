import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { permissionsOf } from "@/app/permissions/permissions";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { findPlaces, STRONG, words, type PlaceContext } from "./searchPlaces";
import type { ShellArea } from "./useArea";

const company: ShellArea = { kind: "company", section: null };
const design: ShellArea = { kind: "domain", domain: "design", section: null };
const execution: ShellArea = { kind: "domain", domain: "execution", section: null };
const noop = () => {};
// A Design admin a super admin has handed the money and hiring to: admins don't hold them by default
const moneyAdmin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });

function ctxOf(user: CurrentUser, area: ShellArea): PlaceContext {
    return { p: permissionsOf(user), area, userId: user.id, dark: false, run: { logWork: noop, toggleTheme: noop, signOut: noop, openProton: noop } };
}

/** The first place a search finds, where it leads, and whether it beats the API's results. */
function top(user: CurrentUser, area: ShellArea, query: string) {
    const [first] = findPlaces(ctxOf(user, area), query);
    return first && { label: first.label, path: "path" in first.target ? first.target.path : "(action)", strong: first.score >= STRONG };
}

const labels = (user: CurrentUser, area: ShellArea, query: string) => findPlaces(ctxOf(user, area), query).map((f) => f.label);

describe("finding a page by what people call it", () => {
    it.each([
        ["salaries"], ["salary"], ["payroll"], ["employee pay"], ["wages"], ["staff pay"], ["pay slips"], ["overtime pay"], ["unpaid leave"],
    ])("finds Salaries for a super admin from %j", (query) => {
        expect(top(personas.superAdmin, company, query)).toEqual({ label: "Open salaries", path: "/company/salaries", strong: true });
    });

    it.each([
        ["company expenses", "/company/overhead"], ["subscriptions", "/company/overhead"], ["rent", "/company/overhead"], ["overhead", "/company/overhead"],
        ["schedules", "/company/schedules"], ["shifts", "/company/schedules"], ["roster", "/company/schedules"],
        ["project pay", "/company/project-pay"], ["labor cost by project", "/company/project-pay"],
        ["net profit", "/company/overview"], ["p&l", "/company/overview"], ["profit and loss", "/company/overview"],
        ["logo", "/company/settings?section=general"], ["exchange rate", "/company/settings?section=finance"], ["bank details", "/company/settings?section=finance"],
        ["permissions", "/company/settings?section=admins"], ["working hours", "/company/settings?section=time"], ["export", "/company/settings?section=data"],
        ["part time", "/company/schedules"],
        ["change password", "/change-password"], ["my profile", "/company/profile"],
    ])("leads a super admin from %j to %s", (query, path) => {
        expect(top(personas.superAdmin, company, query)?.path).toBe(path);
    });

    it("takes a super admin to the company overview's Teams tab, and a business admin to their Settings", () => {
        expect(top(personas.superAdmin, company, "teams")?.path).toBe("/company/overview?tab=teams");
        expect(top(personas.superAdmin, design, "departments")?.path).toBe("/company/overview?tab=teams");
        expect(top(personas.designAdmin, design, "teams")?.path).toBe("/design/settings?section=teams");
        expect(top(personas.executionAdmin, execution, "team")?.path).toBe("/execution/settings?section=teams");
    });

    it("takes a super admin to everyone in the company, and a Design admin to Design's employees", () => {
        expect(top(personas.superAdmin, company, "staff")?.path).toBe("/company/overview?tab=people");
        expect(top(personas.designAdmin, design, "staff")?.path).toBe("/design/people");
        expect(top(personas.superAdmin, company, "hire")?.path).toBe("/company/overview?tab=people&invite=1");
        expect(top(moneyAdmin, design, "invite")?.path).toBe("/design/people?invite=1");
        expect(findPlaces(ctxOf(personas.designAdmin, design), "invite").map((f) => "path" in f.target && f.target.path)).not.toContain("/design/people?invite=1");
    });

    it("offers a business page in each business from the company area, and only the current one inside a business", () => {
        const fromCompany = findPlaces(ctxOf(personas.superAdmin, company), "invoices").filter((f) => f.label === "Billing and invoices");
        expect(fromCompany.map((f) => [f.target.sub, "path" in f.target && f.target.path])).toEqual([
            ["Design", "/design/financials?tab=billing"], ["Execution", "/execution/financials?tab=billing"],
        ]);
        expect(findPlaces(ctxOf(personas.superAdmin, design), "invoices").filter((f) => f.label === "Billing and invoices")).toHaveLength(1);
    });

    it.each([
        ["customers", "Open clients", "/design/clients"], ["add customer", "Add client", "/design/clients?new=1"],
        ["timesheets", "Open reports", "/design/reports"], ["audit log", "Open activity", "/design/activity"], ["calendar", "Open meetings", "/design/overview?tab=meetings"],
        ["chat", "Open messages", "/design/messages"], ["alerts", "Open notifications", "/design/notifications"],
        ["create project", "New project", "/design/projects?new=1"], ["dashboard", "Open overview", "/design/overview"],
        ["auto archive", "Project settings", "/design/settings?section=projects"], ["weekly summary", "Notification settings", "/design/settings?section=notifications"],
    ])("leads a Design admin from %j to %s", (query, label, path) => {
        expect(top(personas.designAdmin, design, query)).toEqual({ label, path, strong: true });
    });

    it.each([
        ["invoices", "Billing and invoices", "/design/financials?tab=billing"], ["money owed", "Billing and invoices", "/design/financials?tab=billing"],
        ["late payments", "Overdue invoices", "/design/financials?tab=billing&overdue=1"], ["spending", "Costs and expenses", "/design/financials?tab=costs"],
        ["most profitable", "Profit by project", "/design/financials?tab=projects"], ["top clients", "Revenue by client", "/design/financials?tab=clients"],
        ["bank details", "Finance settings", "/design/settings?section=finance"],
    ])("leads a Design admin holding the money from %j to %s", (query, label, path) => {
        expect(top(moneyAdmin, design, query)).toEqual({ label, path, strong: true });
    });

    it("leads a plain Design admin to none of the money", () => {
        const money = ["Billing and invoices", "Overdue invoices", "Costs and expenses", "Profit by project", "Revenue by client", "Open financials", "Finance settings"];
        for (const query of ["invoices", "money owed", "late payments", "spending", "most profitable", "top clients", "financials", "bank details", "invoicing"]) {
            expect(labels(personas.designAdmin, design, query).filter((l) => money.includes(l)), query).toEqual([]);
        }
    });

    it("leads to Admins and access only someone its section shows to", () => {
        expect(top(moneyAdmin, design, "make admin")).toEqual({ label: "Admins and access", path: "/design/settings?section=admins", strong: true });
        expect(labels(personas.designAdmin, design, "make admin")).not.toContain("Admins and access");
    });

    it("lets an employee find their own work, never their pay or the company's", () => {
        for (const query of ["salary", "my pay", "payslip"]) {
            expect(labels(personas.designEmployee, design, query), query).not.toContain("My pay");
        }
        expect(top(personas.designEmployee, design, "timesheet")?.path).toBe("/design/my-work");
        expect(top(personas.designEmployee, design, "log hours")?.label).toBe("Log work");
        expect(top(personas.designEmployee, design, "my profile")?.path).toBe("/design/profile");
        const notTheirs = ["Open salaries", "Billing and invoices", "Open company expenses", "Open teams", "Admins and access", "Open clients", "Open financials"];
        for (const query of ["payroll", "invoices", "company expenses", "teams", "permissions", "clients", "financials"]) {
            expect(labels(personas.designEmployee, design, query).filter((l) => notTheirs.includes(l))).toEqual([]);
        }
    });

    it("never offers a page its permission doesn't allow", () => {
        const noSalaries = withPermissions(personas.superAdmin, { revoke: [P.SALARY_VIEW] });
        expect(labels(noSalaries, company, "payroll")).not.toContain("Open salaries");
        const noInvoices = withPermissions(moneyAdmin, { revoke: [P.FINANCIAL_VIEW] });
        expect(labels(noInvoices, design, "invoices")).not.toContain("Billing and invoices");
        expect(labels(personas.executionAdmin, execution, "reports")).not.toContain("Open reports");
    });

    it("forgives a typo and finishes a word being typed", () => {
        expect(top(moneyAdmin, design, "invoces")?.label).toBe("Billing and invoices");
        expect(top(personas.superAdmin, company, "sallaries")?.label).toBe("Open salaries");
        expect(top(personas.superAdmin, company, "payr")?.label).toBe("Open salaries");
        expect(top(personas.designAdmin, design, "cust")?.label).toBe("Open clients");
    });

    it("runs actions: the theme, signing out, logging work", () => {
        expect(top(personas.designAdmin, design, "dark mode")).toEqual({ label: "Switch to dark mode", path: "(action)", strong: true });
        expect(top(personas.designAdmin, design, "log out")?.label).toBe("Sign out");
        expect(labels(personas.executionEmployee, execution, "log work")).not.toContain("Log work");
    });

    it("offers each area's starters before anything is typed", () => {
        expect(labels(personas.designEmployee, design, "")).toEqual(["My work", "Log work", "My profile"]);
        expect(labels(personas.superAdmin, company, "")).toEqual([
            "Open company overview", "Open company expenses", "Open salaries", "Open project pay", "Open schedules",
        ]);
    });

    it("reads plurals as their singular and punctuation as spaces", () => {
        expect(words("Salaries & wages")).toEqual(["salary", "and", "wage"]);
        expect(words("Who's online?")).toEqual(["who", "online"]);
    });
});
