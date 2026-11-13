import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { permissionsOf } from "@/app/permissions/permissions";
import { resetProton } from "@/domains/shared/proton/protonStore";
import { messageHandlers } from "@/test/fixtures/messages";
import { notificationHandlers, notifications } from "@/test/fixtures/notifications";
import { personas, withPermissions, type PersonaName } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { barTabs, onHome } from "./bottomNavTabs";
import type { ShellArea } from "./useArea";

/** A phone's screen: the width the stylesheet (and useIsPhone) switch to the phone layout at. */
function onAPhone() {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 640px)", addEventListener: () => {}, removeEventListener: () => {},
    }));
}

beforeEach(onAPhone);
afterEach(() => {
    vi.unstubAllGlobals();
    resetProton();
    localStorage.clear();
});

/** Nothing to read, nothing unread: a page that asks for no field's focus, so the bar stays up. */
const quiet = notificationHandlers({ ...notifications.rana, items: [], totalCount: 0 });
const noSearchResults = http.get("/api/search", () => HttpResponse.json({ projects: [], clients: [], people: [] }));

const company: ShellArea = { kind: "company", section: null };
const design: ShellArea = { kind: "domain", domain: "design", section: "notifications" };
const labelsOf = (nav: HTMLElement) => within(nav).getAllByRole("button").map((b) => b.textContent);
const bar = () => screen.findByRole("navigation", { name: "Quick links" });
const noBar = () => screen.queryByRole("navigation", { name: "Quick links" });
/** The number or mark on a tab, if it has one. */
const badgeOn = (nav: HTMLElement, tab: RegExp) => within(nav).getByRole("button", { name: tab }).querySelector(".msg-badge")?.textContent ?? null;

describe("what each kind of person has in the bottom bar", () => {
    const tabs = (name: PersonaName, area: ShellArea = design) => barTabs(permissionsOf(personas[name]), area);
    const labels = (name: PersonaName, area?: ShellArea) => tabs(name, area).map((t) => t.label);

    it("gives super admins Home, Search, Alerts and Chat, with Home leading to the launcher", () => {
        expect(labels("superAdmin", company)).toEqual(["Home", "Search", "Alerts", "Chat"]);
        expect(tabs("superAdmin", company)[0].path).toBe("/company");
    });

    it("gives each other person one more page of their own, and Home where they start", () => {
        expect(labels("designEmployee")).toEqual(["Home", "Search", "My work", "Alerts", "Chat"]);
        expect(tabs("designEmployee")[0].path).toBe("/design/projects");
        expect(labels("executionEmployee", { kind: "domain", domain: "execution", section: null })).toEqual(["Home", "Search", "My sites", "Alerts", "Chat"]);
        expect(tabs("executionEmployee")[0].path).toBe("/execution/daily-log");
        expect(labels("designAdmin")).toEqual(["Home", "Search", "Projects", "Alerts", "Chat"]);
        expect(tabs("designAdmin")[0].path).toBe("/design/overview");
        expect(labels("executionAdmin")).toEqual(["Home", "Search", "Projects", "Alerts", "Chat"]);
        expect(tabs("executionAdmin")[0].path).toBe("/execution/overview");
        expect(labels("websiteAdmin", { kind: "website", section: null })).toEqual(["Home", "Search", "Analytics", "Alerts", "Chat"]);
        expect(tabs("websiteAdmin")[0].path).toBe("/website/projects");
    });

    it("sends Alerts and Chat to the area being read", () => {
        const paths = (area: ShellArea) => tabs("superAdmin", area).filter((t) => t.key === "alerts" || t.key === "chat").map((t) => t.path);
        expect(paths(company)).toEqual(["/company/notifications", "/company/messages"]);
        expect(paths(design)).toEqual(["/design/notifications", "/design/messages"]);
    });

    it("leaves out a page the person can't open, and follows permissions granted or taken away", () => {
        const labelsFor = (user: ReturnType<typeof withPermissions>) => barTabs(permissionsOf(user), design).map((t) => t.label);
        // no hours to log, no My work
        expect(labelsFor(withPermissions(personas.designEmployee, { revoke: [P.WORK_ENTRY_VIEW_OWN] }))).toEqual(["Home", "Search", "Alerts", "Chat"]);
        // an admin without the overview starts on Projects, so it isn't a second tab
        expect(labelsFor(withPermissions(personas.designAdmin, { revoke: [P.REPORT_VIEW] }))).toEqual(["Home", "Search", "Alerts", "Chat"]);
        // an admin who is also given the website reaches several areas: they start on the launcher
        const several = withPermissions(personas.designAdmin, { grant: [P.WEBSITE_VIEW] });
        expect(labelsFor(several)).toEqual(["Home", "Search", "Alerts", "Chat"]);
        expect(barTabs(permissionsOf(several), design)[0].path).toBe("/company");
    });

    it("lights Home on the page it leads to and what opens from it, and on the launcher alone", () => {
        expect(onHome("/design/projects", "/design/projects")).toBe(true);
        expect(onHome("/design/projects", "/design/projects/12")).toBe(true);
        expect(onHome("/design/projects", "/design/projectsx")).toBe(false);
        expect(onHome("/company", "/company")).toBe(true);
        expect(onHome("/company", "/company/overview")).toBe(false);
    });
});

describe("the bottom bar on a phone", () => {
    it("shows super admins Home, Search, Alerts and Chat on the launcher, with Home as the page they are on", async () => {
        renderApp("/company", personas.superAdmin);
        const nav = await bar();
        expect(labelsOf(nav)).toEqual(["Home", "Search", "Alerts", "Chat"]);
        expect(within(nav).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
        expect(within(nav).getByRole("button", { name: "Chat" })).not.toHaveAttribute("aria-current");
        // the launcher's own bell gives way to the Alerts tab
        expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    });

    it.each<[PersonaName, string, string[]]>([
        ["designEmployee", "/design/notifications", ["Home", "Search", "My work", "Alerts", "Chat"]],
        ["executionEmployee", "/execution/notifications", ["Home", "Search", "My sites", "Alerts", "Chat"]],
        ["designAdmin", "/design/notifications", ["Home", "Search", "Projects", "Alerts", "Chat"]],
        ["executionAdmin", "/execution/notifications", ["Home", "Search", "Projects", "Alerts", "Chat"]],
        ["websiteAdmin", "/website/notifications", ["Home", "Search", "Analytics", "Alerts", "Chat"]],
        ["superAdmin", "/company/notifications", ["Home", "Search", "Alerts", "Chat"]],
    ])("shows %s their tabs inside the app, with Alerts as the page they are on", async (name, path, expected) => {
        renderApp(path, personas[name], ...quiet);
        const nav = await bar();
        expect(labelsOf(nav)).toEqual(expected);
        expect(within(nav).getByRole("button", { name: "Alerts" })).toHaveAttribute("aria-current", "page");
    });

    it("leaves room under the page for the bar, and none on a wider screen where there is no bar", async () => {
        renderApp("/design/notifications", personas.designEmployee, ...quiet);
        await bar();
        expect(document.querySelector(".bottom-nav-spacer")).not.toBeNull();
    });

    it("is not drawn on a wider screen", async () => {
        vi.unstubAllGlobals();
        renderApp("/design/notifications", personas.designEmployee, ...quiet);
        await screen.findByRole("button", { name: "Account" });
        expect(noBar()).toBeNull();
        expect(document.querySelector(".bottom-nav-spacer")).toBeNull();
    });

    it("counts unread chats (9+, or @ for a mention) and notifications on their tabs", async () => {
        renderApp("/design/notifications", personas.designEmployee,
            http.get("/api/messages/badge", () => HttpResponse.json({ unread: 14, mention: false })),
            http.get("/api/notifications/unread-count", () => HttpResponse.json({ unread: 3 })),
            ...quiet);
        const nav = await bar();
        await waitFor(() => expect(badgeOn(nav, /^Chat/)).toBe("9+"));
        expect(badgeOn(nav, /^Alerts/)).toBe("3");
        expect(badgeOn(nav, /^Home/)).toBeNull();
        expect(within(nav).getByRole("button", { name: /^Chat/ })).toHaveTextContent("9+ unread");
    });

    it("shows a small count as it is, @ on Chat when someone mentioned the person, and nothing when all is read", async () => {
        renderApp("/design/notifications", personas.designAdmin,
            http.get("/api/messages/badge", () => HttpResponse.json({ unread: 2, mention: true })),
            ...quiet);
        const nav = await bar();
        await waitFor(() => expect(badgeOn(nav, /^Chat/)).toBe("@"));
        expect(badgeOn(nav, /^Alerts/)).toBeNull();
    });

    it("opens the search from Search, and the pages from the other tabs", async () => {
        const user = userEvent.setup();
        renderApp("/design/notifications", personas.designAdmin, noSearchResults, ...messageHandlers, ...quiet);
        const nav = await bar();
        await user.click(within(nav).getByRole("button", { name: "Search" }));
        expect(await screen.findByRole("dialog", { name: "Search" })).toBeInTheDocument();
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull());

        await user.click(within(await bar()).getByRole("button", { name: "Chat" }));
        await waitFor(() => expect(window.location.pathname).toBe("/design/messages"));
        // the address changes a moment before the page does
        await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Quick links" })).getByRole("button", { name: "Chat" })).toHaveAttribute("aria-current", "page"));
    });

    it("opens the search from the launcher too", async () => {
        const user = userEvent.setup();
        renderApp("/company", personas.superAdmin, noSearchResults);
        await user.click(within(await bar()).getByRole("button", { name: "Search" }));
        expect(await screen.findByRole("dialog", { name: "Search" })).toBeInTheDocument();
    });

    it("steps aside while a text field has the keyboard, and comes back after", async () => {
        const user = userEvent.setup();
        renderApp("/design/messages", personas.superAdmin, ...messageHandlers);
        const field = await screen.findByRole("textbox", { name: "Find people or groups" });
        await bar();

        await user.click(field);
        await waitFor(() => expect(noBar()).toBeNull());
        expect(document.querySelector(".bottom-nav-spacer")).toBeNull();

        await user.click(document.body);
        expect(await bar()).toBeInTheDocument();
    });

    it("steps aside inside an open chat in Messages, and comes back on the list", async () => {
        const user = userEvent.setup();
        renderApp("/design/messages", personas.superAdmin, ...messageHandlers);
        const row = await screen.findByText("Interiors", { selector: ".msg-sidebar .trunc" });
        // the chats are listed with the bar under them
        expect(await bar()).toBeInTheDocument();

        await user.click(row);
        await waitFor(() => expect(noBar()).toBeNull());

        await user.click(screen.getByRole("button", { name: "Back to chats" }));
        expect(await bar()).toBeInTheDocument();
    });

    it("steps aside on Proton's own page, which has its own box at the foot", async () => {
        const usage = { month: "2026-10-01", available: true, questionsAllowed: 300, questionsUsed: 3, questionsRemaining: 297, usedPct: 1, companyLimitReached: false, voiceAvailable: false, voiceMaxMinutes: 0 };
        renderApp("/design/assistant", personas.designAdmin,
            http.get("/api/proton/usage", () => HttpResponse.json(usage)),
            http.get("/api/proton/briefing", () => HttpResponse.json({ items: [], more: 0 })),
            http.get("/api/proton/actions", () => HttpResponse.json([])),
            http.get("/api/proton/conversations", () => HttpResponse.json({ items: [], page: 1, pageSize: 50, totalCount: 0 })));
        await screen.findByRole("textbox", { name: "Ask Proton" });
        await waitFor(() => expect(noBar()).toBeNull());
    });
});
