import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { companyPay, companyPayHandlers } from "@/test/fixtures/companyPay";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const panelOf = (title: string) => screen.getByText(title, { selector: ".pp-title" }).closest(".panel") as HTMLElement;
const rowOf = (panel: HTMLElement, name: string) => within(panel).getByText(name).closest("tr") as HTMLElement;

function recording() {
    const asked: URLSearchParams[] = [];
    const handler = http.get("/api/company/project-pay", ({ request }) => {
        const q = new URL(request.url).searchParams;
        asked.push(q);
        return HttpResponse.json(q.get("unit") === "month" ? companyPay.month : companyPay.week);
    });
    return { asked, handler, last: () => asked.at(-1)! };
}

describe("Project pay", () => {
    it("shows this week's time on each Design project, by department, with its pay", async () => {
        renderApp("/company/project-pay", rana, ...companyPayHandlers);
        expect(await screen.findByText("Week of Sep 28 – Oct 4, 2026")).toBeInTheDocument();
        expect(screen.getByText("In progress · to Sep 30")).toBeInTheDocument();
        const kpi = (label: string) => screen.getByText(label, { selector: ".kpi-label" }).closest(".kpi") as HTMLElement;
        await waitFor(() => expect(kpi("Projects with work")).toHaveTextContent("of 6 Design projects"));
        expect(kpi("Pay")).toHaveTextContent(money.exact(companyPay.week.totals[0].total));

        const villa = panelOf("Villa Mounir interiors");
        expect(within(villa).getByText("Mounir Aoun · 3 people · 13 entries")).toBeInTheDocument();
        expect(within(villa).getAllByRole("row").map((r) => r.classList.contains("pp-dept") ? r.textContent : null).filter(Boolean))
            .toEqual(["Interiors", "Visualisation"]);
        expect(within(rowOf(villa, "Sarah Haddad")).getByText(`salary ${money.exact(1800)}/mo`)).toBeInTheDocument();
        expect(within(rowOf(villa, "Lina Saad")).getByText("hourly")).toBeInTheDocument();
        expect(within(villa).getByText("Pay", { selector: ".pp-chip span" }).parentElement).toHaveTextContent(money.exact(280.2));
    });

    it("moves by week, month or quarter, never past the one in progress", async () => {
        const { asked, handler, last } = recording();
        renderApp("/company/project-pay", rana, handler, ...companyPayHandlers);
        await screen.findByText("Villa Mounir interiors");
        expect(asked[0].get("unit")).toBe("week");
        expect(asked[0].get("date")).toBe("2026-09-28");
        expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();

        await userEvent.click(screen.getByRole("tab", { name: "Month" }));
        expect(await screen.findByText("September 2026")).toBeInTheDocument();
        expect(screen.getByText("Sep 1 – Sep 30, 2026")).toBeInTheDocument();
        await waitFor(() => expect(`${last().get("unit")} ${last().get("date")}`).toBe("month 2026-09-01"));

        await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
        expect(await screen.findByText("August 2026")).toBeInTheDocument();
        await waitFor(() => expect(last().get("date")).toBe("2026-08-01"));
        expect(screen.queryByText(/In progress/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "This month" }));
        expect(await screen.findByText("September 2026")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "Quarter" }));
        expect(await screen.findByText("Q3 2026")).toBeInTheDocument();
        expect(screen.getByText("Jul 1 – Sep 30, 2026")).toBeInTheDocument();
        await waitFor(() => expect(`${last().get("unit")} ${last().get("date")}`).toBe("quarter 2026-07-01"));
    });

    it("narrows to one project", async () => {
        const { handler, last } = recording();
        renderApp("/company/project-pay", rana, handler, ...companyPayHandlers);
        await screen.findByText("Villa Mounir interiors", { selector: ".pp-title" });
        await userEvent.click(screen.getByLabelText("Project"));
        await userEvent.click(await screen.findByRole("option", { name: "Cedar Bank branch refresh" }));
        await waitFor(() => expect(last().get("projectId")).toBe("3"));
    });

    it("exports the period as shown", async () => {
        const asked: URLSearchParams[] = [];
        URL.createObjectURL = vi.fn(() => "blob:pay");
        URL.revokeObjectURL = vi.fn();
        renderApp("/company/project-pay", rana,
            http.get("/api/company/project-pay/export", ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return new HttpResponse("Period,Project\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="project-pay-week-2026-09-28.csv"' } });
            }),
            ...companyPayHandlers);
        await screen.findByText("Villa Mounir interiors");
        await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
        expect(await screen.findByText("project-pay-week-2026-09-28.csv")).toBeInTheDocument();
        expect(`${asked[0].get("unit")} ${asked[0].get("date")}`).toBe("week 2026-09-28");
    });

    it("opens a project in Design only for someone who may", async () => {
        renderApp("/company/project-pay", rana, ...companyPayHandlers);
        expect(await screen.findByRole("button", { name: "Villa Mounir interiors" })).toHaveAttribute("title", "Open Villa Mounir interiors in Design");
    });

    it("keeps project titles plain for someone outside Design", async () => {
        renderApp("/company/project-pay", withPermissions(personas.executionAdmin, { grant: [P.SALARY_VIEW] }), ...companyPayHandlers);
        expect(await screen.findByText("Villa Mounir interiors", { selector: ".pp-title" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Villa Mounir interiors" })).not.toBeInTheDocument();
    });

    it("is out of reach without salary:view", async () => {
        const { asked, handler } = recording();
        renderApp("/company/project-pay", personas.designAdmin, handler, ...companyPayHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(asked).toEqual([]);
    });
});
