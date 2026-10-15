import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { live } from "@/test/liveHub";
import { PortalSessionContext, type PortalSessionStatus, type PortalSessionValue } from "../portalSession";
import { usePortalLive } from "./usePortalLive";

/*
 * The client portal's live connection: it opens while a client is signed in, turns the hub's signals into refreshes
 * of what the pages show, and asks for those refreshes itself while it is down.
 */

const keys = {
    villaChat: ["portal-discussion", "client", 4, "messages"],
    villaThread: ["portal-discussion", "client", 4, "thread", 11],
    pavilion: ["portal-discussion", "client", 5],
    staffVilla: ["portal-discussion", "staff", 4],
    unread: ["portal", "notifications", "unread"],
    list: ["portal", "notifications", "list"],
    me: ["portal", "me"],
    presentation: ["portal", "presentation", 4],
};

function sessionOf(status: PortalSessionStatus): PortalSessionValue {
    return {
        status, notice: null, signIn: async () => {}, signOut: async () => {}, adopt: () => {},
        account: status === "signedIn" ? { id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun", projects: [] } : null,
    };
}

function mount(status: PortalSessionStatus = "signedIn") {
    const client = new QueryClient();
    let current = status;
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <PortalSessionContext value={sessionOf(current)}>{children}</PortalSessionContext>
        </QueryClientProvider>
    );
    const view = renderHook(() => usePortalLive(), { wrapper });
    return {
        client,
        /** The session changes (a sign-out, a sign-in). */
        become(next: PortalSessionStatus) {
            current = next;
            view.rerender();
        },
    };
}

/** Puts something in every query, then lets the test see which of them were marked out of date. */
function seed(client: QueryClient) {
    Object.values(keys).forEach((key) => client.setQueryData(key, 1));
}
const outOfDate = (client: QueryClient) =>
    Object.entries(keys).filter(([, key]) => client.getQueryState(key)?.isInvalidated).map(([name]) => name);

/** What a minute's asking, or the connection coming back, marks out of date: every discussion of the client, the bell and the counts. */
const everything = ["villaChat", "villaThread", "pavilion", "unread", "list", "me"];

/** Lets the connection finish opening. */
const opened = () => act(async () => {});

/** Time passes, with the timers of the page running. */
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function look(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "visibilityState");
});

describe("the client portal's live connection", () => {
    it("opens the portal's hub while a client is signed in, and stops when they sign out", async () => {
        const { become } = mount();
        await opened();
        expect(live.urls).toEqual(["/hubs/portal"]);

        become("signedOut");
        expect(live.connected).toBe(0);
    });

    it("doesn't open for anyone who isn't signed in", async () => {
        const { become } = mount("signedOut");
        await opened();
        expect(live.connected).toBe(0);

        become("loading");
        await opened();
        expect(live.connected).toBe(0);

        become("signedIn");
        await opened();
        expect(live.urls).toEqual(["/hubs/portal"]);
    });

    it("refreshes one project's discussion when a signal says it changed, and nothing else", async () => {
        const { client } = mount();
        await opened();
        seed(client);

        act(() => live.emit("portal", { projectId: 4 }));
        expect(outOfDate(client)).toEqual(["villaChat", "villaThread"]);
    });

    it("refreshes the bell and the unread counts when a signal says the bell changed", async () => {
        const { client } = mount();
        await opened();
        seed(client);

        act(() => live.emit("notifications"));
        expect(outOfDate(client)).toEqual(["unread", "list", "me"]);
    });

    it("asks for everything again when the client's access ended somewhere", async () => {
        const { client } = mount();
        await opened();
        seed(client);

        act(() => live.emit("access"));
        // the project's page too, which then finds the project gone
        expect(outOfDate(client)).toEqual(expect.arrayContaining(["presentation", "me", "villaChat", "unread"]));
    });

    it("asks for the discussions and the bell every minute while the connection is down, when someone is looking", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        look("visible");
        const { client } = mount();
        await opened();
        seed(client);

        // connected: nothing asks on its own
        wait(120_000);
        expect(outOfDate(client)).toEqual([]);

        act(() => live.drop());
        wait(59_000);
        expect(outOfDate(client)).toEqual([]);
        wait(1_000);
        expect(outOfDate(client)).toEqual(everything);

        // the tab is in the background: the minute passes in silence
        seed(client);
        look("hidden");
        wait(60_000);
        expect(outOfDate(client)).toEqual([]);
        look("visible");
        wait(60_000);
        expect(outOfDate(client)).toEqual(everything);
    });

    it("refreshes at once when the connection is back, and stops asking", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        const { client } = mount();
        await opened();
        act(() => live.drop());
        seed(client);

        act(() => live.restore());
        expect(outOfDate(client)).toEqual(everything);

        seed(client);
        wait(300_000);
        expect(outOfDate(client)).toEqual([]);
    });

    it("stops asking when the client signs out while it is down", async () => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
        look("visible");
        const { client, become } = mount();
        await opened();
        act(() => live.drop());
        seed(client);

        become("signedOut");
        wait(300_000);
        expect(outOfDate(client)).toEqual([]);
    });
});
