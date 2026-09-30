import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { salaries, salaryHandlers } from "@/test/fixtures/salaries";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const sep = salaries.september;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const kpi = (label: string) => screen.getByText(label, { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
const table = () => screen.getByText("Employees", { selector: ".panel-title" }).closest(".panel") as HTMLElement;
const rowOf = (name: string) => within(table()).getByText(name).closest("tr") as HTMLElement;

async function openDetails(name: string) {
    await userEvent.click(within(await screen.findByText(name).then((n) => n.closest("tr") as HTMLElement)).getByRole("button", { name: "View details" }));
    return screen.findByRole("dialog", { name });
}

describe("Salaries", () => {
    it("show what each person is owed this month, with totals across every page", async () => {
        renderApp("/company/salaries", rana, ...salaryHandlers);
        expect(await screen.findByText("Elie Khalil")).toBeInTheDocument();
        expect(screen.getByText("In progress · to Sep 30")).toBeInTheDocument();
        expect(kpi("To pay")).toHaveTextContent(money.exact(sep.totals[0].total));
        expect(kpi("Employees")).toHaveTextContent("9 on a monthly salary");
        expect(kpi("Behind so far")).toHaveTextContent("2");
        expect(within(table()).getAllByRole("row").filter((r) => r.querySelector(".av, .av-fb"))).toHaveLength(10);
        expect(within(rowOf("Rami Aoun")).getByText("13h 40m behind")).toBeInTheDocument();
        expect(within(rowOf("Joe Hanna")).getByText("hours not tracked")).toBeInTheDocument();
        expect(within(table()).getByText(/all 13 employees, across 2 pages · September 2026/)).toBeInTheDocument();
        expect(screen.getByText("1–10 of 13")).toBeInTheDocument();
    });

    it("move between months, and a closed month flags who finished short", async () => {
        const asked: string[] = [];
        renderApp("/company/salaries", rana,
            http.get("/api/company/salaries", ({ request }) => {
                const month = new URL(request.url).searchParams.get("month");
                asked.push(month ?? "");
                return HttpResponse.json(month === "2026-08" ? salaries.august : sep);
            }),
            ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
        expect(await screen.findByText("August 2026")).toBeInTheDocument();
        await waitFor(() => expect(asked.at(-1)).toBe("2026-08"));
        expect(await screen.findByText("Short on hours", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(screen.queryByText(/In progress/)).not.toBeInTheDocument();
        expect(within(rowOf("Omar Fares")).getByText("Short 147h")).toBeInTheDocument();
        expect(within(rowOf("Omar Fares")).getByText(`−${money.exact(1938.5)} short`)).toBeInTheDocument();
    });

    it("open on the month a link asks for", async () => {
        const asked: string[] = [];
        renderApp("/company/salaries?month=2026-08", rana,
            http.get("/api/company/salaries", ({ request }) => { asked.push(new URL(request.url).searchParams.get("month") ?? ""); return HttpResponse.json(salaries.august); }),
            ...salaryHandlers);
        expect(await screen.findByText("August 2026")).toBeInTheDocument();
        expect(asked[0]).toBe("2026-08");
    });

    it("filter by business and search, counting everyone", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/company/salaries", rana,
            http.get("/api/company/salaries", ({ request }) => {
                const q = new URL(request.url).searchParams;
                asked.push(q);
                if (q.get("domain") !== "execution") return HttpResponse.json(sep);
                const items = sep.rows.items.filter((r) => r.domain === "execution");
                return HttpResponse.json({ ...sep, rows: { ...sep.rows, items, totalCount: 5 } });
            }),
            ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        await userEvent.click(screen.getByRole("tab", { name: "Execution" }));
        expect(await screen.findByText("5 of 13")).toBeInTheDocument();
        expect(asked.some((q) => q.get("domain") === "execution" && q.get("page") === "1" && q.get("pageSize") === "10")).toBe(true);
        await userEvent.type(screen.getByPlaceholderText("Search by name or email"), "karim");
        await waitFor(() => expect(asked.some((q) => q.get("search") === "karim" && q.get("domain") === "execution")).toBe(true));
    });

    it("export every page as filtered", async () => {
        const asked: URLSearchParams[] = [];
        URL.createObjectURL = vi.fn(() => "blob:salaries");
        URL.revokeObjectURL = vi.fn();
        renderApp("/company/salaries", rana,
            http.get("/api/company/salaries/export", ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return new HttpResponse("Month,Employee\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="salaries-2026-09.csv"' } });
            }),
            ...salaryHandlers);
        await screen.findByText("Elie Khalil");
        await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
        expect(await screen.findByText("Exported 13 employees")).toBeInTheDocument();
        expect(screen.getByText("salaries-2026-09.csv · every page, as filtered")).toBeInTheDocument();
        expect(asked[0].get("month")).toBe("2026-09");
    });

    it("are out of reach without salary:view", async () => {
        const asked: string[] = [];
        renderApp("/company/salaries", personas.designAdmin,
            http.get("/api/company/salaries", () => { asked.push("list"); return HttpResponse.json(sep); }),
            ...salaryHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("show only the business someone may see, without a choice of business", async () => {
        renderApp("/company/salaries", withPermissions(personas.designAdmin, { grant: [P.SALARY_VIEW] }), ...salaryHandlers);
        expect(await screen.findByText("Elie Khalil")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Execution" })).not.toBeInTheDocument();
    });
});

describe("A person's salary", () => {
    it("opens from the keyboard", async () => {
        renderApp("/company/salaries", rana, ...salaryHandlers);
        const row = (await screen.findByText("Sarah Haddad")).closest("tr") as HTMLElement;
        row.focus();
        await userEvent.keyboard("{Enter}");
        expect(await screen.findByRole("dialog", { name: "Sarah Haddad" })).toBeInTheDocument();
    });

    it("shows the hours owed, how the pay adds up and where the overtime happened", async () => {
        renderApp("/company/salaries", rana, ...salaryHandlers);
        const drawer = await openDetails("Sarah Haddad");
        expect(within(drawer).getByText("Senior interior designer · Design · September 2026")).toBeInTheDocument();
        expect(await within(drawer).findByText("Hours owed so far")).toBeInTheDocument();
        expect(within(drawer).getByText("…of which made up missing hours (paid as normal)").parentElement).toHaveTextContent("10h 50m");
        expect(within(drawer).getByText("Hours covered")).toBeInTheDocument();
        expect(within(drawer).getByText("Monthly salary").parentElement).toHaveTextContent(money.exact(1800));
        expect(within(drawer).getByText(/Overtime · 2h 10m \(of 13h logged\)/)).toBeInTheDocument();
        expect(await within(drawer).findByText("Client revisions to the lounge")).toBeInTheDocument();
        expect(within(drawer).getByText("10 days")).toBeInTheDocument();
        expect(within(drawer).getByRole("button", { name: "Open profile" })).toBeInTheDocument();
    });

    it("prices hourly work with each day's paid break", async () => {
        renderApp("/company/salaries", rana, ...salaryHandlers);
        const drawer = await openDetails("Rami Aoun");
        expect(await within(drawer).findByText("Behind so far")).toBeInTheDocument();
        expect(within(drawer).getByText(/Paid breaks · 18 working days/).parentElement).toHaveTextContent(money.exact(252));
        expect(within(drawer).getByText("Working days with nothing logged, not excused").parentElement).toHaveTextContent("3");
    });

    it("shows a closed month's shortfall coming off a salary", async () => {
        renderApp("/company/salaries?month=2026-08", rana, ...salaryHandlers);
        const drawer = await openDetails("Omar Fares");
        expect(await within(drawer).findByText("Still short - flagged")).toBeInTheDocument();
        expect(within(drawer).getByText(/Short 147h · 168h deducted at/).parentElement).toHaveTextContent(`−${money.exact(1938.5)}`);
        expect(within(drawer).getByText(/A whole day missed costs the full paid day/)).toBeInTheDocument();
        expect(within(drawer).getByText("Closed month.")).toBeInTheDocument();
    });

    it("excuses hours, starting from what is short", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries", rana,
            http.post("/api/employees/:id/hour-excuses", async ({ request, params }) => { sent.push({ id: params.id, ...(await request.json() as object) }); return HttpResponse.json({}, { status: 201 }); }),
            ...salaryHandlers);
        const drawer = await openDetails("Rami Aoun");
        await userEvent.click(await within(drawer).findByRole("button", { name: "Excuse hours or days…" }));
        expect(within(drawer).getByLabelText("Hours")).toHaveValue("13.67");
        // hourly pay has nothing to lose, so there is no paid or unpaid choice
        expect(within(drawer).queryByRole("tab", { name: "Unpaid" })).not.toBeInTheDocument();
        await userEvent.type(within(drawer).getByLabelText("Reason"), "Public holiday");
        await userEvent.click(within(drawer).getByRole("button", { name: "Excuse 13h 40m" }));
        await waitFor(() => expect(sent).toEqual([{ id: "6", month: "2026-09", kind: "minutes", minutes: 820, days: [], isPaid: true, note: "Public holiday" }]));
        expect(await screen.findByText("13h 40m excused")).toBeInTheDocument();
    });

    it("excuses days off, and a salary's can be unpaid", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries", rana,
            http.post("/api/employees/:id/hour-excuses", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json({}, { status: 201 }); }),
            ...salaryHandlers);
        const drawer = await openDetails("Sarah Haddad");
        await userEvent.click(await within(drawer).findByRole("button", { name: "Excuse hours or days…" }));
        await userEvent.click(within(drawer).getByRole("tab", { name: "Days off" }));
        await userEvent.click(within(drawer).getByRole("button", { name: "Sep 4" }));
        await userEvent.click(within(drawer).getByRole("button", { name: "Sep 3" }));
        expect(within(drawer).getByText("2 days · 14h of scheduled hours")).toBeInTheDocument();
        await userEvent.click(within(drawer).getByRole("tab", { name: "Unpaid" }));
        expect(within(drawer).getByText(/an unpaid day off costs the full paid day/)).toBeInTheDocument();
        await userEvent.click(within(drawer).getByRole("button", { name: "Record 2 days" }));
        await waitFor(() => expect(sent).toEqual([{ month: "2026-09", kind: "days", minutes: null, days: ["2026-09-03", "2026-09-04"], isPaid: false, note: null }]));
    });

    it("says why an excuse wasn't saved, in the form", async () => {
        renderApp("/company/salaries", rana,
            http.post("/api/employees/:id/hour-excuses", () => HttpResponse.json({ code: "excuse_month_in_future", message: "Hours can't be excused for a future month." }, { status: 422 })),
            ...salaryHandlers);
        const drawer = await openDetails("Rami Aoun");
        await userEvent.click(await within(drawer).findByRole("button", { name: "Excuse hours or days…" }));
        await userEvent.click(within(drawer).getByRole("button", { name: "Excuse whole month" }));
        expect(await within(drawer).findByRole("alert")).toHaveTextContent("Hours can't be excused for a future month.");
    });

    it("removes an excuse", async () => {
        const removed: string[] = [];
        const excused = { ...salaries.rami, excuses: [{ id: 41, month: "2026-09-01", kind: "whole_month" as const, minutes: null, days: [], isPaid: true, note: "Unpaid leave after the project", createdAt: "2026-09-02T08:00:00Z", createdById: 1 }] };
        renderApp("/company/salaries", rana,
            http.get("/api/company/salaries/6", () => HttpResponse.json(excused)),
            http.delete("/api/hour-excuses/:id", ({ params }) => { removed.push(String(params.id)); return new HttpResponse(null, { status: 204 }); }),
            ...salaryHandlers);
        const drawer = await openDetails("Rami Aoun");
        const line = (await within(drawer).findByText("Whole month excused")).closest(".hl-excuse-row") as HTMLElement;
        await userEvent.click(within(line).getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(removed).toEqual(["41"]));
        expect(await screen.findByText("Excuse removed")).toBeInTheDocument();
    });

    it("lists excuses without changing them, without hours:excuse", async () => {
        const excused = { ...salaries.rami, excuses: [{ id: 41, month: "2026-09-01", kind: "minutes" as const, minutes: 120, days: [], isPaid: true, note: "Dentist", createdAt: "2026-09-02T08:00:00Z", createdById: 1 }] };
        renderApp("/company/salaries", withPermissions(rana, { revoke: [P.HOURS_EXCUSE] }),
            http.get("/api/company/salaries/6", () => HttpResponse.json(excused)),
            ...salaryHandlers);
        const drawer = await openDetails("Rami Aoun");
        expect(await within(drawer).findByText("2h excused")).toBeInTheDocument();
        expect(within(drawer).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
        expect(within(drawer).queryByRole("button", { name: "Excuse hours or days…" })).not.toBeInTheDocument();
    });

    it("leaves out whose overtime it was without work_entry:view_all", async () => {
        const asked: string[] = [];
        renderApp("/company/salaries", withPermissions(rana, { revoke: [P.WORK_ENTRY_VIEW_ALL] }),
            http.get("/api/employees/:id/overtime", () => { asked.push("overtime"); return HttpResponse.json(salaries.sarahOvertime); }),
            ...salaryHandlers);
        const drawer = await openDetails("Sarah Haddad");
        expect(await within(drawer).findByText("How the pay adds up")).toBeInTheDocument();
        expect(within(drawer).queryByText("Where the overtime happened")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("gives Execution staff unpaid leave only", async () => {
        const sent: unknown[] = [];
        renderApp("/company/salaries", rana,
            http.post("/api/employees/:id/hour-excuses", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json({}, { status: 201 }); }),
            ...salaryHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "2" }));
        const drawer = await openDetails("Tarek Salem");
        expect(await within(drawer).findByText("not tracked in Execution")).toBeInTheDocument();
        expect(within(drawer).queryByText(/Hours owed/)).not.toBeInTheDocument();
        await userEvent.click(within(drawer).getByRole("button", { name: "Record unpaid leave…" }));
        expect(within(drawer).queryByRole("tab", { name: "Paid" })).not.toBeInTheDocument();
        await userEvent.click(within(drawer).getByRole("button", { name: "Whole month unpaid" }));
        await waitFor(() => expect(sent).toEqual([{ month: "2026-09", kind: "whole_month", minutes: null, days: [], isPaid: false, note: null }]));
    });
});
