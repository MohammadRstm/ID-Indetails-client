import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { overview } from "@/test/fixtures/overview";
import { siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
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

    it("shows a plain Design admin no money, and never asks for it", async () => {
        let askedForTotals = false;
        renderApp("/design/projects", personas.designAdmin,
            http.get("/api/projects/totals", () => { askedForTotals = true; return HttpResponse.json(fixtures.projectTotals); }),
            ...projectHandlers);
        await firstRow();
        expect(screen.queryByRole("columnheader", { name: "Revenue" })).toBeNull();
        expect(screen.queryByRole("columnheader", { name: "Margin" })).toBeNull();
        expect(screen.queryByRole("columnheader", { name: "Profit" })).toBeNull();
        expect(within(screen.getByRole("navigation")).queryByText("Financials")).toBeNull();
        expect(askedForTotals).toBe(false);
    });

    it("shows hours and activity only to people who see everyone's work", async () => {
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...projectHandlers);
        await firstRow();
        expect(screen.queryByRole("columnheader", { name: "Hours" })).toBeNull();
        expect(screen.queryByRole("columnheader", { name: "Activity" })).toBeNull();
    });

    it("says how many hours were logged this quarter to people with report:view", async () => {
        renderApp("/design/projects", admin, ...projectHandlers);
        const hours = Math.round(overview.overview.minutes / 60).toLocaleString("en-US");
        expect(await screen.findByText(new RegExp(`· ${hours}h logged this quarter$`))).toBeInTheDocument();
    });

    it("leaves the hours out without report:view, and never asks for them", async () => {
        let asked = false;
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.REPORT_VIEW] }),
            http.get("/api/reports/overview", () => { asked = true; return HttpResponse.json(overview.overview); }),
            ...projectHandlers);
        expect(await screen.findByText(/^\d+ projects · \d+ active$/)).toBeInTheDocument();
        expect(asked).toBe(false);
    });

    it("offers New project only with project:create", async () => {
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.PROJECT_CREATE] }), ...projectHandlers);
        await firstRow();
        expect(screen.queryByRole("button", { name: /new project/i })).toBeNull();
    });

    it("makes a new project internal for someone who can't see the clients, and says why", async () => {
        renderApp("/design/projects", withPermissions(admin, { revoke: [P.CLIENT_VIEW] }), ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /new project/i }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("button", { name: "Client project" })).toBeDisabled();
        expect(within(dialog).getByRole("button", { name: "Internal" })).toHaveClass("on");
        expect(within(dialog).queryByRole("button", { name: /search clients/i })).toBeNull();
    });

    it("opens the client list of New project over the page, not inside the window", async () => {
        renderApp("/design/projects", admin, ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /new project/i }));
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: /search clients/i }));
        const find = await screen.findByLabelText("Find a client");
        expect(dialog.contains(find)).toBe(false);
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

    it("shows a plain Design admin neither the payment nor the money actions", async () => {
        renderApp("/design/projects/1", personas.designAdmin, ...projectHandlers);
        await screen.findByRole("heading", { name: "Haddad Holdings HQ fit-out" });
        expect(within(document.querySelector(".page-head") as HTMLElement).queryByText(/^Payment/)).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.getByRole("button", { name: "Put on hold" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /customer payment/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Add project expense" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Record a client payment" })).toBeNull();
        expect(within(screen.getByRole("navigation")).queryByText("Financials")).toBeNull();
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

describe("a new project and its details", () => {
    it("says what is missing instead of doing nothing, and sends where the work is", async () => {
        const bodies: Record<string, unknown>[] = [];
        renderApp("/design/projects?new=1", admin,
            http.post("/api/projects", async ({ request }) => {
                bodies.push((await request.json()) as Record<string, unknown>);
                return HttpResponse.json({ ...fixtures.project, id: 77, title: "Villa interiors" }, { status: 201 });
            }),
            ...projectHandlers);
        const dialog = await screen.findByRole("dialog", { name: "New project" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
        expect(within(dialog).getByText("Give the project a name.")).toBeInTheDocument();
        expect(within(dialog).getByText("Choose who the project is for, or make it internal.")).toBeInTheDocument();
        expect(bodies).toEqual([]);

        await userEvent.type(within(dialog).getByLabelText("Project name"), "Villa interiors");
        expect(within(dialog).queryByText("Give the project a name.")).toBeNull();
        await userEvent.click(within(dialog).getByRole("button", { name: "Internal" }));
        await userEvent.type(within(dialog).getByLabelText(/Location/), "Broummana");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
        await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ title: "Villa interiors", billingType: "internal", location: "Broummana" })]));
    });

    it("shows where a project is, and edits it with the rest of its details", async () => {
        const bodies: Record<string, unknown>[] = [];
        const located = { ...fixtures.project, location: "Achrafieh, Beirut" };
        renderApp("/design/projects/1", admin,
            http.get("/api/projects/1", () => HttpResponse.json(located)),
            http.put("/api/projects/1", async ({ request }) => {
                bodies.push((await request.json()) as Record<string, unknown>);
                return HttpResponse.json({ ...located, location: "Jounieh" });
            }),
            ...projectHandlers);
        expect(await screen.findByText("Achrafieh, Beirut")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit project details" });
        const where = within(dialog).getByLabelText(/Location/);
        await userEvent.clear(where);
        await userEvent.type(where, "Jounieh");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        // the rest goes back as it was, the owner included
        await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ title: fixtures.project.title, location: "Jounieh", ownerId: fixtures.project.owner.id })]));
    });

    it("leaves the customer payment to whoever may see the money", async () => {
        const bodies: Record<string, unknown>[] = [];
        renderApp(`/design/projects?new=1&client=${fixtures.client.id}`, personas.designAdmin,
            http.post("/api/projects", async ({ request }) => {
                bodies.push((await request.json()) as Record<string, unknown>);
                return HttpResponse.json({ ...fixtures.project, id: 77, title: "Villa interiors" }, { status: 201 });
            }),
            ...projectHandlers);
        const dialog = await screen.findByRole("dialog", { name: "New project" });
        expect(within(dialog).queryByLabelText("Customer payment")).toBeNull();
        expect(within(dialog).queryByText("Customer payment")).toBeNull();
        await userEvent.type(within(dialog).getByLabelText("Project name"), "Villa interiors");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
        await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ billingType: "client", clientId: fixtures.client.id, revenue: null })]));
    });

    it("asks the customer payment of a super admin", async () => {
        renderApp(`/design/projects?new=1&client=${fixtures.client.id}`, personas.superAdmin, ...projectHandlers);
        const dialog = await screen.findByRole("dialog", { name: "New project" });
        expect(within(dialog).getByLabelText("Customer payment")).toBeInTheDocument();
    });

    it("keeps editing to people with project:edit", async () => {
        renderApp("/design/projects/1", withPermissions(admin, { revoke: [P.PROJECT_EDIT] }), ...projectHandlers);
        await screen.findByRole("heading", { name: fixtures.project.title });
        const menu = screen.queryByRole("button", { name: "More actions" });
        if (menu) await userEvent.click(menu);
        expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
    });
});

describe("a new Execution project", () => {
    // an Execution admin a super admin has handed the money to
    const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
    const newProject = () => screen.findByRole("dialog", { name: "New project" });

    it("takes the first payment from people who record payments", async () => {
        renderApp("/execution/projects?new=1", karim, ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        expect(within(dialog).getByLabelText("Initial payment received")).toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Project fee/)).toBeInTheDocument();
    });

    it("stars what is required and says what is optional", async () => {
        renderApp("/execution/projects?new=1", karim, ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        const label = (name: string) => within(dialog).getByText(name, { selector: "label" });
        expect(label("Project name")).toHaveClass("required");
        expect(label("Initial payment received")).toHaveClass("optional");
        expect(label("Project fee")).toHaveClass("optional");
        expect(within(dialog).getByLabelText("Location")).toHaveAttribute("placeholder", expect.stringMatching(/^Optional/));
    });

    it("leaves the payment out without payment:record, as the API would refuse the project", async () => {
        renderApp("/execution/projects?new=1", withPermissions(karim, { revoke: [P.PAYMENT_RECORD] }), ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        expect(within(dialog).queryByLabelText("Initial payment received")).not.toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Project fee/)).toBeInTheDocument();
    });

    it("leaves the fee, the material profit and the payment to a super admin for a plain Execution admin", async () => {
        const bodies: Record<string, unknown>[] = [];
        renderApp(`/execution/projects?new=1&client=${fixtures.client.id}`, personas.executionAdmin,
            http.post("/api/projects", async ({ request }) => {
                bodies.push((await request.json()) as Record<string, unknown>);
                return HttpResponse.json({ ...fixtures.project, id: 77, title: "Lobby works" }, { status: 201 });
            }),
            ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        expect(within(dialog).queryByLabelText("Initial payment received")).toBeNull();
        expect(within(dialog).queryByLabelText(/Project fee/)).toBeNull();
        expect(within(dialog).queryByLabelText(/Material profit/i)).toBeNull();
        expect(within(dialog).queryByText("Money")).toBeNull();
        await userEvent.type(within(dialog).getByLabelText("Project name"), "Lobby works");
        // a site needs the staff who oversee it
        await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
        expect(within(dialog).getByText("Choose at least one staff member to oversee the site.")).toBeInTheDocument();
        expect(bodies).toEqual([]);
        await userEvent.click(await within(dialog).findByRole("button", { name: /Tarek Nasser/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
        await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ projectFee: null, materialMarkup: null, initialPayment: null, staffIds: [5] })]));
    });

    it("asks a super admin for the fee, the material profit and the payment", async () => {
        renderApp("/execution/projects?new=1", personas.superAdmin, ...siteHandlers, ...projectHandlers);
        const dialog = await newProject();
        expect(within(dialog).getByLabelText("Initial payment received")).toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Project fee/)).toBeInTheDocument();
        expect(within(dialog).getByLabelText(/Material profit/i)).toBeInTheDocument();
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

    it("keep the New meeting window its size while the end time's list is open", async () => {
        renderApp("/design/meetings", personas.designEmployee, ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /new meeting/i }));
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByLabelText("End"));
        const list = document.querySelector(".pop.floating");
        expect(list).not.toBeNull();
        expect(dialog.contains(list)).toBe(false);
    });

    it("are read-only without meeting:create", async () => {
        renderApp("/design/meetings", withPermissions(personas.designEmployee, { revoke: [P.MEETING_CREATE] }), ...projectHandlers);
        await screen.findByText(/that already happened/);
        expect(screen.queryByRole("button", { name: /new meeting/i })).toBeNull();
    });
});
