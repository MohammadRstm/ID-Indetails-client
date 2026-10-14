import { HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { secondsLeft } from "@/api/tokenExpiry";
import { refreshDiscussion } from "../discussion/discussionApi";
import { portalBellKey, portalMeKey } from "../notifications/notificationsApi";
import { getPortalAccessToken, portalSessionExpired, refreshPortalSession } from "../portalApi";
import { usePortalSession } from "../portalSession";

const RETRY_MS = 15_000;
const POLL_MS = 60_000;
/** The client's discussions: the keys are `["portal-discussion", "client", projectId, ...]`. */
const DISCUSSION_KEY = ["portal-discussion", "client"] as const;

/** A token good for the next minute, refreshed first when it isn't. */
async function freshToken(): Promise<string> {
    const token = getPortalAccessToken();
    if (token && secondsLeft(token) > 60) return token;
    try {
        const auth = await refreshPortalSession();
        // no session left: sign out, rather than retry (and spend the refresh limit) forever
        if (!auth) portalSessionExpired();
        return auth?.accessToken ?? "";
    } catch {
        // offline or refused for now: the connection tries again later
        return "";
    }
}

/**
 * The client portal's live connection (the API's /hubs/portal), open for as long as a client is signed in. It only
 * says that something changed: a project's discussion ("portal") or the bell ("notifications"), and the pages then
 * reload it through the API. While the connection is down the pages ask for themselves every minute.
 */
export function usePortalLive() {
    const queryClient = useQueryClient();
    const { status, account } = usePortalSession();
    // one connection per client: signing in as someone else starts it again
    const accountId = status === "signedIn" ? account?.id : undefined;

    useEffect(() => {
        if (accountId === undefined) return;
        const connection = new HubConnectionBuilder()
            .withUrl("/hubs/portal", { accessTokenFactory: freshToken })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.None)
            .build();
        const invalidate = (...keys: (readonly unknown[])[]) => keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
        const refreshBell = () => invalidate(portalBellKey, portalMeKey);
        const refreshAll = () => invalidate(DISCUSSION_KEY, portalBellKey, portalMeKey);
        let stopped = false;
        let connectedBefore = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let poll: ReturnType<typeof setInterval> | undefined;

        // while the connection is down, the pages ask for themselves, but only when someone is looking
        const startPolling = () => {
            poll ??= setInterval(() => { if (document.visibilityState === "visible") refreshAll(); }, POLL_MS);
        };
        const stopPolling = () => {
            clearInterval(poll);
            poll = undefined;
        };

        // one project's discussion: its summary, its chat and the thread on screen; without a project, all of them
        connection.on("portal", (change?: { projectId?: number }) => {
            if (change?.projectId) refreshDiscussion(queryClient, "client", change.projectId);
            else invalidate(DISCUSSION_KEY);
        });
        connection.on("notifications", refreshBell);
        connection.onreconnecting(startPolling);
        // anything may have changed while the connection was down
        connection.onreconnected(() => {
            stopPolling();
            refreshAll();
        });
        // the automatic retries gave up (the API was down for a while): keep trying, slowly
        connection.onclose(() => {
            if (stopped) return;
            startPolling();
            retry = setTimeout(start, RETRY_MS);
        });

        function start() {
            if (stopped || connection.state !== HubConnectionState.Disconnected) return;
            connection.start().then(() => {
                stopPolling();
                // after a break, anything may have changed; the first time, the pages have only just loaded
                if (connectedBefore) refreshAll();
                connectedBefore = true;
            }).catch(() => {
                if (stopped) return;
                startPolling();
                retry = setTimeout(start, RETRY_MS);
            });
        }
        start();

        return () => {
            stopped = true;
            clearTimeout(retry);
            stopPolling();
            void connection.stop();
        };
    }, [queryClient, accountId]);
}
