import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { fmtDur } from "@/shared/format/time";
import { work, workHandlers } from "@/test/fixtures/work";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const sarah = personas.designEmployee;

// Wednesday 30 September 2026, noon in Beirut: after every entry in the fixtures
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("My work (Design)", () => {
    it("adds up their work and lists it day by day", async () => {
        renderApp("/design/my-work", sarah, ...workHandlers);
        expect(await screen.findByText(`avg ${fmtDur(work.summary.totalMinutes / work.summary.entryCount)}`)).toBeInTheDocument();
        expect(await screen.findByText(work.requirements.items[0].text)).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
        expect(screen.getAllByText(work.entries.items[0].description).length).toBeGreaterThan(0);
    });

    it("narrows the list to the project in the link", async () => {
        const asked: string[] = [];
        const projectId = work.entries.items[0].project.id;
        renderApp(`/design/my-work?project=${projectId}`, sarah,
            http.get("/api/me/work-entries", ({ request }) => {
                asked.push(new URL(request.url).searchParams.get("projectId") ?? "");
                return HttpResponse.json(work.entries);
            }),
            ...workHandlers);
        await waitFor(() => expect(asked).toContain(String(projectId)));
    });

    it("shows the week as a calendar", async () => {
        renderApp("/design/my-work", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Week" }));
        expect(await screen.findByText("Week of Sep 28, 2026")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
        expect(await screen.findByText("Week of Sep 21, 2026")).toBeInTheDocument();
    });
});

describe("My pay", () => {
    const salary = work.pay.salary!;

    it("shows what they have earned so far and how it adds up", async () => {
        renderApp("/design/pay", sarah, ...workHandlers);
        expect(await screen.findByText("Earned so far", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(screen.getAllByText(money.exact(salary.earnedSoFar, salary.currency)).length).toBeGreaterThan(0);
        expect(screen.getByText(`Salaried · ${money.exact(salary.amount, salary.currency)} a month`)).toBeInTheDocument();
        expect(screen.getByText("On track")).toBeInTheDocument();
    });

    it("shows ten days, then all of them", async () => {
        renderApp("/design/pay", sarah, ...workHandlers);
        const table = (await screen.findByText("Day by day")).closest(".panel")!;
        expect(within(table as HTMLElement).getAllByRole("row")).toHaveLength(11);
        await userEvent.click(screen.getByRole("button", { name: `Show all ${work.pay.days.length} days` }));
        expect(within(table as HTMLElement).getAllByRole("row")).toHaveLength(work.pay.days.length + 1);
    });

    it("says how far behind they are, with a way to log the missing time", async () => {
        const behind = { ...work.pay, ledger: { ...work.pay.ledger!, status: "behind", shortMinutes: 120 } };
        renderApp("/design/pay", sarah, http.get("/api/me/pay", () => HttpResponse.json(behind)), ...workHandlers);
        expect(await screen.findByText("You're 2h behind.")).toBeInTheDocument();
        const banner = screen.getByText("You're 2h behind.").closest(".banner") as HTMLElement;
        expect(within(banner).getByRole("button", { name: /log work/i })).toBeInTheDocument();
    });

    it("says what the deduction covers: a missed day costs its paid break too", async () => {
        // a closed month, 7h short from one missed day: the day's 8 paid hours come off, at $10.38 an hour
        const closed = {
            ...work.pay, inProgress: false,
            salary: { ...salary, deductionMinutes: 480, deduction: 83.08, basePay: salary.amount - 83.08 },
            ledger: { ...work.pay.ledger!, inProgress: false, status: "short", shortMinutes: 420 },
        };
        renderApp("/design/pay", sarah, http.get("/api/me/pay", () => HttpResponse.json(closed)), ...workHandlers);
        expect(await screen.findByText(/^Short 7h · 8h unpaid · at \$10\.38\/h$/)).toBeInTheDocument();
        expect(screen.getByText(`−${money.exact(83.08, salary.currency)}`)).toBeInTheDocument();
    });

    it("is closed to someone without work_entry:view_own", async () => {
        renderApp("/design/pay", withPermissions(sarah, { revoke: [P.WORK_ENTRY_VIEW_OWN] }), ...workHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });
});

describe("the hours balance on the home page", () => {
    it("flags a month that closed short, and shows the balance", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        // August closed short in the fixture; Sarah is salaried, so the hours come off the salary
        expect(await screen.findByText(/August 2026 closed .* short\./)).toBeInTheDocument();
        expect(await screen.findByText("Unless it's excused, the missing hours come off that month's salary.", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("Hours balance")).toBeInTheDocument();
    });
});
