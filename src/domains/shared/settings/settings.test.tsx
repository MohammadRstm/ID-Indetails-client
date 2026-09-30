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
    it("opens on the company, which only a super admin can change", async () => {
        renderApp("/design/settings", nadia, ...settingsHandlers);
        expect(await screen.findByText("Only a super admin can change these.")).toBeInTheDocument();
        expect(screen.getByLabelText("Company name")).toBeDisabled();
        expect(screen.getByLabelText("Company name")).toHaveValue(settings.company.name);
        expect(screen.queryByRole("button", { name: "Replace" })).not.toBeInTheDocument();
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

    it("saves a domain rule, keeping every other rule", async () => {
        const put = recorder("put", "/api/domain-settings/design", settings.domainRules);
        renderApp(page("projects"), nadia, put.handler, ...settingsHandlers);
        await userEvent.click(await screen.findByRole("switch", { name: "Allow logging on projects that are on hold" }));
        await waitFor(() => expect(put.bodies).toHaveLength(1));
        const rest = Object.fromEntries(Object.entries(settings.domainRules).filter(([k]) => k !== "domainCode" && k !== "updatedAt"));
        expect(put.bodies[0]).toEqual({ ...rest, holdLogging: true });
        expect(await screen.findByText("Setting saved")).toBeInTheDocument();
    });

    it("keeps the domain's rules fixed without domain_settings:manage", async () => {
        renderApp(page("notifications"), withPermissions(nadia, { revoke: [P.DOMAIN_SETTINGS_MANAGE] }), ...settingsHandlers);
        expect(await screen.findByRole("switch", { name: "Weekly summary" })).toBeDisabled();
        expect(screen.getByLabelText("Work entry notifications")).toBeDisabled();
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

    it("leave the LBP rate fixed for an admin", async () => {
        renderApp(page("finance"), nadia, ...settingsHandlers);
        const row = (await screen.findByText("Payments in another currency")).closest(".switch-row") as HTMLElement;
        expect(await within(row).findByText(/LBP · /)).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
    });
});

describe("teams", () => {
    it("are added, renamed and removed", async () => {
        const created = recorder("post", "/api/teams", { id: 99, name: "Lighting", domain: "design", memberCount: 0 });
        const renamed = recorder("put", "/api/teams/:id", settings.teams[0]);
        const removed = recorder("delete", "/api/teams/:id");
        renderApp(page("teams"), nadia, created.handler, renamed.handler, removed.handler, ...settingsHandlers);
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
    });

    it("are only listed without team:manage", async () => {
        renderApp(page("teams"), withPermissions(nadia, { revoke: [P.TEAM_MANAGE] }), ...settingsHandlers);
        expect(await screen.findByText("Architecture")).toBeInTheDocument();
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

    it("never offer a super admin's permissions to change", async () => {
        renderApp(page("admins"), rana, ...settingsHandlers);
        const row = (await screen.findByText("Rana Khoury")).closest("tr") as HTMLElement;
        expect(within(row).queryByRole("button", { name: "Permissions" })).not.toBeInTheDocument();
    });
});
