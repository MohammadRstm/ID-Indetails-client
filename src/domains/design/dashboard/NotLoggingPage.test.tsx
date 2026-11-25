import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { NotLogging } from "./notLoggingApi";

// Wednesday 30 September 2026, 9 AM in Beirut: the week began on Monday the 28th
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const person = (id: number, name: string, extra: Partial<NotLogging["people"][number]> = {}) => ({
    id, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, photoFileId: null,
    loggedMinutes: 0, expectedMinutes: 960, overtimeMinutes: 0, remindedToday: false, ...extra,
});
const list = (...people: NotLogging["people"]): NotLogging => ({ weekStart: "2026-09-28", today: "2026-09-30", people });
const serve = (data: NotLogging) => http.get("/api/reports/not-logging", () => HttpResponse.json(data));
const rowOf = async (name: string) => (await screen.findByText(name)).closest("tr") as HTMLElement;

describe("Not logged this week", () => {
    it("lists the employees with their hours, for an admin and a super admin", async () => {
        for (const user of [personas.designAdmin, personas.superAdmin]) {
            const { unmount } = renderApp("/design/overview/not-logging", user, serve(list(person(4, "Sarah Haddad"), person(6, "Elie Khoury", { expectedMinutes: 480 }))));
            expect(await screen.findByRole("heading", { name: "Not logged this week" })).toBeInTheDocument();
            expect(screen.getByText("Nothing logged since Mon, Sep 28 · 2 employees")).toBeInTheDocument();
            const sarah = within(await rowOf("Sarah Haddad"));
            expect(sarah.getByText("sarah@example.com")).toBeInTheDocument();
            expect(sarah.getByText("0m")).toBeInTheDocument();
            expect(sarah.getByText("16h")).toBeInTheDocument();
            expect(screen.getByRole("columnheader", { name: "Expected so far" })).toBeInTheDocument();
            unmount();
        }
    });

    it("leaves the hours out when the API doesn't send them", async () => {
        const nobody = { loggedMinutes: null, expectedMinutes: null, overtimeMinutes: null };
        renderApp("/design/overview/not-logging", personas.designAdmin, serve(list(person(4, "Sarah Haddad", nobody))));
        await screen.findByText("Sarah Haddad");
        expect(screen.queryByRole("columnheader", { name: "Logged" })).not.toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Expected so far" })).not.toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Overtime" })).not.toBeInTheDocument();
    });

    it("says so when everyone has logged", async () => {
        renderApp("/design/overview/not-logging", personas.designAdmin, serve(list()));
        expect(await screen.findByText("Everyone has logged work this week")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Remind all/ })).toBeDisabled();
    });

    it("reminds one person and says so", async () => {
        const sent: string[] = [];
        renderApp("/design/overview/not-logging", personas.designAdmin, serve(list(person(4, "Sarah Haddad"), person(6, "Elie Khoury"))),
            http.post("/api/reports/not-logging/:id/reminder", ({ params }) => { sent.push(String(params.id)); return HttpResponse.json({ reminded: 1, skipped: 0 }); }));
        await userEvent.click(within(await rowOf("Sarah Haddad")).getByRole("button", { name: /Remind/ }));
        expect(await screen.findByText("Reminded Sarah Haddad")).toBeInTheDocument();
        expect(sent).toEqual(["4"]);
    });

    it("shows who was reminded today with a button that can't be pressed, and Remind all skips them", async () => {
        let posts = 0;
        renderApp("/design/overview/not-logging", personas.designAdmin,
            serve(list(person(4, "Sarah Haddad", { remindedToday: true }), person(6, "Elie Khoury"), person(7, "Lina Saad"))),
            http.post("/api/reports/not-logging/reminders", () => { posts += 1; return HttpResponse.json({ reminded: 2, skipped: 1 }); }));
        expect(within(await rowOf("Sarah Haddad")).getByRole("button", { name: /Reminded today/ })).toBeDisabled();
        expect(within(await rowOf("Elie Khoury")).getByRole("button", { name: /Remind/ })).toBeEnabled();
        await userEvent.click(screen.getByRole("button", { name: /Remind all/ }));
        expect(await screen.findByText("Reminded 2 employees")).toBeInTheDocument();
        expect(screen.getByText("1 employee already reminded today was skipped.")).toBeInTheDocument();
        expect(posts).toBe(1);
    });

    it("turns Remind all off when everyone was reminded today", async () => {
        renderApp("/design/overview/not-logging", personas.designAdmin, serve(list(person(4, "Sarah Haddad", { remindedToday: true }))));
        await screen.findByText("Sarah Haddad");
        expect(screen.getByRole("button", { name: /Remind all/ })).toBeDisabled();
    });

    it("shows why a reminder wasn't sent, and reloads the list", async () => {
        let loads = 0;
        renderApp("/design/overview/not-logging", personas.designAdmin,
            http.get("/api/reports/not-logging", () => { loads += 1; return HttpResponse.json(list(person(4, "Sarah Haddad"))); }),
            http.post("/api/reports/not-logging/:id/reminder", () => HttpResponse.json(
                { type: "conflict", code: "already_reminded", message: "Sarah Haddad has already been reminded today." }, { status: 409 })));
        await userEvent.click(within(await rowOf("Sarah Haddad")).getByRole("button", { name: /Remind/ }));
        expect(await screen.findByText("Sarah Haddad has already been reminded today.")).toBeInTheDocument();
        await waitFor(() => expect(loads).toBe(2));
    });

    it("shows a failed load with a way to try again", async () => {
        renderApp("/design/overview/not-logging", personas.designAdmin,
            http.get("/api/reports/not-logging", () => HttpResponse.json({ type: "unexpected", code: "internal_error", message: "Something went wrong." }, { status: 500 })));
        expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("isn't open to employees", async () => {
        renderApp("/design/overview/not-logging", personas.designEmployee, serve(list(person(4, "Sarah Haddad"))));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Not logged this week" })).not.toBeInTheDocument());
        expect(screen.queryByText("Sarah Haddad")).not.toBeInTheDocument();
    });
});
