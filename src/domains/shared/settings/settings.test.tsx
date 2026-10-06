import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { billing } from "@/test/fixtures/billing";
import { settings, settingsHandlers } from "@/test/fixtures/settings";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const nadia = personas.designAdmin;
const rana = personas.superAdmin;
const page = (section: string) => `/design/settings?section=${section}`;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** Whatever the handler received, in order. */
function recorder(method: "put" | "post" | "delete", path: string, reply: object = {}) {
    const bodies: unknown[] = [];
    const handler = http[method](path, async ({ request }) => {
        bodies.push(method === "delete" ? null : await request.json());
        return HttpResponse.json(reply);
    });
    return { bodies, handler };
}

describe("Settings", () => {
    it("are in the company area too, with the business picked for its own sections", async () => {
        const asked: string[] = [];
        renderApp("/company/settings?section=finance", rana,
            http.get("/api/billing-settings/:domain", ({ params }) => { asked.push(String(params.domain)); return HttpResponse.json(billing.settings); }),
            ...settingsHandlers);
        expect(await screen.findByText("Invoicing and payments")).toBeInTheDocument();
        await waitFor(() => expect(asked).toEqual(["design"]));
        await userEvent.click(screen.getByRole("tab", { name: "Execution" }));
        await waitFor(() => expect(asked).toEqual(["design", "execution"]));
        // the company's own section is the same for both
        await userEvent.click(screen.getByRole("button", { name: "Company" }));
        expect(await screen.findByLabelText("Company name")).toBeInTheDocument();
        expect(screen.queryByRole("tablist", { name: "Business" })).not.toBeInTheDocument();
    });

    it("show only the sections a person can change, opening on the theme for an admin", async () => {
        renderApp("/design/settings", nadia, ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).getAllByRole("button").map((b) => b.textContent))
            .toEqual(["Appearance", "Time tracking", "Finance", "Projects", "Notifications", "Teams", "Admins & access", "Data & export"]);
        expect(await screen.findByText("Applies to this browser only. The sun / moon button in the top bar does the same.")).toBeInTheDocument();
        expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
    });

    it("give someone with only team:manage the theme and the teams", async () => {
        renderApp("/design/settings", withPermissions(personas.designEmployee, { grant: [P.TEAM_MANAGE] }), ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Appearance", "Teams"]);
    });

    it("let someone with only exchange_rate:manage set the rate, without the billing around it", async () => {
        renderApp(page("finance"), withPermissions(personas.designEmployee, { grant: [P.EXCHANGE_RATE_MANAGE] }), ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Appearance", "Finance"]);
        expect(await screen.findByText("Payments in another currency")).toBeInTheDocument();
        expect(screen.queryByText("Invoicing and payments")).not.toBeInTheDocument();
    });

    it("saves the company's details for a super admin, with the rest as they were", async () => {
        const put = recorder("put", "/api/company/settings", settings.company);
        renderApp("/design/settings", rana, put.handler, ...settingsHandlers);
        const name = await screen.findByLabelText("Company name");
        await userEvent.clear(name);
        await userEvent.type(name, "ID Indetails SAL");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(put.bodies).toEqual([{
            name: "ID Indetails SAL", address: settings.company.address, website: settings.company.website, weekStart: 1, use24HourTime: false, defaultCurrency: "USD",
        }]));
        expect(await screen.findByText("Company details updated")).toBeInTheDocument();
    });

    it("sets the working week: Monday to Friday, or the days ticked, and where the week starts", async () => {
        const post = recorder("post", "/api/company/working-time", settings.workingTime);
        const put = recorder("put", "/api/company/settings", settings.company);
        renderApp("/design/settings", rana, post.handler, put.handler, ...settingsHandlers);
        await userEvent.click(await screen.findByLabelText("Working week"));
        await userEvent.click(screen.getByRole("option", { name: "Custom days" }));
        const days = screen.getByRole("group", { name: "Working days" });
        expect(within(days).getByLabelText("Friday")).toBeChecked();
        expect(within(days).getByLabelText("Sunday")).not.toBeChecked();
        // a Sunday-to-Thursday week
        await userEvent.click(within(days).getByLabelText("Sunday"));
        await userEvent.click(within(days).getByLabelText("Friday"));
        await userEvent.click(screen.getByRole("button", { name: "Save working days" }));
        await waitFor(() => expect(post.bodies).toEqual([expect.objectContaining({ workDays: [0, 1, 2, 3, 4] })]));
        await waitFor(() => expect(put.bodies).toEqual([expect.objectContaining({ weekStart: 0 })]));
    });

    it("saves a domain rule, keeping every other rule", async () => {
        const put = recorder("put", "/api/domain-settings/design", settings.domainRules);
        renderApp(page("projects"), nadia, put.handler, ...settingsHandlers);
        await userEvent.click(await screen.findByRole("switch", { name: "Allow logging on projects that are on hold" }));
        await waitFor(() => expect(put.bodies).toHaveLength(1));
        const rest = Object.fromEntries(Object.entries(settings.domainRules).filter(([k]) => k !== "domainCode" && k !== "updatedAt"));
        expect(put.bodies[0]).toEqual({ ...rest, holdLogging: true });
        expect(await screen.findByText("Setting saved")).toBeInTheDocument();
    });

    it("keeps a rule changed just before another", async () => {
        const bodies: Record<string, unknown>[] = [];
        const current: Record<string, unknown> = { ...settings.domainRules };
        renderApp(page("projects"), nadia,
            http.put("/api/domain-settings/design", async ({ request }) => {
                const body = await request.json() as Record<string, unknown>;
                bodies.push(body);
                Object.assign(current, body);
                return HttpResponse.json(current);
            }),
            ...settingsHandlers);
        await userEvent.click(await screen.findByRole("switch", { name: "Allow logging on projects that are on hold" }));
        await waitFor(() => expect(bodies).toHaveLength(1));
        const archive = screen.getByRole("switch", { name: "Archive completed projects automatically" });
        await waitFor(() => expect(archive).toBeEnabled());
        await userEvent.click(archive);
        await waitFor(() => expect(bodies).toHaveLength(2));
        // the second save starts from what the first one saved
        expect(bodies[1]).toMatchObject({ holdLogging: true, autoArchive: !settings.domainRules.autoArchive });
    });

    it("says so when a section's settings can't be loaded", async () => {
        renderApp(page("projects"), nadia,
            http.get("/api/domain-settings/:domain", () => HttpResponse.json({ code: "forbidden", message: "You can't see that." }, { status: 403 })),
            ...settingsHandlers);
        expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("leaves out the domain's rules without domain_settings:manage", async () => {
        renderApp(page("notifications"), withPermissions(nadia, { revoke: [P.DOMAIN_SETTINGS_MANAGE] }), ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
        expect(within(nav).queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();
        expect(screen.queryByRole("switch", { name: "Weekly summary" })).not.toBeInTheDocument();
    });
});

describe("the working time", () => {
    it("is read-only for an admin", async () => {
        renderApp(page("time"), nadia, ...settingsHandlers);
        expect(await screen.findByText("Mon–Fri · 9 AM – 5 PM")).toBeInTheDocument();
        expect(screen.queryByLabelText("Break per day")).not.toBeInTheDocument();
        expect(screen.getAllByText(/Only a super admin can change it\./)).toHaveLength(2);
    });

    it("takes a new break from today, keeping the week as it is", async () => {
        const post = recorder("post", "/api/company/working-time", settings.workingTime);
        renderApp(page("time"), rana, post.handler, ...settingsHandlers);
        await userEvent.click(await screen.findByLabelText("Break per day"));
        await userEvent.click(screen.getByRole("option", { name: "30m" }));
        await waitFor(() => expect(post.bodies).toEqual([{
            workDays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1020, breakMinutes: 30, overtimeMultiplier: 1, effectiveFrom: "2026-09-30",
        }]));
    });

    it("warns that changing the company week changes everyone's pay", async () => {
        renderApp(page("time"), rana, ...settingsHandlers);
        const fri = await screen.findByRole("button", { name: "Fri" });
        expect(screen.queryByRole("note")).not.toBeInTheDocument();
        await userEvent.click(fri);
        expect(screen.getByRole("note")).toHaveTextContent("This changes pay for everyone on the company week from Sep 30");
    });

    it("applies a second change made today from tomorrow, on top of the first", async () => {
        const today = { ...settings.workingTime.current, id: 2, effectiveFrom: "2026-09-30", breakMinutes: 30 };
        const post = recorder("post", "/api/company/working-time", settings.workingTime);
        renderApp(page("finance"), rana, post.handler,
            http.get("/api/company/working-time", () => HttpResponse.json({ current: today, policies: [today, settings.workingTime.current] })),
            ...settingsHandlers);
        await userEvent.click(await screen.findByLabelText("Overtime pay rate"));
        await userEvent.click(screen.getByRole("option", { name: "×1.5" }));
        await waitFor(() => expect(post.bodies).toEqual([expect.objectContaining({ breakMinutes: 30, overtimeMultiplier: 1.5, effectiveFrom: "2026-10-01" })]));
        expect(await screen.findByText(/A change already starts today, so this one applies from Oct 1/)).toBeInTheDocument();
    });
});

describe("invoicing settings", () => {
    it("save the payment terms and the bank details, with the rest as they were", async () => {
        const put = recorder("put", "/api/billing-settings/design", billing.settings);
        renderApp(page("finance"), nadia, put.handler, ...settingsHandlers);
        await userEvent.click(await screen.findByLabelText("Default payment terms"));
        await userEvent.click(screen.getByRole("option", { name: "Net 60 - due in 60 days" }));
        await waitFor(() => expect(put.bodies).toHaveLength(1));
        expect(put.bodies[0]).toMatchObject({ defaultTermsDays: 60, invoicePrefix: billing.settings.invoicePrefix, iban: billing.settings.iban });

        const bankRow = screen.getByText("Bank details printed on every invoice").closest(".switch-row") as HTMLElement;
        await userEvent.click(within(bankRow).getByRole("button", { name: "Edit" }));
        const swift = screen.getByLabelText("SWIFT");
        await userEvent.clear(swift);
        await userEvent.type(swift, "BLOMLBBX");
        await userEvent.clear(screen.getByLabelText("Invoice footer"));
        await userEvent.type(screen.getByLabelText("Invoice footer"), "Thank you.");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(put.bodies).toHaveLength(2));
        expect(put.bodies[1]).toMatchObject({ swift: "BLOMLBBX", footer: "Thank you.", bankAccount: billing.settings.bankAccount });
    });

    it("set the LBP rate only with exchange_rate:manage", async () => {
        const post = recorder("post", "/api/exchange-rates", billing.rates[0]);
        renderApp(page("finance"), rana, post.handler, ...settingsHandlers);
        const row = (await screen.findByText("Payments in another currency")).closest(".switch-row") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "Change" }));
        const rate = within(row).getByLabelText("LBP per dollar");
        await userEvent.clear(rate);
        await userEvent.type(rate, "90000");
        await userEvent.click(within(row).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(post.bodies).toEqual([{ currency: "LBP", ratePerUsd: 90000, effectiveFrom: "2026-09-30" }]));
    });

    it("offer the days the API takes a rate from: after the latest one, up to today", async () => {
        renderApp(page("finance"), rana, http.get("/api/exchange-rates", () => HttpResponse.json([{ ...billing.rates[0], effectiveFrom: "2026-09-30" }])), ...settingsHandlers);
        const row = (await screen.findByText("Payments in another currency")).closest(".switch-row") as HTMLElement;
        // one was set today: the next can only start tomorrow, which can't be set yet
        expect(await within(row).findByText("Set today · the next change can apply from tomorrow")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    });

    it("leave the LBP rate fixed for an admin", async () => {
        renderApp(page("finance"), nadia, ...settingsHandlers);
        const row = (await screen.findByText("Payments in another currency")).closest(".switch-row") as HTMLElement;
        expect(await within(row).findByText(/LBP · /)).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    });

    it("turn overdue reminders on and set their schedule, keeping the rest", async () => {
        const on = { ...billing.settings, remindersEnabled: true };
        const put = recorder("put", "/api/billing-settings/design", on);
        renderApp(page("finance"), nadia, put.handler, ...settingsHandlers);
        expect(await screen.findByText(/Off: nobody is reminded automatically/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("switch", { name: "Remind clients of overdue invoices" }));
        await waitFor(() => expect(put.bodies).toHaveLength(1));
        expect(put.bodies[0]).toMatchObject({ remindersEnabled: true, reminderFirstAfterDays: 1, reminderEveryDays: 7, reminderMax: 3, iban: billing.settings.iban });
    });

    it("show the reminder schedule once they are on", async () => {
        const put = recorder("put", "/api/billing-settings/design", billing.settings);
        renderApp(page("finance"), nadia, put.handler,
            http.get("/api/billing-settings/:domain", () => HttpResponse.json({ ...billing.settings, remindersEnabled: true })), ...settingsHandlers);
        expect(await screen.findByText("The first the day after the due date, then every 7 days, 3 reminders at most.")).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("At most"));
        await userEvent.click(screen.getByRole("option", { name: "At most 5 reminders" }));
        await waitFor(() => expect(put.bodies).toEqual([expect.objectContaining({ remindersEnabled: true, reminderMax: 5, defaultTermsDays: billing.settings.defaultTermsDays })]));
    });

    const notSetUp = http.get("/api/billing-settings/:domain", () => HttpResponse.json(
        { type: "not_found", code: "billing_settings_missing", message: "Billing settings have not been set up for this domain yet." }, { status: 404 }));

    it("are set up the first time, saying what is missing as it is typed", async () => {
        const put = recorder("put", "/api/billing-settings/design", billing.settings);
        renderApp(page("finance"), nadia, put.handler, notSetUp, ...settingsHandlers);
        expect(await screen.findByText("Invoicing isn't set up for Design yet.")).toBeInTheDocument();
        expect(screen.getByText("This year's first invoice is ID-2026-001. The other business needs a prefix of its own.")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Set up invoicing" }));
        expect(screen.getByText("Say whose account the client pays into.")).toBeInTheDocument();
        expect(screen.getByText("Enter the IBAN the client pays into.")).toBeInTheDocument();
        expect(put.bodies).toEqual([]);

        await userEvent.type(screen.getByLabelText("Account name"), "ID InDetails SAL");
        await userEvent.type(screen.getByLabelText("IBAN"), "LB62099900000001001901229114");
        await userEvent.type(screen.getByLabelText("SWIFT"), "AUDB");
        expect(screen.queryByText("Say whose account the client pays into.")).not.toBeInTheDocument();
        expect(screen.getByText("A SWIFT code is 8 or 11 letters or digits.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("SWIFT"), "LBBX");
        await userEvent.click(screen.getByRole("button", { name: "Set up invoicing" }));
        await waitFor(() => expect(put.bodies).toEqual([{
            invoicePrefix: "ID", defaultTermsDays: 30, bankAccount: "ID InDetails SAL", bankName: null, iban: "LB62099900000001001901229114",
            swift: "AUDBLBBX", termsText: null, footer: null,
        }]));
        // saved: the settings as they are now, to change like any other
        expect(await screen.findByText("Bank details printed on every invoice")).toBeInTheDocument();
        expect(screen.queryByText("Invoicing isn't set up for Design yet.")).not.toBeInTheDocument();
    });

    it("aren't offered to someone who can only see them", async () => {
        renderApp(page("finance"), withPermissions(nadia, { revoke: [P.BILLING_SETTINGS_MANAGE] }), notSetUp, ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).queryByRole("button", { name: "Finance" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Set up invoicing" })).not.toBeInTheDocument();
    });
});

describe("teams", () => {
    it("are added, renamed and removed", async () => {
        const created = recorder("post", "/api/teams", { id: 99, name: "Lighting", domain: "design", memberCount: 0 });
        const renamed = recorder("put", "/api/teams/:id", settings.teams[0]);
        const removed = recorder("delete", "/api/teams/:id");
        // once removed, the team leaves the list its row was drawn from
        const teams = http.get("/api/teams", () => HttpResponse.json(removed.bodies.length ? settings.teams.filter((t) => t.name !== "Operations") : settings.teams));
        renderApp(page("teams"), nadia, created.handler, renamed.handler, removed.handler, teams, ...settingsHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add team" }));
        await userEvent.type(screen.getByLabelText("Team name"), "Lighting{Enter}");
        await waitFor(() => expect(created.bodies).toEqual([{ name: "Lighting", domainCode: "design" }]));

        const data = screen.getByText("Data").closest(".switch-row") as HTMLElement;
        await userEvent.click(within(data).getByRole("button", { name: "Rename" }));
        const name = within(data).getByLabelText("Team name");
        await userEvent.clear(name);
        await userEvent.type(name, "Data & insights{Enter}");
        await waitFor(() => expect(renamed.bodies).toEqual([{ name: "Data & insights" }]));

        const ops = screen.getByText("Operations").closest(".switch-row") as HTMLElement;
        await userEvent.click(within(ops).getByRole("button", { name: "Remove" }));
        await userEvent.click(within(ops).getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(removed.bodies).toHaveLength(1));
        expect(await screen.findByText("Team removed")).toBeInTheDocument();
    });

    it("aren't offered without team:manage", async () => {
        renderApp(page("teams"), withPermissions(nadia, { revoke: [P.TEAM_MANAGE] }), ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).queryByRole("button", { name: "Teams" })).not.toBeInTheDocument();
        expect(screen.queryByText("Architecture")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add team" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    });
});

describe("admins and access", () => {
    it("lists who manages the business, and invites an admin", async () => {
        renderApp(page("admins"), nadia, ...settingsHandlers);
        expect(await screen.findByText("Who can manage this business.")).toBeInTheDocument();
        expect(await screen.findByText("Karim Jaber")).toBeInTheDocument();
        // an admin doesn't manage permissions
        expect(screen.queryByRole("button", { name: "Permissions" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Invite admin" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("tab", { name: "Admin" })).toHaveAttribute("aria-selected", "true");
    });

    it("change someone's permissions, with a reason", async () => {
        const put = recorder("put", "/api/users/:id/permissions", { ...settings.nadiaPermissions, isJoker: true });
        renderApp(page("admins"), rana, put.handler, ...settingsHandlers);
        const row = (await screen.findByText("Nadia Karam")).closest("tr") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "Permissions" }));
        const dialog = await screen.findByRole("dialog", { name: "Nadia Karam's permissions" });
        const company = await within(dialog).findByRole("checkbox", { name: "View the company overview across both domains" });
        expect(company).not.toBeChecked();
        await userEvent.click(company);
        await userEvent.type(within(dialog).getByLabelText(/Reason/), "Covers the quarterly review");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(put.bodies).toEqual([{ changes: [{ action: "grant", code: "company:view", reason: "Covers the quarterly review" }] }]));
        expect(await screen.findByText("Nadia Karam's permissions updated")).toBeInTheDocument();
    });

    it("grant what an action needs to be usable with it, and say so", async () => {
        const put = recorder("put", "/api/users/:id/permissions", { ...settings.nadiaPermissions, isJoker: true });
        renderApp(page("admins"), rana, put.handler, ...settingsHandlers);
        const row = (await screen.findByText("Nadia Karam")).closest("tr") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "Permissions" }));
        const dialog = await screen.findByRole("dialog", { name: "Nadia Karam's permissions" });
        const excuse = await within(dialog).findByRole("checkbox", { name: "Excuse hours and days off in the hours ledger" });
        const owed = within(dialog).getByRole("checkbox", { name: "View what each employee is owed" });
        expect(owed).not.toBeChecked();
        // codes of one area stay together: sessions with people, categories with the company's expenses
        expect(within(dialog).getAllByText("People")).toHaveLength(1);
        expect(within(dialog).getAllByText("Company expenses")).toHaveLength(1);

        await userEvent.click(excuse);
        expect(owed).toBeChecked();
        expect(within(dialog).getByText("Also grants “View what each employee is owed”, which this needs to be usable.")).toBeInTheDocument();
        // taking the view back away warns that the action can't be used
        await userEvent.click(owed);
        expect(within(dialog).getByText("Without it, “Excuse hours and days off in the hours ledger” can't be used.")).toBeInTheDocument();
        await userEvent.click(owed);

        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(put.bodies).toHaveLength(1));
        expect((put.bodies[0] as { changes: { code: string; action: string }[] }).changes.map((c) => `${c.action} ${c.code}`).sort())
            .toEqual(["grant hours:excuse", "grant salary:view"]);
    });

    it("never offer a super admin's permissions to change", async () => {
        renderApp(page("admins"), rana, ...settingsHandlers);
        const row = (await screen.findByText("Rana Khoury")).closest("tr") as HTMLElement;
        expect(within(row).queryByRole("button", { name: "Permissions" })).not.toBeInTheDocument();
    });
});
