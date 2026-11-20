import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type RequestHandler } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { salaries, salaryHandlers } from "@/test/fixtures/salaries";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { SalaryAdvance } from "./salaryAdvancesApi";

const rana = personas.superAdmin;
const sep = salaries.september;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const sarah = { id: 3, name: "Sarah Haddad", role: "employee", domain: "design", departmentName: "Interiors", photoFileId: null, leftOn: null };

const advance = (over: Partial<SalaryAdvance> = {}): SalaryAdvance => ({
    id: 7, amount: 400, askedAmount: null, behind: false, canCancel: false, canChange: false, canDecide: false, cancelledAt: null,
    createdAt: "2026-09-28T09:00:00Z", currency: "USD", decidedAt: null, decidedByName: null, decisionNote: null, givenOn: null, left: null,
    months: [], person: sarah, reason: "A medical bill", recordedByName: null, repaid: null, settlement: null, status: "pending", unsettled: false, ...over,
});

/** The three lists of the Advances view, by the view the API is asked for. */
const lists = (byView: Partial<Record<"pending" | "open" | "closed", SalaryAdvance[]>>) =>
    http.get("/api/company/salary-advances", ({ request }) => {
        const items = byView[new URL(request.url).searchParams.get("view") as "pending"] ?? [];
        return HttpResponse.json({ items, page: 1, pageSize: 10, totalCount: items.length });
    });

const waiting = advance({ canDecide: true });
const beingRepaid = advance({
    id: 8, status: "approved", amount: 600, left: 200, repaid: 400, givenOn: "2026-08-10", canChange: true, behind: true,
    months: [
        { month: "2026-08-01", planned: 200, taken: 200, closed: true },
        { month: "2026-09-01", planned: 200, taken: 200, closed: true },
        { month: "2026-10-01", planned: 200, taken: null, closed: false },
    ],
});

const panel = (title: string) => screen.getByText(new RegExp(`^${title}`), { selector: ".panel-title" }).closest(".panel") as HTMLElement;
const table = () => screen.getByText("Employees", { selector: ".panel-title" }).closest(".panel") as HTMLElement;
const kpi = (label: string) => screen.getByText(label, { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;

/** Sarah's row on the month's list, with an advance coming off this month. */
const withAdvance = {
    ...sep,
    rows: { ...sep.rows, items: sep.rows.items.map((r, i) => (i === 0 ? { ...r, advanceRepayment: 150, toHandOver: r.total - 150 } : r)) },
    totals: sep.totals.map((t) => ({ ...t, advanceRepayment: 150, toHandOver: t.total - 150 })),
};

describe("Salaries with salary advances", () => {
    it("adds Advance and To hand over only when someone has an advance that month", async () => {
        const first = renderApp("/company/salaries", rana, http.get("/api/company/salaries", () => HttpResponse.json(withAdvance)), ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        // the headers and the totals' too
        expect(within(table()).getAllByText("To hand over", { selector: "th" })).toHaveLength(2);
        expect(within(table()).getAllByText("Advance", { selector: "th" })).toHaveLength(2);
        const elie = within(table()).getByText("Elie Khalil").closest("tr") as HTMLElement;
        expect(elie).toHaveTextContent(`−${money.exact(150)}`);
        expect(elie).toHaveTextContent(money.exact(withAdvance.rows.items[0].toHandOver));
        // the pay itself keeps its meaning
        expect(elie).toHaveTextContent(money.exact(withAdvance.rows.items[0].total));
        expect(within(table()).getByText("Total").closest("tr")).toHaveTextContent(money.exact(withAdvance.totals[0].toHandOver));
        first.unmount();

        renderApp("/company/salaries", rana, ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        expect(within(table()).queryAllByText("To hand over")).toHaveLength(0);
        expect(within(table()).queryAllByText("Advance", { selector: "th" })).toHaveLength(0);
    });

    it("shows what is still to repay and how many requests wait, and the requests open the Advances view", async () => {
        const summary = { pending: 2, left: [{ currency: "USD", amount: 250 }], unsettled: 1 };
        renderApp("/company/salaries", rana,
            http.get("/api/company/salaries", () => HttpResponse.json({ ...sep, advances: summary })),
            lists({ pending: [waiting, advance({ id: 9, canDecide: true })] }), ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        expect(kpi("Advances still to repay")).toHaveTextContent(money.exact(250));
        expect(kpi("Advances still to repay")).toHaveTextContent("1 left unsettled");
        expect(kpi("Advance requests")).toHaveTextContent("2");

        await userEvent.click(within(kpi("Advance requests")).getByRole("button", { name: "Open the Advances view" }));
        expect(await screen.findByText("Waiting · 2")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Advances" })).toHaveAttribute("aria-selected", "true");
    });

    it("has no advance cards when there are none", async () => {
        renderApp("/company/salaries", rana, ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        expect(screen.queryByText("Advances still to repay", { selector: ".kpi-label" })).not.toBeInTheDocument();
        expect(screen.queryByText("Advance requests", { selector: ".kpi-label" })).not.toBeInTheDocument();
    });
});

describe("the Advances view", () => {
    it("lists the waiting, the being paid back and the closed, with what each allows", async () => {
        renderApp("/company/salaries?view=advances", rana,
            lists({ pending: [waiting], open: [beingRepaid], closed: [advance({ id: 9, status: "declined" })] }), ...salaryHandlers);
        const wait = await screen.findByText("Waiting · 1").then(() => panel("Waiting"));
        expect(within(wait).getByText("Sarah Haddad")).toBeInTheDocument();
        expect(within(wait).getByText("A medical bill")).toBeInTheDocument();
        expect(within(wait).getByText("Waiting for a decision")).toBeInTheDocument();
        expect(within(wait).getByRole("button", { name: "Approve Sarah Haddad's advance" })).toBeInTheDocument();
        expect(within(wait).getByRole("button", { name: "Decline Sarah Haddad's advance" })).toBeInTheDocument();

        const paying = panel("Being paid back");
        expect(within(paying).getByText("Being paid back", { selector: ".badge" })).toBeInTheDocument();
        expect(within(paying).getByText("Behind")).toBeInTheDocument();
        expect(within(paying).getByText(money.exact(200, "USD", { cents: true }), { selector: "td" })).toBeInTheDocument();
        expect(within(paying).getByText(`${money.exact(400, "USD", { cents: true })} repaid`)).toBeInTheDocument();
        expect(within(paying).getByRole("button", { name: "Change Sarah Haddad's months" })).toBeInTheDocument();
        expect(within(paying).getByRole("button", { name: "Settle Sarah Haddad's advance" })).toBeInTheDocument();
        expect(within(paying).queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();

        expect(within(panel("Closed")).getByText("Declined")).toBeInTheDocument();
        expect(within(panel("Closed")).queryByRole("button", { name: /Approve|Settle|Cancel/ })).not.toBeInTheDocument();
    });

    it("shows an empty state for a list with nothing in it", async () => {
        renderApp("/company/salaries?view=advances", rana, lists({}), ...salaryHandlers);
        expect(await screen.findByText("No requests waiting")).toBeInTheDocument();
        expect(screen.getByText("Nothing is being paid back")).toBeInTheDocument();
        expect(screen.getByText("No closed advances")).toBeInTheDocument();
    });

    it("approves a request for a lower amount spread over two months, sending the amount and the months", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ pending: [waiting] }),
            http.post("/api/company/salary-advances/7/approve", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(advance({ status: "approved" })); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Approve Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve the advance" });

        // asked for 400; lowered to 300, split over September and October
        const amount = within(dialog).getByLabelText("Amount to give (USD)");
        expect(amount).toHaveValue("400");
        await userEvent.clear(amount);
        await userEvent.type(amount, "300");
        await userEvent.click(within(dialog).getByRole("button", { name: "Spread over months" }));
        const september = within(dialog).getByLabelText("Amount in September 2026");
        await userEvent.clear(september);
        await userEvent.type(september, "100");
        // the months must add up to the amount, said as it is typed
        expect(within(dialog).getByText("The months add up to $100, and must add up to $300.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
        expect(sent).toEqual([]);

        await userEvent.type(within(dialog).getByLabelText("Amount in October 2026"), "200");
        expect(within(dialog).queryByText(/The months add up to/)).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
        await waitFor(() => expect(sent).toEqual([{ amount: 300, months: [{ month: "2026-09-01", amount: 100 }, { month: "2026-10-01", amount: 200 }] }]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Approve the advance" })).not.toBeInTheDocument());
    });

    it("approves a request in full this month by default", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ pending: [waiting] }),
            http.post("/api/company/salary-advances/7/approve", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(advance({ status: "approved" })); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Approve Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve the advance" });
        await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "Next month, please");
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
        await waitFor(() => expect(sent).toEqual([{ amount: 400, months: [{ month: "2026-09-01", amount: 400 }], note: "Next month, please" }]));
    });

    it("shows what the API refuses next to its field, and a business refusal at the foot", async () => {
        let refuse: Record<string, unknown> = { type: "validation", code: "validation_failed", message: "Invalid.", errors: { months: ["A month takes more than their pay."] } };
        renderApp("/company/salaries?view=advances", rana, lists({ pending: [waiting] }),
            http.post("/api/company/salary-advances/7/approve", () => HttpResponse.json(refuse, { status: 422 })), ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Approve Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve the advance" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
        expect(await within(dialog).findByText("A month takes more than their pay.")).toBeInTheDocument();

        refuse = { type: "business", code: "salary_advance_over_pay", message: "That is more than a month's pay.", errors: null };
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
        expect(await within(dialog).findByText("That is more than a month's pay.")).toBeInTheDocument();
    });

    it("declines a request with a note", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ pending: [waiting] }),
            http.post("/api/company/salary-advances/7/decline", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(advance({ status: "declined" })); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Decline Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Decline the request?" });
        await userEvent.type(within(dialog).getByLabelText("Why (optional)"), "Not this month");
        await userEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
        await waitFor(() => expect(sent).toEqual([{ note: "Not this month" }]));
    });

    it("settles what is left as repaid in cash or written off, saying a write-off is a company expense", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ open: [{ ...beingRepaid, unsettled: true }] }),
            http.post("/api/company/salary-advances/8/settle", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(advance({ id: 8 })); }),
            ...salaryHandlers);
        expect(await screen.findByText("Left unsettled")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Settle Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Settle what is left" });
        expect(dialog).toHaveTextContent(`${money.exact(200, "USD", { cents: true })} left`);

        await userEvent.click(within(dialog).getByRole("tab", { name: "Write off" }));
        expect(within(dialog).getByText(/A write-off is a company expense today/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Write it off" }));
        await waitFor(() => expect(sent).toEqual([{ kind: "written_off" }]));
    });

    it("settles as repaid in cash by default", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ open: [beingRepaid] }),
            http.post("/api/company/salary-advances/8/settle", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(advance({ id: 8 })); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Settle Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Settle what is left" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Mark as repaid" }));
        await waitFor(() => expect(sent).toEqual([{ kind: "cash" }]));
    });

    it("changes the open months, which must add up to what the closed months didn't plan", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ open: [beingRepaid] }),
            http.put("/api/company/salary-advances/8/months", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(beingRepaid); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Change Sarah Haddad's months" }));
        const dialog = await screen.findByRole("dialog", { name: "Change the months" });
        // 600 less the 400 the closed months planned
        expect(dialog).toHaveTextContent(`must add up to ${money.exact(200, "USD", { cents: true })}`);
        await userEvent.click(within(dialog).getByRole("button", { name: "Save the months" }));
        await waitFor(() => expect(sent).toEqual([{ months: [{ month: "2026-10-01", amount: 200 }] }]));
    });

    it("cancels an advance given by mistake", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries?view=advances", rana, lists({ open: [{ ...beingRepaid, canChange: false, canCancel: true }] }),
            http.post("/api/company/salary-advances/8/cancel", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(beingRepaid); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Cancel Sarah Haddad's advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Cancel the advance?" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel the advance" }));
        await waitFor(() => expect(sent).toEqual([{}]));
    });

    it("opens one advance from a link", async () => {
        renderApp("/company/salaries?view=advances&advance=8", rana, lists({ open: [beingRepaid] }),
            http.get("/api/company/salary-advances/8", () => HttpResponse.json(beingRepaid)), ...salaryHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Sarah Haddad's advance" });
        expect(await within(dialog).findByText("Left to repay")).toBeInTheDocument();
        expect(within(dialog).getByText("September 2026 (closed)")).toBeInTheDocument();
    });
});

describe("Salaries' person drawer and salary advances", () => {
    async function openSarah(user: typeof rana, ...handlers: RequestHandler[]) {
        renderApp("/company/salaries", user, ...handlers, ...salaryHandlers);
        const row = (await screen.findByText("Sarah Haddad")).closest("tr") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "View details" }));
        return screen.findByRole("dialog", { name: "Sarah Haddad" });
    }

    it("lists the person's advances and gives another, sending the day and the months", async () => {
        const sent: unknown[] = [];
        const drawer = await openSarah(rana,
            http.get("/api/company/salaries/3", () => HttpResponse.json({ ...salaries.sarah, advances: [beingRepaid] })),
            http.post("/api/company/salary-advances", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(advance({ status: "approved" }), { status: 201 }); }));
        expect(await within(drawer).findByText("Salary advance")).toBeInTheDocument();
        expect(within(drawer).getByText(`−${money.exact(200, "USD", { cents: true })} this month`)).toBeInTheDocument();
        expect(within(drawer).getByRole("button", { name: "See all" })).toBeInTheDocument();

        await userEvent.click(within(drawer).getByRole("button", { name: "Give an advance" }));
        const dialog = await screen.findByRole("dialog", { name: "Give an advance" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Give the advance" }));
        expect(within(dialog).getByText("Enter the amount handed over.")).toBeInTheDocument();
        expect(sent).toEqual([]);
        await userEvent.type(within(dialog).getByLabelText("Amount (USD)"), "100");
        expect(within(dialog).queryByText("Enter the amount handed over.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Give the advance" }));
        await waitFor(() => expect(sent).toEqual([{ userId: 3, amount: 100, givenOn: "2026-09-30", months: [{ month: "2026-09-01", amount: 100 }] }]));
    });

    it("offers no Give an advance without salary_advance:manage", async () => {
        const drawer = await openSarah(withPermissions(rana, { revoke: [P.SALARY_ADVANCE_MANAGE] }));
        expect(await within(drawer).findByText("How the pay adds up")).toBeInTheDocument();
        expect(within(drawer).queryByRole("button", { name: "Give an advance" })).not.toBeInTheDocument();
    });
});
