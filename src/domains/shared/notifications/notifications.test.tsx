import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe as group, expect, it, vi } from "vitest";
import { notificationHandlers, notifications, note } from "@/test/fixtures/notifications";
import { salaryHandlers } from "@/test/fixtures/salaries";
import { live } from "@/test/liveHub";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { describe, type Reader } from "./notificationWords";

const rana = personas.superAdmin;
const admin: Reader = { userId: 2, isAdmin: true, logsWork: false, domain: "design" };
const designer: Reader = { userId: 4, isAdmin: false, logsWork: true, domain: "design" };
const byKind = (kind: string) => notifications.rana.items.find((n) => n.kind === kind)!;
const project = { id: 5, title: "Studio Nour brand space", domain: "design", icon: null, tint: null };
const nadia = { id: 2, name: "Nadia Karam", photoFileId: null };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

group("A notification's words", () => {
    it("say what happened and link to it, from what the API keeps", () => {
        expect(describe(byKind("labour_week_submitted"), admin)).toMatchObject({ text: "Karim Jaber updated a labour report for Achrafieh Towers lobby", sub: "Week of Sep 21", route: "/execution/projects/7" });
        expect(describe(byKind("hours_short"), admin)).toMatchObject({ text: "7 employees finished August 2026 short of their hours", sub: "Elie 147h · Lina 147h · Maya 147h", route: "/company/salaries?month=2026-08" });
        expect(describe(byKind("invoice_overdue"), admin)).toMatchObject({ text: "ID-2026-003 is 10 days overdue", sub: "Villa Mounir interiors", route: "/design/projects/2?invoice=3" });
        expect(describe(note("work_digest", { minutes: 150, latestName: "Sarah Haddad", projectTitle: "Villa Mounir interiors" }, { count: 3 }), admin))
            .toMatchObject({ text: "Today's work: 3 entries logged · 2h 30m", sub: "Latest: Sarah Haddad on Villa Mounir interiors", route: "/design/activity" });
    });

    it("tell whoever sees the money when a project nears zero profit, and open a stopped change to decide it", () => {
        const stopped = note("change_blocked", { projectTitle: project.title, kind: "expense" }, { actor: nadia, project, subjectType: "blocked_change", subjectId: 9 });
        expect(describe(stopped, admin)).toMatchObject({
            text: "A change on Studio Nour brand space was stopped at zero profit", sub: "An expense by Nadia Karam · force it or dismiss it", route: "/design/projects/5?blocked=9",
        });
        expect(describe(note("profit_low", { projectTitle: project.title, marginPct: 8 }, { project }), admin))
            .toMatchObject({ text: "Studio Nour brand space is close to zero profit", sub: "8% margin left", route: "/design/projects/5" });
        expect(describe(note("profit_at_zero", { projectTitle: project.title, marginPct: -3 }, { project }), admin).text).toBe("Studio Nour brand space is at zero profit or below");
    });

    it("speak to the reader: requirements open the project's tab, and those who log work hear about logging", () => {
        const assigned = note("requirement_assigned", { text: "Mood board", deadline: "2026-10-02", projectTitle: project.title }, { actor: nadia, project });
        expect(describe(assigned, designer)).toMatchObject({ text: "Nadia Karam assigned you a requirement on Studio Nour brand space", sub: "Mood board · due Oct 2", route: "/design/projects/5?tab=requirements" });
        expect(describe(assigned, admin).route).toBe("/design/projects/5?tab=requirements");

        const completed = note("project_status_changed", { projectTitle: project.title, change: "complete" }, { actor: nadia, project });
        expect(describe(completed, designer).sub).toBe("It has been removed from your active projects - your logged work is still in My Work");
        expect(describe(completed, admin).sub).toBe("By Nadia Karam");
        expect(describe(completed, { ...designer, logsWork: false }).sub).toBe("By Nadia Karam");
    });

    it("tell people about their own account", () => {
        expect(describe(note("role_changed", { from: "employee", to: "admin", domain: "design", automatic: true }, { actor: nadia }), designer))
            .toMatchObject({ text: "You're now an admin", sub: "After a change to your permissions", route: "/design/profile" });
        expect(describe(note("hours_excused", { month: "2026-09", kind: 1, minutes: null, days: ["2026-09-03", "2026-09-04"], isPaid: false }, { actor: nadia }), designer))
            .toMatchObject({ text: "2 unpaid days off in September 2026", route: "/design/pay" });
        expect(describe(note("hours_excused", { month: "2026-08", kind: 2, minutes: null, days: [], isPaid: true }), designer).text).toBe("August 2026 excused as a whole");
        expect(describe(note("pay_changed", { effectiveFrom: "2026-10-01" }, { actor: nadia }), designer).text).toBe("Your pay changes from Oct 1");
        expect(describe(note("something_new", {}), designer).text).toBe("Something new");
    });

    it("tell staff what a client wrote in a project's portal, and open its discussion", () => {
        const discussion = "/design/projects/5?tab=portal&part=discussion";
        const payload = { projectTitle: project.title, authorName: "Rania Aoun" };

        expect(describe(note("portal_client_message", payload, { project }), designer))
            .toMatchObject({ text: "Rania Aoun sent a message in Studio Nour brand space's client portal", icon: "chat", route: discussion });
        expect(describe(note("portal_client_message", payload, { project, count: 4 }), designer))
            .toMatchObject({ text: "4 new client messages in Studio Nour brand space", route: discussion });

        expect(describe(note("portal_client_comment", { ...payload, itemTitle: "Mood board" }, { project, subjectType: "item", subjectId: 21 }), designer))
            .toMatchObject({ text: "Rania Aoun commented on Mood board in Studio Nour brand space", icon: "chat", route: `${discussion}&item=21` });
        expect(describe(note("portal_client_comment", { ...payload, itemTitle: "Mood board" }, { project, subjectType: "item", subjectId: 21, count: 3 }), designer).text)
            .toBe("3 new client comments on Mood board in Studio Nour brand space");

        expect(describe(note("portal_mention", payload, { project, subjectType: "comment", subjectId: 21 }), designer))
            .toMatchObject({ text: "Rania Aoun mentioned you in Studio Nour brand space's client portal", icon: "chat", route: `${discussion}&item=21` });
        expect(describe(note("portal_mention", payload, { project, subjectType: "message", subjectId: 77 }), designer).route).toBe(discussion);
    });

    it("tell staff someone commented on a project's file, never what they wrote, and open its comments", () => {
        const payload = { projectTitle: project.title, fileTitle: "Mood board", authorName: "Nadia Karam" };
        const commented = note("project_file_comment", payload, { project, subjectType: "item", subjectId: 21 });

        expect(describe(commented, designer))
            .toMatchObject({ text: "Nadia Karam commented on Mood board in Studio Nour brand space", icon: "chat", route: "/design/projects/5?tab=files&comments=21" });
        expect(describe(commented, admin).route).toBe("/design/projects/5?tab=files&comments=21");
        expect(describe(commented, designer).sub).toBeUndefined();
        expect(describe(note("project_file_comment", payload, { project, subjectType: "item", subjectId: 21, count: 3 }), designer).text)
            .toBe("3 new comments on Mood board in Studio Nour brand space");
    });
});

group("The bell", () => {
    it("shows the newest, and marks them all read", async () => {
        const posted: string[] = [];
        renderApp("/design/overview", rana, ...notificationHandlers(),
            http.post("/api/notifications/read-all", () => { posted.push("all"); return HttpResponse.json({ unread: 0 }); }));
        const bell = await screen.findByRole("button", { name: "Notifications" });
        await waitFor(() => expect(bell.querySelector(".pip")).not.toBeNull());
        await userEvent.click(bell);
        expect(await screen.findByText("Karim Jaber added 1 material to Mar Mikhael loft renovation")).toBeInTheDocument();
        expect(screen.getByText(/· 30 unread/)).toBeInTheDocument();
        // the panel's two ways on stand out, in the primary colour
        expect(screen.getByRole("button", { name: "Mark all read" })).toHaveClass("btn", "btn-primary", "btn-sm");
        expect(screen.getByRole("button", { name: "See all notifications" })).toHaveClass("btn", "btn-primary", "btn-sm");
        await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));
        await waitFor(() => expect(posted).toEqual(["all"]));
        await waitFor(() => expect(bell.querySelector(".pip")).toBeNull());
    });

    it("marks one read and opens what it is about", async () => {
        const read: string[] = [];
        renderApp("/design/overview", rana, ...notificationHandlers(), ...salaryHandlers,
            http.post("/api/notifications/:id/read", ({ params }) => { read.push(String(params.id)); return HttpResponse.json({ unread: 29 }); }));
        await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
        await userEvent.click(await screen.findByText("7 employees finished August 2026 short of their hours"));
        await waitFor(() => expect(read).toEqual([String(byKind("hours_short").id)]));
        await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/company/salaries?month=2026-08"));
        expect(await screen.findByText("August 2026")).toBeInTheDocument();
    });

    it("only marks read what the reader may not open", async () => {
        const read: string[] = [];
        renderApp("/design/notifications", personas.designAdmin, ...notificationHandlers({ ...notifications.rana, items: [byKind("hours_short")], totalCount: 1 }),
            http.post("/api/notifications/:id/read", ({ params }) => { read.push(String(params.id)); return HttpResponse.json({ unread: 0 }); }));
        await userEvent.click(await screen.findByText("7 employees finished August 2026 short of their hours"));
        await waitFor(() => expect(read).toHaveLength(1));
        expect(window.location.pathname).toBe("/design/notifications");
    });

    it("lights up when the live connection says the bell changed", async () => {
        let unread = 0;
        renderApp("/design/overview", rana,
            http.get("/api/notifications/unread-count", () => HttpResponse.json({ unread })),
            ...notificationHandlers());
        const bell = await screen.findByRole("button", { name: "Notifications" });
        await waitFor(() => expect(live.connected).toBeGreaterThan(0));
        expect(bell.querySelector(".pip")).toBeNull();
        unread = 3;
        act(() => live.emit("notifications"));
        await waitFor(() => expect(bell.querySelector(".pip")).not.toBeNull());
    });

    it("rings when a notification comes in, not for those already there, and its list has the sound switch", async () => {
        let played = 0;
        vi.stubGlobal("AudioContext", class {
            state = "running";
            currentTime = 0;
            destination = {};
            createOscillator() {
                played++;
                return { type: "", frequency: { setValueAtTime() {} }, connect: (n: unknown) => n, start() {}, stop() {} };
            }
            createGain() {
                return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
            }
            resume() {
                return Promise.resolve();
            }
        });
        let unread = 2;
        renderApp("/design/overview", rana,
            http.get("/api/notifications/unread-count", () => HttpResponse.json({ unread })),
            ...notificationHandlers());
        const bell = await screen.findByRole("button", { name: "Notifications" });
        await waitFor(() => expect(bell.querySelector(".pip")).not.toBeNull());
        await waitFor(() => expect(live.connected).toBeGreaterThan(0));
        expect(played).toBe(0);

        // well after the ring of the test before, at the same frozen time
        vi.setSystemTime(new Date("2026-09-30T09:05:00Z"));
        unread = 3;
        act(() => live.emit("notifications"));
        await waitFor(() => expect(played).toBe(2));

        await userEvent.click(bell);
        expect(await screen.findByRole("button", { name: "Turn sounds off" })).toBeInTheDocument();
        vi.unstubAllGlobals();
    });
});

group("The notifications page", () => {
    it("lists everything by day, the unread alone on a tab, and older ones on request", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/notifications", personas.designEmployee,
            http.get("/api/notifications", ({ request }) => { asked.push(new URL(request.url).searchParams); return undefined; }),
            ...notificationHandlers(notifications.sarah));
        expect(await screen.findByText("Weekly summary: you logged 37h 00m last week")).toBeInTheDocument();
        expect(screen.getByText("18 unread of 18")).toBeInTheDocument();
        const panel = screen.getByText("Weekly summary: you logged 37h 00m last week").closest(".panel") as HTMLElement;
        expect(within(panel).getAllByText(/Today|Yesterday|Sep/, { selector: ".feed-day" }).length).toBeGreaterThan(0);
        await userEvent.click(screen.getByRole("tab", { name: "Unread" }));
        await waitFor(() => expect(asked.some((q) => q.get("unreadOnly") === "true")).toBe(true));
        expect(screen.queryByRole("button", { name: "Show older notifications" })).not.toBeInTheDocument();
    });

    it("loads older notifications a page at a time", async () => {
        const pages: string[] = [];
        renderApp("/design/notifications", rana,
            http.get("/api/notifications", ({ request }) => { pages.push(new URL(request.url).searchParams.get("page") ?? ""); return undefined; }),
            ...notificationHandlers());
        await userEvent.click(await screen.findByRole("button", { name: "Show older notifications" }));
        await waitFor(() => expect(pages).toContain("2"));
    });
});
