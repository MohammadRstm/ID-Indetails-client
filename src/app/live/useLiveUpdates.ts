import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { refreshSession, sessionExpired } from "@/api/http";
import { tokenStore } from "@/api/tokenStore";

/** Which chat changed: a team's, or the direct chat with a person. */
export type LiveChat = { teamId?: number | null; userId?: number | null };

const RETRY_MS = 15_000;

/** Seconds left on an access token, from its own expiry claim (never logged). */
function secondsLeft(token: string): number {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
        return (payload.exp ?? 0) - Date.now() / 1000;
    } catch {
        return 0;
    }
}

/** A token good for the next minute, refreshed first when it isn't. */
async function freshToken(): Promise<string> {
    const token = tokenStore.get();
    if (token && secondsLeft(token) > 60) return token;
    try {
        const auth = await refreshSession();
        // no session left: sign out, rather than retry (and spend the sign-in rate limit) forever
        if (!auth) sessionExpired();
        return auth?.accessToken ?? "";
    } catch {
        // offline or refused for now: the connection tries again later
        return "";
    }
}

/**
 * The live connection (the API's /hubs/live). It only says that something changed: the bell
 * ("notifications") or a chat ("messages"), and the pages then reload it through the API. An open
 * connection is also what shows the person as online.
 */
export function useLiveUpdates(userId: number) {
    const queryClient = useQueryClient();

    // one connection per person: when another tab signs in as someone else, this one starts again as them,
    // since the hub knows who is online, and whose signals to send, by the connection
    useEffect(() => {
        const connection = new HubConnectionBuilder()
            .withUrl("/hubs/live", { accessTokenFactory: freshToken })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.None)
            .build();
        const refresh = (...prefixes: string[]) => prefixes.forEach((p) => void queryClient.invalidateQueries({ queryKey: [p] }));
        let stopped = false;
        let connectedBefore = false;
        let retry: ReturnType<typeof setTimeout> | undefined;

        connection.on("notifications", () => refresh("notifications"));
        connection.on("messages", () => refresh("messages"));
        // anything may have changed while the connection was down
        connection.onreconnected(() => refresh("notifications", "messages"));
        // the automatic retries gave up (the API was down for a while): keep trying, slowly
        connection.onclose(() => { if (!stopped) retry = setTimeout(start, RETRY_MS); });

        function start() {
            if (stopped || connection.state !== HubConnectionState.Disconnected) return;
            connection.start().then(() => {
                // after a break, anything may have changed; the first time, the pages have only just loaded
                if (connectedBefore) refresh("notifications", "messages");
                connectedBefore = true;
            }).catch(() => {
                if (!stopped) retry = setTimeout(start, RETRY_MS);
            });
        }
        start();

        return () => {
            stopped = true;
            clearTimeout(retry);
            void connection.stop();
        };
    }, [queryClient, userId]);
}
