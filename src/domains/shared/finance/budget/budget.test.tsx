import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { budgetHandlers, budgets } from "@/test/fixtures/budget";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const project = projectWork.project;
const path = `/design/projects/${project.id}`;
const sitePath = `/execution/projects/${site.project.id}`;
const rana = personas.superAdmin;
// a Design admin who sees the money but may not change it
const nadia = withPermissions(personas.designAdmin, { grant: [P.FINANCIAL_VIEW] });
// an Execution admin a super admin has handed the money to
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const panel = async () => screen.findByRole("region", { name: "Budget" });

describe("a project's budget", () => {
    it("shows the version in force, each line against its cost with what's over in red, and every version in its history", async () => {
        renderApp(path, rana, ...budgetHandlers, ...projectWorkHandlers);
        const budget = await panel();
        expect(await within(budget).findByText("Version 2")).toBeInTheDocument();
        expect(within(budget).getByText(/set by Rana Saab/)).toBeInTheDocument();
        expect(within(budget).getByText(/The client added a guest house\./)).toBeInTheDocument();

        const architecture = within(budget).getByRole("row", { name: "Architecture" });
        expect(within(architecture).getByText(money.fmt(6000))).toBeInTheDocument();
        expect(within(architecture).getByText(money.fmt(6500))).toHaveClass("down");
        expect(within(architecture).getByText(money.fmt(-500))).toHaveClass("down");
        expect(within(architecture).getByText("Over budget")).toBeInTheDocument();

        const interiors = within(budget).getByRole("row", { name: "Interiors" });
        expect(within(interiors).getByText(money.fmt(3000))).not.toHaveClass("down");
        expect(within(budget).getByRole("row", { name: "Expenses" })).toHaveTextContent(money.fmt(1250));
        expect(within(budget).getByText("Total budget").closest("tr")).toHaveTextContent(money.fmt(12000));

        // cost in no line, and pounds with no rate, are said apart
        expect(within(budget).getByRole("note", { name: "Cost in no line" })).toHaveTextContent(money.fmt(320));
        expect(within(budget).getByRole("note", { name: "Not converted" })).toHaveTextContent("+ 4.5M LBP");

        await userEvent.click(within(budget).getByRole("button", { name: "History" }));
        const dialog = await screen.findByRole("dialog", { name: "Budget history" });
        const versions = within(dialog).getAllByRole("listitem");
        expect(versions.map((v) => v.getAttribute("aria-label"))).toEqual(["Version 2", "Version 1"]);
        expect(versions[1]).toHaveTextContent("Agreed at kick-off.");
        expect(versions[1]).toHaveTextContent("Nadia Karam");
        expect(versions[1]).toHaveTextContent(money.fmt(10000));
    });

    it("says there's no budget yet, with a way to set one for whoever writes the money", async () => {
        renderApp(path, rana, ...projectWorkHandlers);
        const budget = await panel();
        expect(await within(budget).findByText(/No budget yet/)).toBeInTheDocument();
        expect(within(budget).getByRole("button", { name: "Set a budget" })).toBeInTheDocument();
        expect(within(budget).queryByRole("button", { name: "History" })).toBeNull();
    });

    it("says there's no budget yet, and offers nothing, to someone who only sees the money", async () => {
        renderApp(path, nadia, ...projectWorkHandlers);
        const budget = await panel();
        expect(await within(budget).findByText(/No budget yet/)).toBeInTheDocument();
        expect(within(budget).queryByRole("button", { name: "Set a budget" })).toBeNull();
    });

    it("offers no revision to someone who only sees the money", async () => {
        renderApp(path, nadia, ...budgetHandlers, ...projectWorkHandlers);
        const budget = await panel();
        expect(await within(budget).findByText("Version 2")).toBeInTheDocument();
        expect(within(budget).queryByRole("button", { name: "Revise budget" })).toBeNull();
    });

    it("says why it couldn't load, and tries again", async () => {
        let calls = 0;
        renderApp(path, rana,
            http.get("/api/projects/:id/budget", () => {
                calls += 1;
                // a 4xx, which the app doesn't ask again for by itself
                return calls === 1
                    ? HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed." }, { status: 403 })
                    : HttpResponse.json(budgets.design);
            }),
            ...projectWorkHandlers);
        const budget = await panel();
        expect(await within(budget).findByText(/Couldn't load the budget\./)).toBeInTheDocument();
        await userEvent.click(within(budget).getByRole("button", { name: "Try again" }));
        expect(await within(budget).findByText("Version 2")).toBeInTheDocument();
    });
});

describe("setting a budget", () => {
    it("starts from the budget now, sends each department and the expenses, why and from when", async () => {
        const sent: unknown[] = [];
        renderApp(path, rana,
            http.put("/api/projects/:id/budget", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json({ ...budgets.design, current: { ...budgets.design.current!, version: 3 } });
            }),
            ...budgetHandlers, ...projectWorkHandlers);
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Revise budget" }));
        const dialog = await screen.findByRole("dialog", { name: "Revise budget" });
        const interiors = await within(dialog).findByLabelText("Interiors");
        expect(within(dialog).getByLabelText("Architecture")).toHaveValue("6,000");
        expect(interiors).toHaveValue("4,000");
        expect(within(dialog).getByLabelText("Expenses")).toHaveValue("2,000");

        // why is required
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(within(dialog).getByText("Say why the budget is set or changes.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.clear(interiors);
        await userEvent.type(interiors, "5000");
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "More rooms to furnish.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{
            reason: "More rooms to furnish.",
            effectiveFrom: "2026-09-30",
            lines: [
                { teamId: 12, category: null, amount: 6000 },
                { teamId: 13, category: null, amount: 5000 },
                { teamId: null, category: "expenses", amount: 2000 },
            ],
        }]));
        expect(await screen.findByText("Budget revised: version 3")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Revise budget" })).toBeNull());
    });

    it("asks for at least one line, and shows what the API refused beside its line", async () => {
        const sent: unknown[] = [];
        renderApp(path, rana,
            http.put("/api/projects/:id/budget", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json({
                    type: "validation", code: "validation_failed", message: "Some fields are not valid.",
                    errors: { "lines[0].amount": ["The amount is more than a budget line can be."] },
                }, { status: 400 });
            }),
            ...projectWorkHandlers);
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Set a budget" }));
        const dialog = await screen.findByRole("dialog", { name: "Set a budget" });
        const architecture = await within(dialog).findByLabelText("Architecture");
        expect(architecture).toHaveValue("");

        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "Agreed at kick-off.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(within(dialog).getByText("Give at least one line an amount.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        // only the lines given an amount are sent; the refusal of the first shows beside Interiors
        await userEvent.type(within(dialog).getByLabelText("Interiors"), "900000");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("The amount is more than a budget line can be.")).toBeInTheDocument();
        expect(sent).toEqual([{ reason: "Agreed at kick-off.", effectiveFrom: "2026-09-30", lines: [{ teamId: 13, category: null, amount: 900000 }] }]);
        const interiorsField = within(dialog).getByLabelText("Interiors").closest(".field") as HTMLElement;
        expect(within(interiorsField).getByText("The amount is more than a budget line can be.")).toBeInTheDocument();
        expect(screen.getByRole("dialog", { name: "Set a budget" })).toBeInTheDocument();
    });
});

describe("a site's budget", () => {
    it("sits in the site's money overview, by category, and is revised by whoever manages its pricing", async () => {
        const sent: unknown[] = [];
        renderApp(sitePath, karim,
            http.put("/api/projects/:id/budget", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json({ ...budgets.site, current: { ...budgets.site.current!, version: 2 } });
            }),
            ...budgetHandlers, ...siteHandlers);
        const budget = await panel();
        const contractor = await within(budget).findByRole("row", { name: "Contractor" });
        expect(within(contractor).getByText(money.fmt(-600))).toHaveClass("down");
        expect(within(budget).getByRole("row", { name: "Ground labour" })).toHaveTextContent(money.fmt(2500));

        await userEvent.click(within(budget).getByRole("button", { name: "Revise budget" }));
        const dialog = await screen.findByRole("dialog", { name: "Revise budget" });
        for (const label of ["Materials", "Contractor", "Equipment", "Fees", "Other", "Ground labour"]) {
            expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
        }
        // no departments on a site
        expect(within(dialog).queryByLabelText("Architecture")).toBeNull();
        expect(within(dialog).getByLabelText("Equipment")).toHaveValue("");

        await userEvent.type(within(dialog).getByLabelText("Equipment"), "800");
        await userEvent.type(within(dialog).getByLabelText("Why it changes"), "Scaffolding hired.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{
            reason: "Scaffolding hired.",
            effectiveFrom: "2026-09-30",
            lines: [
                { teamId: null, category: "materials", amount: 5000 },
                { teamId: null, category: "contractor", amount: 2000 },
                { teamId: null, category: "equipment", amount: 800 },
                { teamId: null, category: "ground_labour", amount: 2500 },
            ],
        }]));
        expect(await screen.findByText("Budget revised: version 2")).toBeInTheDocument();
    });

    it("offers no revision without the site's pricing", async () => {
        renderApp(sitePath, withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }), ...budgetHandlers, ...siteHandlers);
        const budget = await panel();
        expect(await within(budget).findByRole("row", { name: "Materials" })).toBeInTheDocument();
        expect(within(budget).queryByRole("button", { name: "Revise budget" })).toBeNull();
    });
});
