import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { describe as words, type Reader } from "@/domains/shared/notifications/notificationWords";
import { money } from "@/shared/format/money";
import { note } from "@/test/fixtures/notifications";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { work } from "@/test/fixtures/work";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const project = projectWork.project;
const path = `/design/projects/${project.id}`;
const rana = personas.superAdmin;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const panel = async () => screen.findByRole("region", { name: "Departments" });

describe("a Design project's departments", () => {
    it("show a row each with its budget, what its hours cost and what's left, the cost in red when it's over", async () => {
        renderApp(path, rana, ...projectWorkHandlers);
        const departments = await panel();
        const architecture = await within(departments).findByRole("row", { name: "Architecture" });
        expect(within(architecture).getByText("60%")).toBeInTheDocument();
        expect(within(architecture).getByText(money.fmt(6000))).toBeInTheDocument();
        expect(within(architecture).getByText("108%")).toBeInTheDocument();
        expect(within(architecture).getByText(money.fmt(6500))).toHaveClass("down");
        expect(within(architecture).getByText(money.fmt(-500))).toHaveClass("down");

        const interiors = within(departments).getByRole("row", { name: "Interiors" });
        expect(within(interiors).getByText(money.fmt(1000))).not.toHaveClass("down");
        expect(within(interiors).getByText(money.fmt(3000))).not.toHaveClass("down");
    });

    it("open one for who logged its hours, at what rate, and their share of its cost", async () => {
        renderApp(path, rana, ...projectWorkHandlers);
        await userEvent.click(await within(await panel()).findByRole("row", { name: "Architecture" }));
        const dialog = await screen.findByRole("dialog", { name: "Architecture" });
        expect(within(dialog).getByText("Over budget")).toBeInTheDocument();
        expect(within(dialog).getAllByText(money.fmt(6500)).every((n) => n.classList.contains("down"))).toBe(true);

        // most cost first; a rate that changed shows its range
        const people = within(dialog).getAllByRole("row").filter((r) => r.getAttribute("aria-label"));
        expect(people.map((r) => r.getAttribute("aria-label"))).toEqual(["Yara Mansour", "Karim Haddad"]);
        expect(within(people[0]).getByText("40h")).toBeInTheDocument();
        expect(within(people[0]).getByText(`${money.exact(12.5)}–${money.exact(13.25)}/h`)).toBeInTheDocument();
        expect(within(people[0]).getByText("80%")).toBeInTheDocument();
        expect(within(people[1]).getByText(`${money.exact(13)}/h`)).toBeInTheDocument();
        expect(within(people[1]).getByText(money.fmt(1300))).toBeInTheDocument();
    });

    it("show labour with no exchange rate on its day beside the cost, never in it, and nothing extra when there's none", async () => {
        const [architecture, interiors] = projectWork.departments.departments;
        const withPounds = {
            ...projectWork.departments,
            departments: [{ ...architecture, money: { ...architecture.money!, unconverted: [{ currency: "LBP", amount: 4500000 }] } }, interiors],
        };
        renderApp(path, rana, http.get("/api/projects/:id/departments", () => HttpResponse.json(withPounds)), ...projectWorkHandlers);
        const departments = await panel();
        const row = await within(departments).findByRole("row", { name: "Architecture" });
        expect(within(row).getByText(money.fmt(6500))).toBeInTheDocument();
        expect(within(row).getByText("+ 4.5M LBP")).toBeInTheDocument();
        expect(within(within(departments).getByRole("row", { name: "Interiors" })).queryByText(/LBP/)).not.toBeInTheDocument();

        // beside its cost and its total in the breakdown too
        await userEvent.click(row);
        const dialog = await screen.findByRole("dialog", { name: "Architecture" });
        expect(within(dialog).getAllByText("+ 4.5M LBP")).toHaveLength(2);
    });

    it("take new shares adding up to 100%, with why if you like, from whoever writes the money", async () => {
        const sent: unknown[] = [];
        renderApp(path, rana,
            http.put("/api/projects/:id/departments/shares", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json(projectWork.departments);
            }),
            ...projectWorkHandlers);
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Edit shares" }));
        const dialog = await screen.findByRole("dialog", { name: "Department shares" });
        const architecture = within(dialog).getByLabelText("Architecture");
        await userEvent.clear(architecture);
        await userEvent.type(architecture, "70");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(within(dialog).getByText("The shares add up to 110%: they must make 100%.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        // no reason needed: one given is kept in the history
        const interiors = within(dialog).getByLabelText("Interiors");
        await userEvent.clear(interiors);
        await userEvent.type(interiors, "30");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{
            shares: [{ departmentId: 12, share: 0.7 }, { departmentId: 13, share: 0.3 }],
            reason: null,
        }]));
    });

    it("are changed from the alert of hours waiting, saying why a department stays", async () => {
        const sent: unknown[] = [];
        const withDepartments = { ...project, departments: [{ id: 12, name: "Architecture" }], departmentsName: null };
        renderApp(`${path}?departments=edit`, rana,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json(withDepartments)),
            http.put("/api/projects/:id/departments", async ({ request }) => {
                sent.push(await request.json());
                return sent.length === 1
                    ? HttpResponse.json({ type: "business_rule", code: "department_has_hours", message: "Architecture has hours logged on this project, so it can't be taken off it." }, { status: 422 })
                    : HttpResponse.json(projectWork.departments);
            }),
            ...projectWorkHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Departments" });
        expect(await within(dialog).findByRole("button", { name: "Architecture" })).toHaveAttribute("aria-pressed", "true");
        await userEvent.click(within(dialog).getByRole("button", { name: "Interiors" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Architecture" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("Architecture has hours logged on this project, so it can't be taken off it.")).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("button", { name: "Architecture" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Departments" })).toBeNull());
        expect(sent).toEqual([{ departmentIds: [13] }, { departmentIds: [13, 12] }]);
    });
});

describe("a Design project's planned hours", () => {
    /** The bar beside a progress figure: amber once more is logged than planned. */
    const barOf = (figure: HTMLElement) => figure.previousElementSibling as HTMLElement;

    it("show each department's hours against those planned, with the API's progress, amber once past the plan", async () => {
        renderApp(path, rana, ...projectWorkHandlers);
        const departments = await panel();
        const architecture = await within(departments).findByRole("row", { name: "Architecture" });
        expect(within(architecture).getByText("50h of 40h")).toBeInTheDocument();
        expect(barOf(within(architecture).getByText("125%"))).toHaveClass("warn");

        const interiors = within(departments).getByRole("row", { name: "Interiors" });
        expect(within(interiors).getByText("8h of 16h")).toBeInTheDocument();
        expect(barOf(within(interiors).getByText("50%"))).not.toHaveClass("warn");
    });

    it("show an employee each department's planned hours on the Overview, but not how far along they are", async () => {
        const sarah = personas.designEmployee;
        const withDepartments = { ...project, departments: [{ id: 12, name: "Architecture" }, { id: 13, name: "Interiors" }], departmentsName: null };
        // as the API shows them to someone who sees neither the money nor everyone's hours
        const asSarahSees = {
            name: null,
            departments: projectWork.departments.departments.map((d) => ({ ...d, share: null, money: null, loggedMinutes: null, progress: null })),
            other: null,
        };
        renderApp(path, sarah,
            http.get(`/api/projects/${project.id}`, () => HttpResponse.json(withDepartments)),
            http.get("/api/projects/:id/departments", () => HttpResponse.json(asSarahSees)),
            http.get("/api/me/projects/:id/work", () => HttpResponse.json({ ...work.projectWork, projectId: project.id })),
            http.get("/api/me/projects", () => HttpResponse.json([{ ...work.myProjects[0], id: project.id }])),
            ...projectWorkHandlers);
        const planned = await screen.findByRole("region", { name: "Planned hours" });
        expect(within(await within(planned).findByRole("row", { name: "Architecture" })).getByText("40h")).toBeInTheDocument();
        expect(within(within(planned).getByRole("row", { name: "Interiors" })).getByText("16h")).toBeInTheDocument();
        expect(within(planned).queryByText(/%/)).toBeNull();
        expect(within(planned).queryByText(/ of /)).toBeNull();
        expect(within(planned).queryByRole("button", { name: "Plan hours" })).toBeNull();
    });

    it("are planned per department, sending only the ones changed, an emptied one cleared, and say what the API refuses beside its field", async () => {
        const sent: unknown[] = [];
        renderApp(path, rana,
            http.put("/api/projects/:id/departments/plan", async ({ request }) => {
                sent.push(await request.json());
                return sent.length === 1
                    ? HttpResponse.json({
                        type: "validation_failed", code: "validation_failed", message: "Some fields need attention.",
                        errors: { "departments[0].plannedHours": ["Planned hours are at most two decimal places."] },
                    }, { status: 400 })
                    : HttpResponse.json(projectWork.departments);
            }),
            ...projectWorkHandlers);
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Plan hours" }));
        const dialog = await screen.findByRole("dialog", { name: "Planned hours" });
        const architecture = within(dialog).getByLabelText("Architecture");
        const interiors = within(dialog).getByLabelText("Interiors");
        expect(architecture).toHaveValue("40");
        expect(interiors).toHaveValue("16");

        // nothing changed yet
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(within(dialog).getByText("The planned hours are already these: change one of them.")).toBeInTheDocument();

        // checked as it's typed
        await userEvent.clear(architecture);
        await userEvent.type(architecture, "abc");
        expect(within(dialog).getByText("Enter hours above 0, or leave it empty for no plan.")).toBeInTheDocument();
        await userEvent.clear(architecture);
        await userEvent.type(architecture, "45.5");
        expect(within(dialog).queryByText("Enter hours above 0, or leave it empty for no plan.")).toBeNull();
        await userEvent.clear(interiors);
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("Planned hours are at most two decimal places.")).toBeInTheDocument();
        expect(sent).toEqual([{ departments: [{ teamId: 12, plannedHours: 45.5 }, { teamId: 13, plannedHours: null }] }]);

        // a change clears the refusal; Interiors stays left as it is now
        await userEvent.clear(architecture);
        await userEvent.type(architecture, "45");
        expect(within(dialog).queryByText("Planned hours are at most two decimal places.")).toBeNull();
        await userEvent.type(interiors, "16");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Planned hours" })).toBeNull());
        expect(sent[1]).toEqual({ departments: [{ teamId: 12, plannedHours: 45 }] });
        expect(await screen.findByText("Planned hours saved")).toBeInTheDocument();
    });

    it("can't be planned without project:edit", async () => {
        renderApp(path, withPermissions(rana, { revoke: [P.PROJECT_EDIT] }), ...projectWorkHandlers);
        const departments = await panel();
        await within(departments).findByRole("row", { name: "Architecture" });
        expect(within(departments).queryByRole("button", { name: "Plan hours" })).toBeNull();
    });
});

describe("hours waiting for a department", () => {
    const owner: Reader = { userId: 2, isAdmin: true, logsWork: false, domain: "design" };
    const designer: Reader = { userId: 4, isAdmin: false, logsWork: true, domain: "design" };
    const studio = { id: 5, title: "Studio Nour brand space", domain: "design", icon: null, tint: null };

    it("ask the owner to add it, and tell the logger when they went through or why not", () => {
        const waiting = note("log_department_blocked", { projectTitle: studio.title, personName: "Sarah Haddad", departmentName: "Structure" }, { project: studio });
        expect(words(waiting, owner)).toMatchObject({
            text: "Sarah Haddad's hours on Studio Nour brand space wait for Structure",
            sub: "Add Structure to the project to let them through",
            route: "/design/projects/5?departments=edit",
        });
        expect(words({ ...waiting, count: 3 }, owner).text).toBe("3 logs on Studio Nour brand space wait for Structure");

        expect(words(note("work_entry_released", { projectTitle: studio.title, released: true }, { project: studio }), designer))
            .toMatchObject({ text: "Your hours waiting on Studio Nour brand space went through", route: "/design/my-work" });
        expect(words(note("work_entry_released", { projectTitle: studio.title, released: false, reason: "That month is closed." }, { project: studio }), designer))
            .toMatchObject({ text: "Your hours waiting on Studio Nour brand space couldn't be added", sub: "That month is closed. Log them again." });
    });
});
