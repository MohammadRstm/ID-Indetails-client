import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { people, peopleHandlers } from "@/test/fixtures/people";
import { workHandlers } from "@/test/fixtures/work";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const nadia = personas.designAdmin;
const yara = people.employee;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const table = async () => (await screen.findByText("Yara Mansour", { selector: ".tbl *" })).closest("table") as HTMLTableElement;

describe("Employees", () => {
    it("lists everyone with their week, rate and labour cost", async () => {
        renderApp("/design/people", nadia, ...peopleHandlers);
        const t = await table();
        expect(within(t).getByText("Rate")).toBeInTheDocument();
        expect(within(t).getByText("Labour cost")).toBeInTheDocument();
        const row = within(t).getByText("Yara Mansour").closest("tr") as HTMLElement;
        expect(within(row).getByText("$9/h")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add employee" })).toBeInTheDocument();
    });

    it("keeps pay out of sight without financial:view", async () => {
        renderApp("/design/people", withPermissions(nadia, { revoke: [P.FINANCIAL_VIEW] }), ...peopleHandlers);
        const t = await table();
        expect(within(t).queryByText("Rate")).not.toBeInTheDocument();
        expect(within(t).queryByText("Labour cost")).not.toBeInTheDocument();
        expect(within(t).queryByText("$9/h")).not.toBeInTheDocument();
    });

    it("filters by team and presence", async () => {
        renderApp("/design/people", nadia, ...peopleHandlers);
        const t = await table();
        await userEvent.click(screen.getByRole("button", { name: "Team" }));
        await userEvent.click(screen.getByRole("option", { name: "Interiors" }));
        expect(within(t).queryByText("Yara Mansour")).not.toBeInTheDocument();
        expect(within(t).getByText("Sarah Haddad")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Online" }));
        expect(await screen.findByText("No employees match")).toBeInTheDocument();
    });

    it("offers Add employee only with employee:invite, even from the link", async () => {
        renderApp("/design/people?invite=1", withPermissions(nadia, { revoke: [P.EMPLOYEE_INVITE] }), ...peopleHandlers);
        await table();
        expect(screen.queryByRole("button", { name: "Add employee" })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Add employee" })).not.toBeInTheDocument();
    });

    it("is for admins who see everyone's work", async () => {
        renderApp("/design/people", withPermissions(nadia, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...peopleHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });

    it("keeps employees out", async () => {
        renderApp("/design/people", personas.designEmployee, ...workHandlers);
        await waitFor(() => expect(window.location.pathname).toBe("/design/projects"));
    });
});

describe("Add employee", () => {
    const invited = { id: 50, userId: 60, email: "amara@id-indetails.test", role: "employee", domain: "design", status: "pending", expiresAt: "2026-10-07T09:00:00Z", createdAt: "2026-09-30T09:00:00Z" };

    function sendsTo(bodies: unknown[]) {
        return http.post("/api/invitations", async ({ request }) => {
            bodies.push(await request.json());
            return HttpResponse.json(invited, { status: 201 });
        });
    }

    it("invites them with a team, position and pay", async () => {
        const bodies: unknown[] = [];
        renderApp("/design/people?invite=1", nadia, sendsTo(bodies), ...peopleHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Add employee" });
        const send = within(dialog).getByRole("button", { name: "Send invitation" });
        await userEvent.type(within(dialog).getByLabelText("Work email"), "amara@id-indetails.test");
        // pay is required for an employee when the admin sets pay
        expect(send).toBeDisabled();
        await userEvent.type(within(dialog).getByLabelText("Position"), "Junior designer");
        await userEvent.click(within(dialog).getByLabelText("Team"));
        await userEvent.click(screen.getByRole("option", { name: "Interiors" }));
        await userEvent.type(within(dialog).getByLabelText("Pay"), "12");
        await userEvent.click(send);

        expect(await screen.findByRole("dialog", { name: "Invitation sent" })).toBeInTheDocument();
        const interiors = people.teams.find((t) => t.name === "Interiors")!;
        expect(bodies).toEqual([{
            email: "amara@id-indetails.test", role: "employee", domainCode: "design", teamId: interiors.id,
            position: "Junior designer", pay: { basis: "hourly", amount: 12, currency: "USD" },
        }]);
    });

    it("leaves pay out without employee:pay_manage, and for admins", async () => {
        const bodies: unknown[] = [];
        renderApp("/design/people?invite=1", withPermissions(nadia, { revoke: [P.EMPLOYEE_PAY_MANAGE] }), sendsTo(bodies), ...peopleHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Add employee" });
        expect(within(dialog).queryByLabelText("Pay")).not.toBeInTheDocument();
        // only a super admin can invite a super admin
        expect(within(dialog).queryByRole("tab", { name: "Super admin" })).not.toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Work email"), "amara@id-indetails.test");
        await userEvent.click(within(dialog).getByRole("tab", { name: "Admin" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
        await screen.findByRole("dialog", { name: "Invitation sent" });
        expect(bodies).toEqual([expect.objectContaining({ role: "admin", domainCode: "design", pay: null })]);
    });

    it("says why the invitation failed, next to the button", async () => {
        renderApp("/design/people?invite=1", nadia,
            http.post("/api/invitations", () => HttpResponse.json({ type: "conflict", code: "email_taken", message: "Someone already uses that email." }, { status: 409 })),
            ...peopleHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Add employee" });
        await userEvent.type(within(dialog).getByLabelText("Work email"), "yara@id-indetails.test");
        await userEvent.click(within(dialog).getByRole("tab", { name: "Admin" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
        expect(await within(dialog).findByText("Someone already uses that email.")).toBeInTheDocument();
    });
});

describe("Someone's profile", () => {
    it("shows their work, overtime and cost to the company", async () => {
        renderApp("/design/people/9", nadia, ...peopleHandlers);
        expect(await screen.findByRole("heading", { name: "Yara Mansour" })).toBeInTheDocument();
        expect(screen.getByText(yara.phone!)).toBeInTheDocument();
        expect(await screen.findByText("Cost to the company")).toBeInTheDocument();
        expect(await screen.findByText("$9/h")).toBeInTheDocument();
        expect(screen.getByText("Overtime", { selector: ".panel-title" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit profile" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Export timesheet" })).toBeInTheDocument();
        // the hours balance is a company matter
        expect(screen.queryByText("Hours balance")).not.toBeInTheDocument();
    });

    it("asks for no money without financial:view", async () => {
        let askedForCost = false;
        renderApp("/design/people/9", withPermissions(nadia, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/employees/9/labour-cost", () => { askedForCost = true; return HttpResponse.json(people.labourCost); }),
            ...peopleHandlers);
        await screen.findByText("Hours per week");
        expect(screen.queryByText("Cost to the company")).not.toBeInTheDocument();
        expect(askedForCost).toBe(false);
    });

    it("shows the hours balance to a super admin", async () => {
        renderApp("/design/people/9", personas.superAdmin, ...peopleHandlers);
        expect(await screen.findByText("Hours balance")).toBeInTheDocument();
    });

    it("can't be edited without employee:manage or employee:pay_manage", async () => {
        renderApp("/design/people/9", withPermissions(nadia, { revoke: [P.EMPLOYEE_MANAGE, P.EMPLOYEE_PAY_MANAGE] }), ...peopleHandlers);
        await screen.findByRole("heading", { name: "Yara Mansour" });
        expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
    });

    it("says so when they don't exist", async () => {
        renderApp("/design/people/404", nadia,
            http.get("/api/employees/404", () => HttpResponse.json({ type: "not_found", code: "employee_not_found", message: "No such employee." }, { status: 404 })),
            ...peopleHandlers);
        expect(await screen.findByText("Employee not found")).toBeInTheDocument();
    });

    it("saves an admin's edit, and new pay from a date", async () => {
        const updates: unknown[] = [];
        const pays: unknown[] = [];
        renderApp("/design/people/9", nadia,
            http.put("/api/employees/9", async ({ request }) => { updates.push(await request.json()); return HttpResponse.json(yara); }),
            http.post("/api/employees/9/pay", async ({ request }) => { pays.push(await request.json()); return HttpResponse.json(people.payHistory[0]); }),
            ...peopleHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit Yara's profile" });
        const position = within(dialog).getByLabelText("Position");
        await userEvent.clear(position);
        await userEvent.type(position, "Senior visualiser");
        const pay = await within(dialog).findByLabelText("Pay");
        await userEvent.clear(pay);
        await userEvent.type(pay, "1800");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(updates).toEqual([{ firstName: "Yara", lastName: "Mansour", phone: yara.phone, position: "Senior visualiser", teamId: yara.team!.id }]);
        expect(pays).toEqual([{ basis: "monthly", amount: 1800, currency: "USD", effectiveFrom: "2026-09-30" }]);
    });

    it("lets pay be changed without the rest of the profile, which it doesn't send", async () => {
        let updated = false;
        const pays: unknown[] = [];
        renderApp("/design/people/9", withPermissions(nadia, { revoke: [P.EMPLOYEE_MANAGE] }),
            http.put("/api/employees/9", () => { updated = true; return HttpResponse.json(yara); }),
            http.post("/api/employees/9/pay", async ({ request }) => { pays.push(await request.json()); return HttpResponse.json(people.payHistory[0]); }),
            ...peopleHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit Yara's profile" });
        const pay = await within(dialog).findByLabelText("Pay");
        expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
        await userEvent.clear(pay);
        await userEvent.type(pay, "1800");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        await waitFor(() => expect(pays).toHaveLength(1));
        // the profile itself needs employee:manage
        expect(updated).toBe(false);
    });
});

describe("Your own profile", () => {
    const sarah = { ...personas.designEmployee, phone: "+961 70 123 456" };

    it("shows your work without cost or someone else's actions", async () => {
        renderApp("/design/profile", sarah, ...workHandlers);
        expect(await screen.findByRole("heading", { name: "Sarah Test" })).toBeInTheDocument();
        expect(await screen.findByText("Hours per week")).toBeInTheDocument();
        expect(screen.queryByText("Cost to the company")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Export timesheet" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    });

    it("edits your name and keeps your phone, and leaves position and pay to the admin", async () => {
        const bodies: unknown[] = [];
        renderApp("/design/profile", sarah,
            http.put("/api/me/profile", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(sarah); }),
            ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit your profile" });
        expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Pay")).not.toBeInTheDocument();
        const name = within(dialog).getByLabelText("Full name");
        await userEvent.clear(name);
        await userEvent.type(name, "Sarah Haddad");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(bodies).toEqual([{ firstName: "Sarah", lastName: "Haddad", phone: sarah.phone }]));
    });
});
