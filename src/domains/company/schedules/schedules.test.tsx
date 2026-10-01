import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { companyPay, companyPayHandlers } from "@/test/fixtures/companyPay";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const s = companyPay.schedules;
const days = (weekdays: number[], start = 540, end = 1020) => weekdays.map((d) => ({ weekday: d, startMinute: start, endMinute: end }));
const week = (weekdays: number[], start = 540, end = 1020) => days(weekdays, start, end).map((d) => ({ ...d, requiredMinutes: end - start - 60 }));

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** The schedules with one person's changed. */
const withPerson = (userId: number, patch: Partial<(typeof s.people)[number]>) =>
    http.get("/api/company/schedules", () => HttpResponse.json({ ...s, people: s.people.map((p) => (p.userId === userId ? { ...p, ...patch } : p)) }));

function saving() {
    const sent: unknown[] = [];
    const handler = http.put("/api/employees/:id/schedule", async ({ request, params }) => {
        sent.push({ id: params.id, ...(await request.json() as object) });
        return HttpResponse.json(s.people[1]);
    });
    return { sent, handler };
}

describe("Schedules", () => {
    it("show everyone's week by business and department, against the company default", async () => {
        renderApp("/company/schedules", rana, ...companyPayHandlers);
        expect(await screen.findByText("Company default: Mon–Fri · 9 AM – 5 PM · 1h break")).toBeInTheDocument();
        expect(screen.getByText("14 employees · 490h a week")).toBeInTheDocument();
        const today = screen.getByRole("columnheader", { name: "Wed30" });
        expect(today).toHaveClass("today");
        expect([...document.querySelectorAll(".sc-dept")].map((r) => r.textContent))
            .toEqual(["Architecture", "Interiors", "Visualisation", "Design · no department", "Procurement", "Site", "Execution · no department", "Company"]);
        const elie = screen.getByText("Elie Khalil").closest("tr") as HTMLElement;
        expect(within(elie).getAllByText("9 AM – 5 PM")).toHaveLength(5);
        expect(within(elie).getAllByText("Off")).toHaveLength(2);
        expect(within(elie).getByText("35h")).toBeInTheDocument();
    });

    it("filter by business and by person or department", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/company/schedules", rana,
            http.get("/api/company/schedules", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(s); }),
            ...companyPayHandlers);
        await screen.findByText("Elie Khalil");
        await userEvent.click(screen.getByRole("tab", { name: "Execution" }));
        await waitFor(() => expect(asked.at(-1)?.get("domain")).toBe("execution"));
        await userEvent.type(screen.getByPlaceholderText("Find a person or department"), "site");
        await waitFor(() => expect(asked.at(-1)?.get("search")).toBe("site"));
    });

    it("give someone their own week, from today", async () => {
        const { sent, handler } = saving();
        renderApp("/company/schedules", rana, handler, ...companyPayHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit Elie Khalil's schedule" }));
        const dialog = await screen.findByRole("dialog", { name: "Elie Khalil's schedule" });
        expect(within(dialog).getByText(/same as the company default/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("switch", { name: "Works on Friday" }));
        expect(within(dialog).getByText("28h")).toBeInTheDocument();
        expect(within(dialog).getByText("Applies from today - past days keep the hours they had.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{ id: "8", followsDefault: false, days: days([1, 2, 3, 4]), effectiveFrom: "2026-09-30" }]));
        expect(await screen.findByText("Elie's schedule saved")).toBeInTheDocument();
    });

    it("warn that a schedule changes pay, in the terms of each kind of person", async () => {
        renderApp("/company/schedules", rana, ...companyPayHandlers);
        const open = async (name: string) => {
            await userEvent.click(await screen.findByRole("button", { name: `Edit ${name}'s schedule` }));
            return screen.findByRole("dialog", { name: `${name}'s schedule` });
        };
        let dialog = await open("Elie Khalil");
        expect(within(dialog).getByRole("note")).toHaveTextContent("This changes Elie's pay from Sep 30.");
        expect(within(dialog).getByRole("note")).toHaveTextContent("the hours they owe each month - a salary loses the hours still short");
        expect(within(dialog).getByRole("note")).toHaveTextContent("Past days are paid as they were.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        dialog = await open("Nadia Karam");
        expect(within(dialog).getByRole("note")).toHaveTextContent("which of their hours are normal: time logged outside these hours is overtime");
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        dialog = await open("Joe Hanna");
        expect(within(dialog).getByRole("note")).toHaveTextContent("how a salary is pro-rated in a month they join or leave, and what an unpaid day off costs");
    });

    it("put someone back on the company week from tomorrow when a change already starts today", async () => {
        const { sent, handler } = saving();
        renderApp("/company/schedules", rana, handler,
            withPerson(8, { isOwn: true, ownSince: "2026-09-30", changedOn: "2026-09-30", days: week([1, 2, 3, 4]), requiredMinutesPerWeek: 1680 }),
            ...companyPayHandlers);
        const row = (await screen.findByText("Elie Khalil")).closest("tr") as HTMLElement;
        expect(within(row).getByText("Draughtsman · own schedule")).toBeInTheDocument();
        await userEvent.click(row);
        const dialog = await screen.findByRole("dialog", { name: "Elie Khalil's schedule" });
        expect(within(dialog).getByText("A change already starts today, so this one applies from Oct 1.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Use company default" }));
        await waitFor(() => expect(sent).toEqual([{ id: "8", followsDefault: true, days: [], effectiveFrom: "2026-10-01" }]));
        expect(await screen.findByText("Elie follows the company default")).toBeInTheDocument();
    });

    it("say that a change saved for the day one is already set replaces it", async () => {
        renderApp("/company/schedules", rana,
            withPerson(8, { changedOn: "2026-09-30", nextChangeOn: "2026-10-01" }),
            ...companyPayHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit Elie Khalil's schedule" }));
        const dialog = await screen.findByRole("dialog", { name: "Elie Khalil's schedule" });
        expect(within(dialog).getByText(/It replaces the change already set for Oct 1\./)).toBeInTheDocument();
    });

    it("treat a week the same as the company's as following it", async () => {
        const { sent, handler } = saving();
        renderApp("/company/schedules", rana, handler,
            withPerson(8, { isOwn: true, ownSince: "2026-06-01", changedOn: "2026-06-01", days: week([1, 2, 3, 4, 5], 480, 960) }),
            ...companyPayHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit Elie Khalil's schedule" }));
        const dialog = await screen.findByRole("dialog", { name: "Elie Khalil's schedule" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Reset to default" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{ id: "8", followsDefault: true, days: [], effectiveFrom: "2026-09-30" }]));
    });

    it("say in the form why a week wasn't saved", async () => {
        renderApp("/company/schedules", rana,
            http.put("/api/employees/:id/schedule", () => HttpResponse.json({ code: "working_time_already_changed", message: "A change already starts today. Choose a later date." }, { status: 422 })),
            ...companyPayHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Edit Elie Khalil's schedule" }));
        const dialog = await screen.findByRole("dialog", { name: "Elie Khalil's schedule" });
        await userEvent.click(within(dialog).getByRole("switch", { name: "Works on Monday" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByRole("alert")).toHaveTextContent("A change already starts today. Choose a later date.");
    });

    it("leave a super admin's week alone without employee:invite_super_admin", async () => {
        renderApp("/company/schedules", withPermissions(rana, { revoke: [P.EMPLOYEE_INVITE_SUPER_ADMIN] }), ...companyPayHandlers);
        await screen.findByText("Rana Khoury");
        expect(screen.queryByRole("button", { name: "Edit Rana Khoury's schedule" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit Elie Khalil's schedule" })).toBeInTheDocument();
    });

    it("send the company default to Settings only for someone who may change it", async () => {
        renderApp("/company/schedules", withPermissions(rana, { revoke: [P.WORKING_TIME_MANAGE] }), ...companyPayHandlers);
        await screen.findByText(/Company default/);
        expect(screen.queryByRole("button", { name: "Change in Settings" })).not.toBeInTheDocument();
    });

    it("are out of reach without schedule:manage", async () => {
        const asked: string[] = [];
        renderApp("/company/schedules", personas.designAdmin,
            http.get("/api/company/schedules", () => { asked.push("schedules"); return HttpResponse.json(s); }),
            ...companyPayHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(asked).toEqual([]);
    });
});
