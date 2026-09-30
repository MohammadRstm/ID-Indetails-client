import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { siteHandlers } from "@/test/fixtures/site";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = personas.designAdmin;
const firstRow = async () => (await screen.findByText("Haddad Holdings HQ fit-out")).closest("tr")!;

describe("the projects list", () => {
    it("shows the money to people with financial:view", async () => {
        renderApp("/design/projects", admin, ...projectHandlers);
        expect(await screen.findByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Margin" })).toBeInTheDocument();
        // The totals' own line, once they have loaded.
        expect(await screen.findByText(`${fixtures.projectTotals.internalProjects} internal projects`)).toBeInTheDocument();
    });

    it("hides the money without financial:view, and never asks for it", async () => {
        let askedForTotals = false;
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/projects/totals", () => { askedForTotals = true; return HttpResponse.json(fixtures.projectTotals); }),
            ...projectHandlers);
        await firstRow();
        expect(screen.queryByRole("columnheader", { name: "Revenue" })).toBeNull();
        expect(screen.queryByRole("columnheader", { name: "Profit" })).toBeNull();
        expect(screen.queryByText("Internal cost")).toBeNull();
        expect(askedForTotals).toBe(false);
    });

    it("shows hours and activity only to people who see everyone's work", async () => {
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...projectHandlers);
        await firstRow();
        expect(screen.queryByRole("columnheader", { name: "Hours" })).toBeNull();
        expect(screen.queryByRole("columnheader", { name: "Activity" })).toBeNull();
    });

    it("offers New project only with project:create", async () => {
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.PROJECT_CREATE] }), ...projectHandlers);
        await firstRow();
        expect(screen.queryByRole("button", { name: /new project/i })).toBeNull();
    });

    it("keeps the row menu to what the person may do", async () => {
        renderApp("/design/projects", admin, ...projectHandlers);
        await userEvent.click(within(await firstRow()).getByRole("button", { name: "Project actions" }));
        expect(screen.getByRole("button", { name: "Export report" })).toBeInTheDocument();
        expect(screen.getByText("Set status")).toBeInTheDocument();
    });

    it("drops the report and status items without their permissions", async () => {
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL, P.PROJECT_CHANGE_STATUS] }), ...projectHandlers);
        await userEvent.click(within(await firstRow()).getByRole("button", { name: "Project actions" }));
        expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Export report" })).toBeNull();
        expect(screen.queryByText("Set status")).toBeNull();
    });
});

describe("a project", () => {
    it("lets people with project:change_status close it or put it on hold", async () => {
        renderApp("/design/projects/1", admin, ...projectHandlers);
        expect(await screen.findByRole("button", { name: /mark as done/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Project status" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
        expect(within(document.querySelector(".page-head") as HTMLElement).getByText(/^Payment/)).toBeInTheDocument();
    });

    it("only shows the status to everyone else", async () => {
        renderApp("/design/projects/1", withPermissions(admin, { revoke: [P.PROJECT_CHANGE_STATUS] }), ...projectHandlers);
        await screen.findByRole("heading", { name: "Haddad Holdings HQ fit-out" });
        expect(screen.queryByRole("button", { name: /mark as done/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Project status" })).toBeNull();
        // the menu keeps the money actions they may still take, without the status ones
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.queryByRole("button", { name: "Put on hold" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Archive project" })).toBeNull();
        expect(screen.getByRole("button", { name: "Add project expense" })).toBeInTheDocument();
    });

    it("has no menu at all for someone who can change neither the status nor the money", async () => {
        renderApp("/design/projects/1", withPermissions(admin, { revoke: [P.PROJECT_CHANGE_STATUS, P.PROJECT_EDIT, P.EXPENSE_MANAGE, P.INVOICE_CREATE, P.PAYMENT_RECORD] }), ...projectHandlers);
        await screen.findByRole("heading", { name: "Haddad Holdings HQ fit-out" });
        expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    });

    it("puts it on hold through the API", async () => {
        let held = false;
        renderApp("/design/projects/1", admin,
            http.post("/api/projects/1/hold", () => { held = true; return HttpResponse.json({ ...fixtures.project, status: "hold" }); }),
            ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Put on hold" }));
        await waitFor(() => expect(held).toBe(true));
        // the menu has closed by now; the toast still comes
        expect(await screen.findByText("Haddad Holdings HQ fit-out is now on hold")).toBeInTheDocument();
    });

    it("hides the payment without financial:view", async () => {
        renderApp("/design/projects/1", withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] }), ...projectHandlers);
        await screen.findByRole("heading", { name: "Haddad Holdings HQ fit-out" });
        expect(within(document.querySelector(".page-head") as HTMLElement).queryByText(/^Payment/)).toBeNull();
    });

    it("says so when the project isn't there", async () => {
        renderApp("/design/projects/99", admin,
            http.get("/api/projects/99", () => HttpResponse.json({ type: "not_found", code: "project_not_found", message: "Not found." }, { status: 404 })),
            ...projectHandlers);
        expect(await screen.findByText("Project not found")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute("href", "/design/projects");
    });

    it("won't open the requirements tab from a link without requirement:view", async () => {
        renderApp("/design/projects/1?tab=requirements", withPermissions(admin, { revoke: [P.REQUIREMENT_VIEW] }), ...projectHandlers);
        await screen.findByRole("heading", { name: "Haddad Holdings HQ fit-out" });
        expect(screen.queryByRole("tab", { name: /requirements/i })).toBeNull();
        expect(screen.queryByText("Add a requirement")).toBeNull();
    });
});

describe("a new Execution project", () => {
    const karim = personas.executionAdmin;
    const newProject = () => screen.findByRole("dialog", { name: "New project" });

    it("takes the first payment from people who record payments", async () => {
        renderApp("/execution/projects?new=1", karim, ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        expect(within(dialog).getByLabelText("Initial payment received")).toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Project fee/)).toBeInTheDocument();
    });

    it("leaves the payment out without payment:record, as the API would refuse the project", async () => {
        renderApp("/execution/projects?new=1", withPermissions(karim, { revoke: [P.PAYMENT_RECORD] }), ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        expect(within(dialog).queryByLabelText("Initial payment received")).not.toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Project fee/)).toBeInTheDocument();
    });
});

describe("requirements", () => {
    it("can be added and ticked by people with requirement:manage", async () => {
        renderApp("/design/projects/1?tab=requirements", admin, ...projectHandlers);
        expect(await screen.findByText("Add a requirement")).toBeInTheDocument();
        expect(await screen.findAllByRole("checkbox", { name: "Done" })).toHaveLength(fixtures.requirements.items.length);
    });

    it("can only be ticked by their assignee with requirement:complete_own", async () => {
        const mine = fixtures.requirements.items.find((r) => !r.isDone)!;
        const list = {
            ...fixtures.requirements,
            items: fixtures.requirements.items.map((r) => ({ ...r, assignees: r.id === mine.id ? [{ id: admin.id, name: "Nadia Test" }] : [] })),
        };
        let ticked = false;
        renderApp("/design/projects/1?tab=requirements", withPermissions(admin, { revoke: [P.REQUIREMENT_MANAGE] }),
            http.get("/api/projects/1/requirements", () => HttpResponse.json(list)),
            http.post(`/api/projects/1/requirements/${mine.id}/done`, () => { ticked = true; return HttpResponse.json({ ...mine, isDone: true }); }),
            ...projectHandlers);

        await screen.findByText(mine.text);
        expect(screen.queryByText("Add a requirement")).toBeNull();
        const boxes = screen.getAllByRole("checkbox", { name: "Done" });
        expect(boxes).toHaveLength(1);
        await userEvent.click(boxes[0]);
        await waitFor(() => expect(ticked).toBe(true));
    });
});

describe("meetings", () => {
    it("can be set by employees with meeting:create", async () => {
        renderApp("/design/meetings", personas.designEmployee, ...projectHandlers);
        expect(await screen.findByRole("button", { name: /new meeting/i })).toBeInTheDocument();
    });

    it("are asked for by the page's own domain", async () => {
        const asked: (string | null)[] = [];
        renderApp("/design/meetings", personas.superAdmin,
            http.get("/api/meetings", ({ request }) => { asked.push(new URL(request.url).searchParams.get("domain")); return HttpResponse.json(fixtures.meetings); }),
            ...projectHandlers);
        await screen.findByRole("button", { name: /new meeting/i });
        await waitFor(() => expect(asked.length).toBeGreaterThan(0));
        expect(new Set(asked)).toEqual(new Set(["design"]));
    });

    it("are read-only without meeting:create", async () => {
        renderApp("/design/meetings", withPermissions(personas.designEmployee, { revoke: [P.MEETING_CREATE] }), ...projectHandlers);
        await screen.findByText(/that already happened/);
        expect(screen.queryByRole("button", { name: /new meeting/i })).toBeNull();
    });
});
