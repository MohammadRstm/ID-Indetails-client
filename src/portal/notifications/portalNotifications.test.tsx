import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionExpired } from "@/api/http";
import { live } from "@/test/liveHub";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { server } from "@/test/server";
import type { PortalAuthResponse } from "../portalApi";
import { portalProjectOf } from "../portalTestKit";
import { describePortalNotification } from "./notificationWords";
import type { PortalNotification } from "./notificationsApi";

/*
 * The client portal's bell: how many notifications are unread, the list with its words and links, marking them
 * read, and the unread counts on the home page's project cards.
 */

const auth: PortalAuthResponse = {
    accessToken: "portal-token",
    accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    account: {
        id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun",
        projects: [
            portalProjectOf(2, "Villa Mounir interiors", { unread: 3 }),
            portalProjectOf(3, "Garden pavilion", { status: "hold" }),
        ],
    },
};
const omar: PortalAuthResponse = { ...auth, account: { id: 8, email: "omar@client.test", firstName: "Omar", lastName: "Saad", projects: [] } };
const signedIn = http.post("/api/portal/auth/refresh", () => HttpResponse.json(auth));
const project = http.get("/api/portal/projects/:id", () => HttpResponse.json({
    projectId: 2, title: "Villa Mounir interiors", status: "active", summary: null, isPublished: false, publishedAt: null, hero: null, heroes: [],
    sections: ["presentation", "model", "drawing"].map((section) => ({ section, items: [] })),
}));

function note(id: number, kind: PortalNotification["kind"], over: Partial<PortalNotification> = {}): PortalNotification {
    return {
        id, kind, projectId: 2, projectTitle: "Villa Mounir interiors", actorName: "Nadia Karam", itemId: null, itemTitle: null, count: 1,
        createdAt: "2026-10-14T08:00:00Z", read: false, ...over,
    };
}

const living = { itemId: 11, itemTitle: "Living room" };
/** Newest first, as the API lists them: four unread, then two read. */
const inbox = [
    note(36, "team_message"),
    note(35, "team_message", { count: 3 }),
    note(34, "team_comment", living),
    note(33, "team_comment", { ...living, count: 2 }),
    note(32, "mention", { read: true }),
    note(31, "mention", { itemId: 14, itemTitle: "Brochure", read: true }),
];

/** The portal's notifications as the API keeps them: paged four at a time, and read when a request says so. */
function serve(list: PortalNotification[]) {
    const items = list.map((n) => ({ ...n }));
    const unread = () => items.filter((n) => !n.read).length;
    const posted: unknown[] = [];
    const handlers = [
        http.get("/api/portal/notifications/unread-count", () => HttpResponse.json({ unread: unread() })),
        http.get("/api/portal/notifications", ({ request }) => {
            const before = Number(new URL(request.url).searchParams.get("before") ?? Infinity);
            const rest = items.filter((n) => n.id < before);
            return HttpResponse.json({ items: rest.slice(0, 4), hasMore: rest.length > 4 });
        }),
        http.post("/api/portal/notifications/read", async ({ request }) => {
            const body = (await request.json()) as { ids?: number[]; all?: boolean };
            posted.push(body);
            items.forEach((n) => { if (body.all || body.ids?.includes(n.id)) n.read = true; });
            return HttpResponse.json({ unread: unread() });
        }),
    ];
    return { posted, handlers };
}

// the same hour every time, as far as "1 hour ago" goes
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("A client notification's words", () => {
    it("say who wrote, or how many are new, and link to the chat or the file", () => {
        expect(describePortalNotification(note(1, "team_message")))
            .toEqual({ text: "Nadia Karam sent a message in Villa Mounir interiors", link: "/portal/projects/2?chat=1" });
        expect(describePortalNotification(note(1, "team_message", { count: 3 })))
            .toEqual({ text: "3 new messages in Villa Mounir interiors", link: "/portal/projects/2?chat=1" });

        expect(describePortalNotification(note(2, "team_comment", living)))
            .toEqual({ text: "Nadia Karam commented on Living room", link: "/portal/projects/2?item=11" });
        expect(describePortalNotification(note(2, "team_comment", { ...living, count: 2 })))
            .toEqual({ text: "2 new comments on Living room", link: "/portal/projects/2?item=11" });

        expect(describePortalNotification(note(3, "mention")))
            .toEqual({ text: "Nadia Karam mentioned you in Villa Mounir interiors", link: "/portal/projects/2?chat=1" });
        expect(describePortalNotification(note(3, "mention", living)))
            .toEqual({ text: "Nadia Karam mentioned you in Villa Mounir interiors on Living room", link: "/portal/projects/2?item=11" });
    });

    it("name a file that has lost its title, and still read for a kind this version doesn't know", () => {
        expect(describePortalNotification(note(4, "team_comment", { itemId: 12 })).text).toBe("Nadia Karam commented on a file");
        expect(describePortalNotification(note(5, "something_new" as PortalNotification["kind"])))
            .toEqual({ text: "New activity in Villa Mounir interiors", link: "/portal/projects/2" });
    });
});

describe("The portal's bell", () => {
    it("counts what is unread on the bell", async () => {
        renderApp("/portal", null, signedIn, ...serve(inbox).handlers);
        const bell = await screen.findByRole("button", { name: "Notifications, 4 unread" });
        expect(within(bell).getByText("4")).toBeInTheDocument();
    });

    it("lists the newest first with the words, the time and an unread dot, and loads the older ones on request", async () => {
        renderApp("/portal", null, signedIn, ...serve(inbox).handlers);
        await userEvent.click(await screen.findByRole("button", { name: "Notifications, 4 unread" }));

        const first = await screen.findByText("Nadia Karam sent a message in Villa Mounir interiors");
        const list = first.closest(".notif-list") as HTMLElement;
        const texts = () => Array.from(list.querySelectorAll(".notif-txt"), (e) => e.textContent);
        expect(texts()).toEqual([
            "Nadia Karam sent a message in Villa Mounir interiors",
            "3 new messages in Villa Mounir interiors",
            "Nadia Karam commented on Living room",
            "2 new comments on Living room",
        ]);
        expect(within(list).getAllByText("1 hour ago")).toHaveLength(4);
        expect(list.querySelectorAll(".notif.unread .dot")).toHaveLength(4);
        expect(screen.getByText(/· 4 unread/)).toBeInTheDocument();

        await userEvent.click(within(list).getByRole("button", { name: "Load more" }));
        await waitFor(() => expect(texts()).toHaveLength(6));
        expect(texts().slice(4)).toEqual([
            "Nadia Karam mentioned you in Villa Mounir interiors",
            "Nadia Karam mentioned you in Villa Mounir interiors on Brochure",
        ]);
        // the two read ones carry no dot
        expect(list.querySelectorAll(".notif.unread")).toHaveLength(4);
        expect(within(list).queryByRole("button", { name: "Load more" })).toBeNull();
    });

    it("says so when there is nothing yet", async () => {
        renderApp("/portal", null, signedIn, ...serve([]).handlers);
        await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
        expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
    });

    it("marks a notification read and opens what it is about", async () => {
        const served = serve(inbox);
        renderApp("/portal", null, signedIn, project, ...served.handlers);
        await userEvent.click(await screen.findByRole("button", { name: "Notifications, 4 unread" }));
        await userEvent.click(await screen.findByText("3 new messages in Villa Mounir interiors"));

        await waitFor(() => expect(window.location.pathname).toBe("/portal/projects/2"));
        await waitFor(() => expect(served.posted).toEqual([{ ids: [35] }]));
        // the list closes, and the count follows the answer
        expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
        expect(await screen.findByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
    });

    it("opens one that was read already without marking it again", async () => {
        const served = serve(inbox);
        renderApp("/portal", null, signedIn, project, ...served.handlers);
        await userEvent.click(await screen.findByRole("button", { name: "Notifications, 4 unread" }));
        await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
        await userEvent.click(await screen.findByText("Nadia Karam mentioned you in Villa Mounir interiors on Brochure"));

        await waitFor(() => expect(window.location.pathname).toBe("/portal/projects/2"));
        expect(served.posted).toEqual([]);
    });

    it("marks them all read", async () => {
        const served = serve(inbox);
        renderApp("/portal", null, signedIn, ...served.handlers);
        await userEvent.click(await screen.findByRole("button", { name: "Notifications, 4 unread" }));
        const all = await screen.findByRole("button", { name: "Mark all as read" });
        // it stands out, in the primary colour
        expect(all).toHaveClass("btn", "btn-primary", "btn-sm");
        await waitFor(() => expect(all).toBeEnabled());
        await userEvent.click(all);

        await waitFor(() => expect(served.posted).toEqual([{ all: true }]));
        expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
        await waitFor(() => expect(document.querySelectorAll(".notif.unread")).toHaveLength(0));
        expect(all).toBeDisabled();
    });

    it("follows the live connection when the bell changes", async () => {
        const served = serve(inbox);
        renderApp("/portal", null, signedIn, ...served.handlers);
        await screen.findByRole("button", { name: "Notifications, 4 unread" });
        await waitFor(() => expect(live.urls).toEqual(["/hubs/portal"]));

        // two more arrive on the server
        server.use(http.get("/api/portal/notifications/unread-count", () => HttpResponse.json({ unread: 6 })));
        act(() => live.emit("notifications"));
        expect(await screen.findByRole("button", { name: "Notifications, 6 unread" })).toBeInTheDocument();
    });

    it("isn't shown to the next client who signs in", async () => {
        let unread = 4;
        renderApp("/portal", null, signedIn,
            http.get("/api/portal/notifications/unread-count", () => HttpResponse.json({ unread })),
            http.post("/api/portal/auth/logout", () => new HttpResponse(null, { status: 204 })),
            http.post("/api/portal/auth/login", () => HttpResponse.json(omar)));
        await screen.findByRole("button", { name: "Notifications, 4 unread" });
        await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await screen.findByRole("heading", { name: "Client portal" });
        // nothing is waiting for the next client; the first one's count must not be shown in its place
        unread = 0;
        await userEvent.type(screen.getByLabelText(/Email/), "omar@client.test");
        await userEvent.type(screen.getByLabelText(/Password/), "olive tree garden");
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("heading", { name: "Welcome, Omar" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });
});

describe("The portal's home page", () => {
    it("shows each project's unread count when it is above nothing", async () => {
        renderApp("/portal", null, signedIn);
        // until the API answers, what the sign-in said
        const villa = (await screen.findByRole("heading", { name: "Villa Mounir interiors" })).closest("a") as HTMLElement;
        expect(within(villa).getByText("3 unread")).toBeInTheDocument();
        const pavilion = screen.getByRole("heading", { name: "Garden pavilion" }).closest("a") as HTMLElement;
        expect(within(pavilion).queryByText(/unread/)).toBeNull();
    });

    it("takes the counts from the API's latest answer, and asks again when the bell changes", async () => {
        let unread = [5, 1];
        renderApp("/portal", null, signedIn,
            http.get("/api/portal/me", () => HttpResponse.json({
                ...auth.account, projects: auth.account.projects.map((p, i) => ({ ...p, unread: unread[i] })),
            })));
        const villa = (await screen.findByRole("heading", { name: "Villa Mounir interiors" })).closest("a") as HTMLElement;
        const pavilion = screen.getByRole("heading", { name: "Garden pavilion" }).closest("a") as HTMLElement;
        expect(await within(villa).findByText("5 unread")).toBeInTheDocument();
        expect(within(pavilion).getByText("1 unread")).toBeInTheDocument();

        unread = [0, 2];
        await waitFor(() => expect(live.connected).toBeGreaterThan(0));
        act(() => live.emit("notifications"));
        expect(await within(pavilion).findByText("2 unread")).toBeInTheDocument();
        await waitFor(() => expect(within(villa).queryByText(/unread/)).toBeNull());
    });

    it("keeps following the counts when a staff member signs out in the same browser", async () => {
        let unread = [5, 1];
        renderApp("/portal", personas.designAdmin, signedIn,
            http.get("/api/portal/me", () => HttpResponse.json({
                ...auth.account, projects: auth.account.projects.map((p, i) => ({ ...p, unread: unread[i] })),
            })));
        const villa = (await screen.findByRole("heading", { name: "Villa Mounir interiors" })).closest("a") as HTMLElement;
        expect(await within(villa).findByText("5 unread")).toBeInTheDocument();

        // the staff session ends (signed out in another tab): the staff app forgets what it had loaded, and the portal
        // keeps its own
        act(() => sessionExpired());
        unread = [2, 0];
        await waitFor(() => expect(live.connected).toBeGreaterThan(0));
        act(() => live.emit("notifications"));
        expect(await within(villa).findByText("2 unread")).toBeInTheDocument();
    });
});

describe("The portal's project cards", () => {
    const three: PortalAuthResponse = {
        ...auth,
        account: {
            ...auth.account,
            projects: [
                portalProjectOf(2, "Villa Mounir interiors", {
                    startedOn: "2026-03-01", lastActivityAt: "2026-10-13T08:00:00Z", lastPublishedAt: "2026-10-01T09:00:00Z", hasNews: true,
                    heroUrl: "/api/content-store/previews/90?sig=h", heroUrlExpiresAt: "2030-01-01T00:00:00Z",
                }),
                portalProjectOf(3, "Garden pavilion", { status: "hold", startedOn: "2026-06-01", lastActivityAt: "2026-09-01T08:00:00Z" }),
                portalProjectOf(4, "Roof terrace", { startedOn: "2026-08-15", lastActivityAt: "2026-10-14T07:00:00Z", lastPublishedAt: "2026-09-20T10:00:00Z" }),
            ],
        },
    };
    const signedInWithThree = http.post("/api/portal/auth/refresh", () => HttpResponse.json(three));
    const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    afterEach(() => localStorage.clear());

    it("show each project's hero image, or a calm block without one, and a red dot where something is new", async () => {
        renderApp("/portal", null, signedInWithThree);

        const villa = (await screen.findByRole("heading", { name: "Villa Mounir interiors" })).closest("a") as HTMLElement;
        expect(villa.querySelector(".portal-cover img")).toHaveAttribute("src", "/api/content-store/previews/90?sig=h");
        expect(villa.querySelector(".portal-news")).not.toBeNull();
        expect(within(villa).getByText("New since your last visit")).toBeInTheDocument();

        const garden = screen.getByRole("heading", { name: "Garden pavilion" }).closest("a") as HTMLElement;
        expect(garden.querySelector(".portal-cover img")).toBeNull();
        expect(garden.querySelector(".portal-cover-blank")).not.toBeNull();
        expect(garden.querySelector(".portal-news")).toBeNull();
        expect(within(garden).queryByText("New since your last visit")).toBeNull();
    });

    it("put the newest project first, or the latest activity, or the last published, and remember the choice", async () => {
        renderApp("/portal", null, signedInWithThree);
        await screen.findByRole("heading", { name: "Villa Mounir interiors" });
        expect(titles()).toEqual(["Roof terrace", "Garden pavilion", "Villa Mounir interiors"]);
        const sort = screen.getByRole("button", { name: "Sort projects" });
        expect(sort).toHaveTextContent("Newest project");

        await userEvent.click(sort);
        await userEvent.click(screen.getByRole("option", { name: "Latest activity" }));
        expect(titles()).toEqual(["Roof terrace", "Villa Mounir interiors", "Garden pavilion"]);

        await userEvent.click(sort);
        await userEvent.click(screen.getByRole("option", { name: "Last published" }));
        // one never published goes last
        expect(titles()).toEqual(["Villa Mounir interiors", "Roof terrace", "Garden pavilion"]);
        expect(localStorage.getItem("hourline.portal.projectSort")).toBe("published");
    });

    it("start from the order this browser was left with", async () => {
        localStorage.setItem("hourline.portal.projectSort", "activity");
        renderApp("/portal", null, signedInWithThree);
        await screen.findByRole("heading", { name: "Villa Mounir interiors" });
        expect(titles()).toEqual(["Roof terrace", "Villa Mounir interiors", "Garden pavilion"]);
        expect(screen.getByRole("button", { name: "Sort projects" })).toHaveTextContent("Latest activity");
    });

    it("offer no order to choose with one project", async () => {
        renderApp("/portal", null, http.post("/api/portal/auth/refresh", () => HttpResponse.json({ ...auth, account: { ...auth.account, projects: [three.account.projects[0]] } })));
        await screen.findByRole("heading", { name: "Villa Mounir interiors" });
        expect(screen.queryByRole("button", { name: "Sort projects" })).toBeNull();
    });
});
