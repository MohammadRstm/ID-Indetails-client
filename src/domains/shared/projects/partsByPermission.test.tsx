import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { site, siteHandlers } from "@/test/fixtures/site";
import { work } from "@/test/fixtures/work";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

/*
 * One projects list and one project page for everyone: each permission adds its parts, and someone who holds
 * them all sees what a super admin sees.
 */

const sarah = personas.designEmployee;
const nadia = personas.designAdmin;
const tarek = personas.executionEmployee;
const page = `/design/projects/${projectWork.project.id}`;
// Sarah's own work on the project, and the project among hers
const mine = { ...work.projectWork, projectId: projectWork.project.id };
const ownWork = [
    http.get("/api/me/projects/:id/work", () => HttpResponse.json(mine)),
    http.get("/api/me/projects", () => HttpResponse.json([{ ...work.myProjects[0], id: projectWork.project.id }])),
];
// the page's own tabs, without their counts
const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
const logWork = () => within(document.querySelector(".page-actions") as HTMLElement).findByRole("button", { name: "Log work" });
const sidebar = () => document.querySelector("aside.side") as HTMLElement;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
});

describe("the projects list, by permission", () => {
    it("greets someone who logs work, and shows the business's projects once they oversee them", async () => {
        renderApp("/design/projects", withPermissions(sarah, { grant: [P.FINANCIAL_VIEW] }), ...ownWork, ...projectHandlers);
        expect(await screen.findByRole("heading", { name: "Good afternoon, Sarah" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "All projects" })).toBeInTheDocument();
        expect(await screen.findByText("Haddad Holdings HQ fit-out")).toBeInTheDocument();
    });

    it("gives an admin, who logs no hours, the table on its own", async () => {
        renderApp("/design/projects", nadia, ...projectHandlers);
        expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
        expect(await screen.findByText("Haddad Holdings HQ fit-out")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /^Good / })).toBeNull();
    });

    it("gives someone who logs no work the table on its own", async () => {
        renderApp("/design/projects", withPermissions(nadia, { revoke: [P.WORK_ENTRY_VIEW_OWN] }), ...projectHandlers);
        expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
        expect(await screen.findByText("Haddad Holdings HQ fit-out")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /^Good / })).toBeNull();
    });
});

describe("a Design project, by permission", () => {
    it("shows an employee their own work, the requirements and the meetings, and nothing they can't use", async () => {
        const asked: string[] = [];
        renderApp(page, sarah,
            http.get("/api/projects/:id/work", () => { asked.push("everyone's work"); return HttpResponse.json({}, { status: 403 }); }),
            ...ownWork, ...projectWorkHandlers);
        expect(await screen.findByText(`${mine.myEntries} entries`)).toBeInTheDocument();
        expect(screen.getByText("Project progress")).toBeInTheDocument();
        expect(screen.getByText("Team activity")).toBeInTheDocument();
        expect(tabs()).toEqual(["Overview", "Requirements", "Meetings"]);
        expect(await logWork()).toHaveClass("btn-primary");
        // the client is named, but its page isn't theirs to open
        expect(screen.getByText(projectWork.project.client!.displayName)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: new RegExp(projectWork.project.client!.displayName) })).toBeNull();
        for (const name of ["Mark as done", "More actions", "Export report", "Project status"]) expect(screen.queryByRole("button", { name })).toBeNull();
        expect(screen.queryByText("Contributors")).toBeNull();
        expect(asked).toEqual([]);
    });

    it("adds who put the hours in and the timeline for an employee given work_entry:view_all", async () => {
        renderApp(page, withPermissions(sarah, { grant: [P.WORK_ENTRY_VIEW_ALL] }), ...ownWork, ...projectWorkHandlers);
        // their own hours stay on the Overview; everyone's work is on Analytics
        expect(await screen.findByText("Your hours here")).toBeInTheDocument();
        expect(tabs()).toEqual(["Overview", "Analytics", "Contributors", "Requirements", "Timeline", "Meetings"]);
        await userEvent.click(screen.getByRole("tab", { name: "Contributors" }));
        expect(await screen.findByText("Who put the hours in. Click a person to see their entries on this project.")).toBeInTheDocument();
    });

    it("lets an employee given project:change_status mark it done, and Log work steps aside", async () => {
        renderApp(page, withPermissions(sarah, { grant: [P.PROJECT_CHANGE_STATUS] }), ...ownWork, ...projectWorkHandlers);
        expect(await screen.findByRole("button", { name: "Mark as done" })).toHaveClass("btn-primary");
        expect(await logWork()).not.toHaveClass("btn-primary");
    });

    it("never shows an admin hours of their own: admins log none", async () => {
        renderApp(page, nadia, ...ownWork, ...projectWorkHandlers);
        expect(await screen.findByText("Total hours")).toBeInTheDocument();
        expect(screen.queryByText("Your hours here")).toBeNull();
        expect(tabs()).toEqual(["Analytics", "Contributors", "Requirements", "Timeline", "Meetings"]);
    });

    it("shows an admin who never logged work here only the project's", async () => {
        renderApp(page, nadia, ...projectWorkHandlers);
        expect(await screen.findByText("Total hours")).toBeInTheDocument();
        expect(screen.queryByText("Your hours here")).toBeNull();
        expect(screen.queryByText("Your recent work")).toBeNull();
    });

    it("has no Requirements tab without requirement:view, even by link", async () => {
        renderApp(`${page}?tab=requirements`, withPermissions(sarah, { revoke: [P.REQUIREMENT_VIEW] }), ...ownWork, ...projectWorkHandlers);
        expect(await screen.findByText("Your recent work")).toBeInTheDocument();
        expect(tabs()).toEqual(["Overview", "Meetings"]);
    });

    it("lets an employee tick their own requirements on the tab, and no one else's", async () => {
        const base = fixtures.requirements.items[0];
        const list = {
            items: [
                { ...base, id: 1, text: "Mood board", isOverdue: false, assignees: [{ id: sarah.id, name: "Sarah Haddad" }] },
                { ...base, id: 2, text: "Lighting plan", isOverdue: false, assignees: [{ id: 99, name: "Omar Fares" }] },
            ],
            total: 2, done: 0, overdue: 0, progressPct: 0,
        };
        renderApp(`${page}?tab=requirements`, sarah, http.get("/api/projects/:id/requirements", () => HttpResponse.json(list)), ...ownWork, ...projectWorkHandlers);
        expect(await screen.findByText("Mood board")).toBeInTheDocument();
        expect(screen.getAllByRole("checkbox", { name: "Done" })).toHaveLength(1);
        expect(screen.getByText(/1 open assigned to you/)).toBeInTheDocument();
        expect(screen.queryByText("Add a requirement")).toBeNull();
    });
});

describe("an Execution site, by permission", () => {
    it("shows an employee what is recorded on it, its requirements, its meetings and its team", async () => {
        renderApp(`/execution/projects/${site.losingProject.id}`, tarek, ...siteHandlers);
        expect(await screen.findByText("Materials", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(tabs()).toEqual(["Overview", "Requirements", "Meetings"]);
        expect(document.querySelectorAll(".page-head .av-stack > *")).toHaveLength(site.losingProject.team!.count);
        for (const name of ["Mark as done", "More actions"]) expect(screen.queryByRole("button", { name })).toBeNull();
    });
});

describe("logging work, by permission", () => {
    it("gives an admin neither Log work nor the timer: only employees log hours", async () => {
        renderApp(page, nadia, ...projectWorkHandlers);
        await screen.findByText("Total hours");
        expect(within(sidebar()).queryByRole("button", { name: /log work/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Start timer" })).toBeNull();
    });

    it("gives neither, nor their own work, to someone without work_entry:view_own", async () => {
        renderApp(page, withPermissions(sarah, { revoke: [P.WORK_ENTRY_VIEW_OWN] }), ...ownWork, ...projectWorkHandlers);
        expect(await screen.findByText("Progress")).toBeInTheDocument();
        expect(within(sidebar()).queryByRole("button", { name: /log work/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Start timer" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Log work" })).toBeNull();
        expect(screen.queryByText("Your hours here")).toBeNull();
    });
});
