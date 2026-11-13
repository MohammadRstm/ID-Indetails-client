import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectHandlers } from "@/test/fixtures";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { setTheme } from "@/shared/theme";

/** A phone's screen: the width the stylesheet (and useIsPhone) switch to the phone layout at. */
function onAPhone() {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 640px)", addEventListener: () => {}, removeEventListener: () => {},
    }));
}

afterEach(() => {
    vi.unstubAllGlobals();
    setTheme("light");
    localStorage.clear();
});

/** The header the page opens with (the page's own heading shares its words, so they are looked for inside it). */
async function header() {
    await screen.findByRole("button", { name: "Account" });
    return document.querySelector("header.top") as HTMLElement;
}
/** Each button's name: its label, or its words. */
const buttonsIn = (top: HTMLElement) => within(top).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
/** The account menu's rows, top to bottom. */
const menuRows = () => within(document.querySelector(".pop") as HTMLElement).getAllByRole("button").map((b) => b.textContent ?? "");

describe("the header on a phone", () => {
    beforeEach(onAPhone);

    it("has the menu, the page's name and the account, with no search, messages, bell, help, theme or New project", async () => {
        renderApp("/design/projects", personas.designAdmin, ...projectHandlers);
        const top = await header();
        expect(buttonsIn(top)).toEqual(["Menu", "Account"]);
        expect(within(top).getByText("Projects")).toHaveClass("top-title");
        for (const gone of ["Messages", "Notifications", "Help", "New project", "Switch to dark mode"]) {
            expect(within(top).queryByRole("button", { name: gone })).toBeNull();
        }
        expect(document.querySelector(".top-search")).toBeNull();
    });

    it("names the page by the sidebar item being read, and by the area where there is none", async () => {
        renderApp("/design/help", personas.designAdmin);
        expect(within(await header()).getByText("Design")).toHaveClass("top-title");
    });

    it("names the company area too", async () => {
        renderApp("/company/help", personas.superAdmin);
        expect(within(await header()).getByText("Company")).toHaveClass("top-title");
    });

    it("names the website area too", async () => {
        renderApp("/website/help", personas.websiteAdmin);
        expect(within(await header()).getByText("Website")).toHaveClass("top-title");
    });

    it("keeps the Design timer between the name and the account for whoever logs work", async () => {
        renderApp("/design/help", personas.designEmployee);
        const top = await header();
        expect(await within(top).findByRole("button", { name: "Start timer" })).toBeInTheDocument();
        expect(buttonsIn(top)).toEqual(["Menu", "Start timer", "Account"]);
    });

    it("moves the theme into the account menu, which starts with My profile, and leaves out Notifications", async () => {
        const user = userEvent.setup();
        renderApp("/design/help", personas.designEmployee);
        await user.click(within(await header()).getByRole("button", { name: "Account" }));
        const rows = menuRows();
        expect(rows.slice(0, 4)).toEqual(["My profile", "Help", "Dark mode", "Contact the developer"]);
        expect(rows.at(-1)).toBe("Sign out");
        // the bell is in the bottom bar, so the menu doesn't repeat it
        expect(rows.some((text) => text.startsWith("Notifications"))).toBe(false);

        await user.click(screen.getByRole("button", { name: "Dark mode" }));
        expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    });
});

describe("the header on a wider screen", () => {
    it("is unchanged: the search, help, theme, messages and the bell stay", async () => {
        renderApp("/design/projects", personas.designAdmin, ...projectHandlers);
        const top = await header();
        expect(document.querySelector(".top-search")).not.toBeNull();
        for (const name of ["Help", "Messages", "Notifications", "New project", "Switch to dark mode"]) {
            expect(within(top).getByRole("button", { name })).toBeInTheDocument();
        }
        expect(document.querySelector(".top-title")).toBeNull();
        expect(screen.queryByRole("navigation", { name: "Quick links" })).toBeNull();
    });

    it("puts My profile first in the account menu", async () => {
        const user = userEvent.setup();
        renderApp("/design/projects", personas.designAdmin, ...projectHandlers);
        await user.click(within(await header()).getByRole("button", { name: "Account" }));
        const rows = menuRows();
        expect(rows[0]).toBe("My profile");
        expect(rows[1]).toMatch(/^Notifications/);
        expect(rows[2]).toBe("Help");
    });
});
