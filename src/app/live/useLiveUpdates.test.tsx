import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { live } from "@/test/liveHub";
import { useLiveUpdates } from "./useLiveUpdates";

/* The staff's live connection (the API's /hubs/live): what its signals refresh. */

const keys = {
    villaDiscussion: ["portal-discussion", "staff", 4],
    villaChat: ["portal-discussion", "staff", 4, "messages"],
    pavilionDiscussion: ["portal-discussion", "staff", 5],
    clientSide: ["portal-discussion", "client", 4],
    bell: ["notifications", "latest"],
    chats: ["messages", "list"],
};

function mount() {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useLiveUpdates(1), { wrapper });
    Object.values(keys).forEach((key) => client.setQueryData(key, 1));
    return client;
}

const outOfDate = (client: QueryClient) =>
    Object.entries(keys).filter(([, key]) => client.getQueryState(key)?.isInvalidated).map(([name]) => name);

describe("the staff's live connection", () => {
    it("refreshes one project's client discussion when a signal says it changed, and nothing else", async () => {
        const client = mount();
        await act(async () => {});
        expect(live.urls).toEqual(["/hubs/live"]);

        act(() => live.emit("portal", { projectId: 4 }));
        expect(outOfDate(client)).toEqual(["villaDiscussion", "villaChat"]);
    });

    it("refreshes every project's discussion, the bell and the chats once the connection is back, but not the client's side", async () => {
        const client = mount();
        await act(async () => {});

        act(() => live.drop());
        act(() => live.restore());
        expect(outOfDate(client)).toEqual(["villaDiscussion", "villaChat", "pavilionDiscussion", "bell", "chats"]);
    });
});
