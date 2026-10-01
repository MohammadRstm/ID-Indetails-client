import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { company, companyHandlers } from "@/test/fixtures/company";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const o = company.overview;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("the Company overview", () => {
    it("shows each business's profit and what the company keeps after its expenses", async () => {
        renderApp("/company/overview", rana, ...companyHandlers);
        const keeps = (await screen.findByText("What the company keeps")).closest(".panel") as HTMLElement;
        expect(await within(keeps).findByText("Design profit")).toBeInTheDocument();
        expect(within(keeps).getByText("Execution profit")).toBeInTheDocument();
        expect(within(keeps).getByText("Company net profit").closest(".co-line")).toHaveTextContent(money.fmt(o.netProfit));
        const across = screen.getByText("Across both").closest(".panel") as HTMLElement;
        expect(within(across).getByText("Clients served").closest(".cost-row")).toHaveTextContent(String(o.clientsServed));
        expect(screen.getAllByRole("button", { name: "Manage" })).toHaveLength(2);
    });

    it("measures the window picked", async () => {
        const asked: string[] = [];
        renderApp("/company/overview", rana,
            http.get("/api/company/overview", ({ request }) => { const q = new URL(request.url).searchParams; asked.push(`${q.get("from")}..${q.get("to")}`); return HttpResponse.json(o); }),
            ...companyHandlers);
        await screen.findByText("Design profit");
        expect(asked[0]).toBe("2026-09-01..2026-09-30");
        await userEvent.click(screen.getByRole("tab", { name: "This quarter" }));
        await waitFor(() => expect(asked.at(-1)).toBe("2026-07-01..2026-09-30"));
        expect(screen.getAllByText("Q3 2026 to date").length).toBeGreaterThan(0);
        await userEvent.click(screen.getByLabelText("Year"));
        await userEvent.click(screen.getByRole("option", { name: "2025" }));
        await waitFor(() => expect(asked.at(-1)).toBe("2025-01-01..2025-12-31"));
    });

    it("is out of reach without company:view", async () => {
        const asked: string[] = [];
        renderApp("/company/overview", personas.designAdmin,
            http.get("/api/company/overview", () => { asked.push("overview"); return HttpResponse.json(o); }),
            ...companyHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(screen.queryByText("What the company keeps")).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });
});

describe("Company expenses", () => {
    it("list every recurring line with this month's totals by group", async () => {
        renderApp("/company/overhead", rana, ...companyHandlers);
        await waitFor(() => {
            const perMonth = screen.getByText("Company expenses per month", { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
            expect(perMonth).toHaveTextContent(money.fmt(2310));
            expect(perMonth).toHaveTextContent("2 recurring lines");
        });
        const table = screen.getByText("Recurring monthly expenses").closest(".panel") as HTMLElement;
        const rows = within(table).getAllByRole("row").slice(1).map((r) => r.querySelector("b")?.textContent);
        expect(rows).toEqual(["Office rent", "AWS", "Figma"]);
        expect(within(table).getByText("Cancelled Sep 30")).toBeInTheDocument();
    });

    it("are added, with their category and currency", async () => {
        const added: unknown[] = [];
        renderApp("/company/overhead", rana,
            http.post("/api/company/overhead", async ({ request }) => { added.push(await request.json()); return HttpResponse.json(company.overhead.lines[0], { status: 201 }); }),
            ...companyHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Add expense" }))[0]);
        const dialog = await screen.findByRole("dialog", { name: "Add recurring expense" });
        await userEvent.type(within(dialog).getByLabelText("Name"), "Office cleaning");
        await userEvent.type(within(dialog).getByLabelText("Monthly cost"), "87.5");
        // the category has to be chosen
        await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
        expect(within(dialog).getByText("Choose the category.")).toBeInTheDocument();
        expect(added).toEqual([]);
        await userEvent.click(within(dialog).getByLabelText("Group"));
        await userEvent.click(screen.getByRole("option", { name: "Rent & utilities" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
        await waitFor(() => expect(added).toEqual([{ name: "Office cleaning", amount: 87.5, currency: "USD", groupId: 3 }]));
    });

    it("show this month's biggest categories, and let a super admin manage the categories", async () => {
        const calls: string[] = [];
        renderApp("/company/overhead", rana,
            http.post("/api/company/overhead/groups", async ({ request }) => {
                const { name } = await request.json() as { name: string };
                calls.push(`add ${name}`);
                return HttpResponse.json({ id: 15, name, lines: 0 }, { status: 201 });
            }),
            http.put("/api/company/overhead/groups/:id", async ({ params, request }) => {
                const { name } = await request.json() as { name: string };
                calls.push(`rename ${params.id} ${name}`);
                return HttpResponse.json({ id: Number(params.id), name, lines: 0 });
            }),
            http.delete("/api/company/overhead/groups/:id", ({ params }) => { calls.push(`remove ${params.id}`); return new HttpResponse(null, { status: 204 }); }),
            ...companyHandlers);
        // the two biggest categories this month have a tile each
        const strip = (await screen.findByText("Operating costs", { selector: ".kpi-label" })).closest(".kpis") as HTMLElement;
        expect(within(strip).getByText("Software & services", { selector: ".kpi-label" })).toBeInTheDocument();
        expect(within(screen.getByText("Recurring monthly expenses").closest(".panel") as HTMLElement).getAllByText("Software & services")).toHaveLength(2);

        await userEvent.click(screen.getByRole("button", { name: "Categories" }));
        const dialog = await screen.findByRole("dialog", { name: "Expense categories" });
        expect(await within(dialog).findByText("Other")).toBeInTheDocument();
        // one in use stays; an unused one goes
        expect(within(dialog).getByRole("button", { name: "Remove Software & services" })).toBeDisabled();
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove Insurance" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Rename Bank fees" }));
        const rename = within(dialog).getByLabelText("New name for Bank fees");
        await userEvent.clear(rename);
        await userEvent.type(rename, "Bank charges{Enter}");
        await userEvent.type(within(dialog).getByLabelText("New category"), "Cleaning");
        await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
        await waitFor(() => expect(calls).toEqual(["remove 7", "rename 11 Bank charges", "add Cleaning"]));
    });

    it("keep managing the categories to super admins", async () => {
        renderApp("/company/overhead", withPermissions(personas.designAdmin, { grant: [P.OVERHEAD_MANAGE, P.COMPANY_VIEW] }), ...companyHandlers);
        expect(await screen.findByText("Recurring monthly expenses")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Categories" })).not.toBeInTheDocument();
    });

    it("change their amount from a month, and their name on its own", async () => {
        const amounts: unknown[] = [];
        const details: unknown[] = [];
        renderApp("/company/overhead", rana,
            http.post("/api/company/overhead/:id/amounts", async ({ request }) => { amounts.push(await request.json()); return HttpResponse.json(company.overhead.lines[0]); }),
            http.put("/api/company/overhead/:id", async ({ request }) => { details.push(await request.json()); return HttpResponse.json(company.overhead.lines[0]); }),
            ...companyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "AWS actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit recurring expense" });
        const cost = within(dialog).getByLabelText("Monthly cost");
        await userEvent.clear(cost);
        await userEvent.type(cost, "460");
        expect(within(dialog).getByLabelText("Applies from")).toHaveTextContent("September 2026");
        await userEvent.click(within(dialog).getByLabelText("Applies from"));
        await userEvent.click(screen.getByRole("option", { name: "October 2026" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(amounts).toEqual([{ amount: 460, fromMonth: "2026-10-01" }]));
        expect(details).toEqual([]);
    });

    it("are cancelled, and a cancelled one taken back until its month ends", async () => {
        const calls: string[] = [];
        renderApp("/company/overhead", rana,
            http.post("/api/company/overhead/:id/:action", ({ params }) => { calls.push(`${params.id}:${params.action}`); return new HttpResponse(null, { status: 204 }); }),
            ...companyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "AWS actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
        await userEvent.click(screen.getByRole("button", { name: "Figma actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Reactivate" }));
        await waitFor(() => expect(calls).toEqual(["1:cancel", "3:resume"]));
    });

    it("can't be reactivated once another line carries them on, as after a change of currency", async () => {
        const moved = {
            ...company.overhead,
            lines: [...company.overhead.lines, { ...company.overhead.lines[2], id: 4, currency: "LBP", isCancelled: false, endedOn: null, startedOn: "2026-10-01" }],
        };
        renderApp("/company/overhead", rana, http.get("/api/company/overhead", () => HttpResponse.json(moved)), ...companyHandlers);
        const menus = await screen.findAllByRole("button", { name: "Figma actions" });
        expect(menus).toHaveLength(2);
        for (const menu of menus) {
            await userEvent.click(menu);
            expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
            await userEvent.keyboard("{Escape}");
        }
    });

    it("say so when cancelling removed a line that hadn't started", async () => {
        renderApp("/company/overhead", rana,
            http.post("/api/company/overhead/:id/cancel", () => new HttpResponse(null, { status: 204 })),
            ...companyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "AWS actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));
        expect(await screen.findByText("AWS removed")).toBeInTheDocument();
        expect(screen.getByText("It hadn't started yet, so it was never charged.")).toBeInTheDocument();
    });

    it("chart what they do to each month a year at a time, this year first", async () => {
        const years: string[] = [];
        renderApp("/company/overhead", rana,
            http.get("/api/company/overview/monthly", ({ request }) => {
                const year = new URL(request.url).searchParams.get("year");
                if (year) years.push(year);
                return HttpResponse.json(company.months.filter((m) => !year || m.month.startsWith(year)));
            }),
            ...companyHandlers);
        expect(await screen.findByText("What company expenses do to each month · 2026")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Previous year" }));
        expect(await screen.findByText("What company expenses do to each month · 2025")).toBeInTheDocument();
        await waitFor(() => expect(years).toEqual(["2026", "2025"]));
        // the table lists that year's months only
        await userEvent.click(within(screen.getByText(/· 2025$/).closest(".panel") as HTMLElement).getByRole("button", { name: "Table" }));
        expect(await screen.findByText("September 2025")).toBeInTheDocument();
        expect(screen.queryByText("January 2026")).toBeNull();
    });

    it("show overhead:manage alone the expenses by month, without the company's profit", async () => {
        let askedCompany = false;
        renderApp("/company/overhead", withPermissions(rana, { revoke: [P.COMPANY_VIEW] }),
            http.get("/api/company/overview/monthly", () => { askedCompany = true; return HttpResponse.json(company.months); }),
            http.get("/api/company/overhead/monthly", () => HttpResponse.json(company.months.map((m) => ({ month: m.month, totals: [{ currency: "USD", total: 2310 }] })))),
            ...companyHandlers);
        const strip = (await screen.findByText("Last 13 months", { selector: ".kpi-label" })).closest(".kpis") as HTMLElement;
        // 13 months at $2,310
        expect(await within(strip).findByText(money.short(2310 * company.months.length))).toBeInTheDocument();
        expect(screen.queryByText("What company expenses do to each month")).toBeNull();
        expect(screen.queryByText("Share of this month's cost")).toBeNull();
        expect(askedCompany).toBe(false);
    });

    it("are read-only without overhead:manage", async () => {
        renderApp("/company/overhead", withPermissions(rana, { revoke: [P.OVERHEAD_MANAGE] }), ...companyHandlers);
        expect(await screen.findByText("Office rent")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "AWS actions" })).not.toBeInTheDocument();
    });
});
