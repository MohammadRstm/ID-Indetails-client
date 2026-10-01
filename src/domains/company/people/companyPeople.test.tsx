import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { companyHandlers } from "@/test/fixtures/company";
import { settings, settingsHandlers } from "@/test/fixtures/settings";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
type Row = Schemas["EmployeeSummaryResponse"];

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const [karim, nadia] = settings.admins;
const invited: Row = { ...karim, id: 40, email: "lina@id-indetails.test", firstName: null, lastName: null, role: "employee", domain: "design", position: null, status: "invited", joinedOn: null, online: false, lastSeenAt: null };
const gone: Row = { ...karim, id: 41, email: "omar@id-indetails.test", firstName: "Omar", lastName: "Haddad", role: "employee", position: "Site engineer", status: "deactivated", leftOn: "2026-08-31" };
const everyone = [...settings.superAdmins, nadia, karim, invited, gone];

/** The people list, answering as the API filters it, and every list asked for. */
function peopleList(asked: URLSearchParams[] = []) {
    return http.get("/api/employees", ({ request }) => {
        const q = new URL(request.url).searchParams;
        asked.push(q);
        const rows = everyone.filter((p) => (!q.get("status") || p.status === q.get("status"))
            && (!q.get("domain") || p.domain === q.get("domain")) && (!q.get("role") || p.role === q.get("role")));
        return HttpResponse.json({ items: rows, page: 1, pageSize: 25, totalCount: rows.length });
    });
}
const handlers = [http.get("/api/teams", () => HttpResponse.json(settings.teams)), ...companyHandlers];

describe("the company's people", () => {
    it("lists everyone in both businesses and above them, and filters them", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/company/overview?tab=people", rana, peopleList(asked), ...handlers);
        const table = await screen.findByRole("table");
        const row = (text: string) => within(table).getByText(text).closest("tr") as HTMLElement;
        expect(within(row("Rana Khoury")).getByText("Company")).toBeInTheDocument();
        expect(within(row("Karim Jaber")).getByText("Execution")).toBeInTheDocument();
        expect(within(row("lina@id-indetails.test")).getByText("Invited")).toBeInTheDocument();
        expect(within(row("Omar Haddad")).getByText("Left Aug 31, 2026")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Left" }));
        await waitFor(() => expect(asked.at(-1)?.get("status")).toBe("deactivated"));
        expect(await within(screen.getByRole("table")).findByText("Omar Haddad")).toBeInTheDocument();
        expect(within(screen.getByRole("table")).queryByText("Karim Jaber")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Everyone" }));
        await userEvent.click(screen.getByLabelText("Business"));
        await userEvent.click(screen.getByRole("option", { name: "Super admins" }));
        await waitFor(() => expect(asked.at(-1)?.get("role")).toBe("super_admin"));
        expect(asked.at(-1)?.get("domain")).toBeNull();
    });

    it("adds someone to the business chosen, saying what is missing first", async () => {
        const sent: unknown[] = [];
        renderApp("/company/overview?tab=people", rana, peopleList(),
            http.post("/api/invitations", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json({ id: 50, userId: 60, email: "sami@id-indetails.test", role: "employee", domain: "execution", status: "pending", expiresAt: "2026-10-07T09:00:00Z", createdAt: "2026-09-30T09:00:00Z" }, { status: 201 });
            }),
            ...handlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add person" }));
        const dialog = await screen.findByRole("dialog", { name: "Add person" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
        expect(within(dialog).getByText("Enter their work email.")).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Work email"), "sami@id-indetails");
        expect(within(dialog).getByText("Enter an email like name@company.com.")).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Work email"), ".test");
        expect(within(dialog).queryByText("Enter an email like name@company.com.")).not.toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("tab", { name: "Execution" }));
        await userEvent.click(within(dialog).getByLabelText("Team"));
        await userEvent.click(screen.getByRole("option", { name: "Site" }));
        expect(within(dialog).getByText("Enter their pay per month.")).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Pay"), "900");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
        expect(await screen.findByRole("dialog", { name: "Invitation sent" })).toBeInTheDocument();
        expect(sent).toEqual([{
            email: "sami@id-indetails.test", role: "employee", domainCode: "execution", teamId: 15, position: null,
            pay: { basis: "monthly", amount: 900, currency: "USD" },
        }]);
    });

    it("deactivates someone who left, and takes back someone who returns", async () => {
        const calls: string[] = [];
        renderApp("/company/overview?tab=people", rana, peopleList(),
            http.post("/api/employees/:id/deactivate", ({ params }) => { calls.push(`deactivate ${params.id}`); return HttpResponse.json({}); }),
            http.post("/api/employees/:id/reactivate", ({ params }) => { calls.push(`reactivate ${params.id}`); return HttpResponse.json({ status: "active" }); }),
            ...handlers);
        const table = await screen.findByRole("table");
        const actions = (name: string) => within(within(table).getByText(name).closest("tr") as HTMLElement).getByRole("button", { name: "More actions" });

        await userEvent.click(actions("Nadia Karam"));
        await userEvent.click(screen.getByRole("button", { name: "Deactivate…" }));
        const deactivate = await screen.findByRole("dialog", { name: "Deactivate account" });
        expect(within(deactivate).getByText(/every session they have open ends now/)).toBeInTheDocument();
        await userEvent.click(within(deactivate).getByRole("button", { name: "Deactivate" }));
        await waitFor(() => expect(calls).toEqual(["deactivate 2"]));

        await userEvent.click(actions("Omar Haddad"));
        await userEvent.click(screen.getByRole("button", { name: "Reactivate…" }));
        await userEvent.click(within(await screen.findByRole("dialog", { name: "Reactivate account" })).getByRole("button", { name: "Reactivate" }));
        await waitFor(() => expect(calls).toEqual(["deactivate 2", "reactivate 41"]));
        // nobody changes their own account
        expect(within(within(table).getByText("Rana Khoury").closest("tr") as HTMLElement).queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    });

    it("is a tab only for someone who can see the employees", async () => {
        renderApp("/company/overview?tab=people", withPermissions(rana, { revoke: [P.EMPLOYEE_VIEW] }), peopleList(), ...handlers);
        expect(await screen.findByText("What the company keeps")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "People" })).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Teams" })).toBeInTheDocument();
    });
});

describe("the company's teams", () => {
    it("are kept for both businesses, and a new one needs a name", async () => {
        const created: unknown[] = [];
        renderApp("/company/overview?tab=teams", rana,
            http.post("/api/teams", async ({ request }) => { created.push(await request.json()); return HttpResponse.json({ id: 99, name: "Finishing crew", domain: "execution", memberCount: 0 }, { status: 201 }); }),
            ...handlers);
        const design = (await screen.findByText("Design teams")).closest(".panel") as HTMLElement;
        const execution = screen.getByText("Execution teams").closest(".panel") as HTMLElement;
        expect(await within(design).findByText("Interiors")).toBeInTheDocument();
        expect(within(execution).getByText("Site")).toBeInTheDocument();
        expect(within(execution).queryByText("Interiors")).not.toBeInTheDocument();

        await userEvent.click(within(execution).getByRole("button", { name: "Add team" }));
        await userEvent.click(within(execution).getByRole("button", { name: "Add" }));
        expect(within(execution).getByText("Give the team a name.")).toBeInTheDocument();
        await userEvent.type(within(execution).getByLabelText("Team name"), "Finishing crew");
        await userEvent.click(within(execution).getByRole("button", { name: "Add" }));
        await waitFor(() => expect(created).toEqual([{ name: "Finishing crew", domainCode: "execution" }]));
    });

    it("are no longer in a business's settings for whoever has them here", async () => {
        renderApp("/design/settings?section=teams", rana, ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).queryByRole("button", { name: "Teams" })).not.toBeInTheDocument();
        expect(within(nav).getByRole("button", { name: "Company" })).toHaveAttribute("aria-current", "page");
    });
});
