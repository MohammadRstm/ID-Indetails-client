import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companyHandlers } from "@/test/fixtures/company";
import { peopleHandlers } from "@/test/fixtures/people";
import { workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { MySalaryAdvance, MySalaryAdvances } from "./salaryAdvancesApi";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const sarah = personas.designEmployee;

const advance = (over: Partial<MySalaryAdvance> = {}): MySalaryAdvance => ({
    id: 1, status: "pending", amount: 400, askedAmount: null, currency: "USD", reason: "A medical bill", createdAt: "2026-11-08T09:00:00Z",
    decidedAt: null, decisionNote: null, givenOn: null, months: [], left: null, settledKind: null, settledOn: null, cancelledAt: null, ...over,
});

const mine = (over: Partial<MySalaryAdvances> = {}) =>
    http.get("/api/me/salary-advances", () => HttpResponse.json({ canAsk: true, cannotAskBecause: null, currency: "USD", items: [], ...over }));

describe("the person's own salary advance", () => {
    it("shows an empty section on My profile with Ask for an advance ready", async () => {
        renderApp("/design/profile", sarah, ...workHandlers, mine());
        expect(await screen.findByText("No salary advances")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ask for an advance" })).toBeEnabled();
    });

    it("asks for an advance, showing each field's error live", async () => {
        const sent: unknown[] = [];
        renderApp("/design/profile", sarah, ...workHandlers, mine(),
            http.post("/api/me/salary-advances", async ({ request: r }) => { sent.push(await r.json()); return HttpResponse.json(advance(), { status: 201 }); }));
        await userEvent.click(await screen.findByRole("button", { name: "Ask for an advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Ask for an advance" });

        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        expect(within(dialog).getByText("Enter the amount you need.")).toBeInTheDocument();
        expect(within(dialog).getByText("Say why you need the advance.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.type(within(dialog).getByLabelText("Amount (USD)"), "250");
        expect(within(dialog).queryByText("Enter the amount you need.")).not.toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Reason"), "A medical bill");
        expect(within(dialog).queryByText("Say why you need the advance.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        await waitFor(() => expect(sent).toEqual([{ amount: 250, reason: "A medical bill" }]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ask for an advance" })).not.toBeInTheDocument());
    });

    it("shows what the API refuses next to its field, and a business refusal at the foot", async () => {
        let refuse: Record<string, unknown> = { type: "validation", code: "validation_failed", message: "Invalid.", errors: { amount: ["That is more than you can ask for."] } };
        renderApp("/design/profile", sarah, ...workHandlers, mine(),
            http.post("/api/me/salary-advances", () => HttpResponse.json(refuse, { status: 422 })));
        await userEvent.click(await screen.findByRole("button", { name: "Ask for an advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Ask for an advance" });
        await userEvent.type(within(dialog).getByLabelText("Amount (USD)"), "250");
        await userEvent.type(within(dialog).getByLabelText("Reason"), "Rent");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        expect(await within(dialog).findByText("That is more than you can ask for.")).toBeInTheDocument();

        refuse = { type: "business", code: "salary_advance_pending", message: "Your last request is still waiting for a decision.", errors: null };
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        expect(await within(dialog).findByText("Your last request is still waiting for a decision.")).toBeInTheDocument();
    });

    it("lists the advances with their months and what is still to repay, and never what a month took", async () => {
        renderApp("/design/profile", sarah, ...workHandlers, mine({
            canAsk: false, cannotAskBecause: "salary_advance_open",
            items: [advance({
                id: 2, status: "approved", amount: 400, askedAmount: 500, reason: "A medical bill", decisionNote: "Take it off in two months", givenOn: "2026-10-20",
                months: [
                    { month: "2026-11-01", planned: 200, taken: null, closed: true },
                    { month: "2026-12-01", planned: 200, taken: null, closed: false },
                ],
                left: 200,
            })],
        }));
        const section = await screen.findByLabelText("Salary advance");
        expect(await within(section).findByText("$400")).toBeInTheDocument();
        expect(within(section).getByText("Being paid back")).toBeInTheDocument();
        expect(within(section).getByText("You asked for $500")).toBeInTheDocument();
        expect(within(section).getByText("A medical bill")).toBeInTheDocument();
        expect(within(section).getByText("Note: Take it off in two months")).toBeInTheDocument();
        expect(within(section).getByText("Nov −$200 ✓")).toBeInTheDocument();
        expect(within(section).getByText("Dec −$200")).toBeInTheDocument();
        expect(within(section).getByText("$200", { selector: "b" })).toBeInTheDocument();
        expect(within(section).getByText("still to repay")).toBeInTheDocument();
        expect(within(section).queryByRole("button", { name: /^Withdraw/ })).not.toBeInTheDocument();
    });

    it("switches asking off and says why", async () => {
        renderApp("/design/profile", sarah, ...workHandlers, mine({ canAsk: false, cannotAskBecause: "salary_advance_open", items: [advance({ status: "approved", left: 100 })] }));
        expect(await screen.findByText("Your last advance isn't paid back yet.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ask for an advance" })).toBeDisabled();
    });

    it("says there is no pay yet, and that a request is waiting", async () => {
        const first = renderApp("/design/profile", sarah, ...workHandlers, mine({ canAsk: false, cannotAskBecause: "salary_advance_no_pay", currency: null }));
        expect(await screen.findByText("Your pay isn't set yet, so there is nothing to advance.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ask for an advance" })).toBeDisabled();
        first.unmount();

        renderApp("/design/profile", sarah, ...workHandlers, mine({ canAsk: false, cannotAskBecause: "salary_advance_pending", items: [advance()] }));
        expect(await screen.findByText("Your last request is still waiting for a decision.")).toBeInTheDocument();
    });

    it("withdraws a waiting request after asking", async () => {
        const withdrawn: number[] = [];
        renderApp("/design/profile", sarah, ...workHandlers, mine({ canAsk: false, cannotAskBecause: "salary_advance_pending", items: [advance({ id: 7 })] }),
            http.post("/api/me/salary-advances/:id/withdraw", ({ params }) => { withdrawn.push(Number(params.id)); return HttpResponse.json(advance({ id: 7, status: "withdrawn" })); }));
        await userEvent.click(await screen.findByRole("button", { name: /^Withdraw the request from/ }));
        const dialog = await screen.findByRole("dialog", { name: "Withdraw the request?" });
        expect(withdrawn).toEqual([]);
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
        await waitFor(() => expect(withdrawn).toEqual([7]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Withdraw the request?" })).not.toBeInTheDocument());
    });

    it("is on a super admin's company profile", async () => {
        renderApp("/company/profile", personas.superAdmin, ...companyHandlers, mine());
        expect(await screen.findByText("No salary advances")).toBeInTheDocument();
    });

    it("hides the section when the API doesn't offer it", async () => {
        renderApp("/design/profile", sarah, ...workHandlers,
            http.get("/api/me/salary-advances", () => HttpResponse.json({ type: "forbidden", code: "forbidden", message: "No." }, { status: 403 })));
        expect(await screen.findByRole("heading", { name: "Sarah Test" })).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByLabelText("Salary advance")).not.toBeInTheDocument());
        expect(screen.queryByText(/salary advances/i)).not.toBeInTheDocument();
    });

    it("is not on someone else's profile", async () => {
        renderApp("/design/people/9", personas.designAdmin, ...peopleHandlers, mine());
        expect(await screen.findByRole("heading", { name: "Yara Mansour" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Salary advance")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Ask for an advance" })).not.toBeInTheDocument();
    });
});
