import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { companyHandlers } from "@/test/fixtures/company";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

async function openPalette(waitForResults = true) {
    await screen.findByRole("button", { name: "Account" });
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search" });
    // Wait for the search results, not just the actions.
    if (waitForResults) await within(dialog).findByText(fixtures.search.projects[0].title);
    return dialog;
}

const options = (dialog: HTMLElement) => within(dialog).getAllByRole("option").map((o) => o.textContent);

describe("the search palette", () => {
    it("finds projects, clients and people for admins, with their actions", async () => {
        renderApp("/design/projects", personas.designAdmin, ...projectHandlers);
        const dialog = await openPalette();
        const found = options(dialog);
        expect(found.some((t) => t?.includes("Client"))).toBe(true);
        expect(found.some((t) => t?.includes("Employee"))).toBe(true);
    });

    it("never lists what an employee can't open, even when the API sends it", async () => {
        renderApp("/design/projects", personas.designEmployee, ...projectHandlers);
        const dialog = await openPalette();
        const found = options(dialog);
        expect(found.some((t) => t?.includes(fixtures.search.clients[0].displayName))).toBe(false);
        expect(found.some((t) => t?.includes(fixtures.search.people[0].name))).toBe(false);
        expect(within(dialog).getByText("My work")).toBeInTheDocument();
        expect(within(dialog).getByText("Log work")).toBeInTheDocument();
        expect(within(dialog).queryByText("Open financials")).toBeNull();
    });

    it("offers only the actions the person's permissions allow", async () => {
        // No matches from the API, so every action fits in the list.
        renderApp("/design/projects", withPermissions(personas.designAdmin, { revoke: [P.FINANCIAL_VIEW, P.PROJECT_CREATE] }),
            http.get("/api/search", () => HttpResponse.json({ projects: [], clients: [], people: [] })),
            ...projectHandlers);
        const dialog = await openPalette(false);
        await userEvent.type(within(dialog).getByRole("textbox", { name: "Search" }), "open");
        await waitFor(() => expect(within(dialog).getByText("Open clients")).toBeInTheDocument());
        expect(within(dialog).queryByText("Open financials")).toBeNull();
        expect(within(dialog).queryByText("New project")).toBeNull();
    });

    it("opens what is picked", async () => {
        renderApp("/design/projects", personas.designAdmin, ...projectHandlers);
        const dialog = await openPalette();
        const target = fixtures.search.projects[0];
        await userEvent.click(within(dialog).getByText(target.title));
        await waitFor(() => expect(window.location.pathname).toBe(`/design/projects/${target.id}`));
        expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    });

    it("finds a page by another name for it, ahead of the API's matches", async () => {
        renderApp("/company/overview", personas.superAdmin,
            http.get("/api/search", () => HttpResponse.json(fixtures.search)),
            ...companyHandlers);
        const dialog = await openPalette(false);
        await userEvent.type(within(dialog).getByRole("textbox", { name: "Search" }), "payroll");
        await waitFor(() => expect(within(dialog).getAllByRole("option")[0]).toHaveTextContent("Open salaries"));
        await userEvent.keyboard("{Enter}");
        await waitFor(() => expect(window.location.pathname).toBe("/company/salaries"));
    });

    it("takes a business's admin to the teams in their Settings", async () => {
        renderApp("/design/projects", personas.designAdmin,
            http.get("/api/search", () => HttpResponse.json({ projects: [], clients: [], people: [] })),
            ...projectHandlers);
        const dialog = await openPalette(false);
        await userEvent.type(within(dialog).getByRole("textbox", { name: "Search" }), "departments");
        await userEvent.click(await within(dialog).findByText("Open teams"));
        await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe("/design/settings?section=teams"));
    });

    it("moves with the arrow keys and closes with escape", async () => {
        renderApp("/design/projects", personas.designAdmin, ...projectHandlers);
        const dialog = await openPalette();
        expect(within(dialog).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
        await userEvent.keyboard("{ArrowDown}");
        expect(within(dialog).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    });
});
