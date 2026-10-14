import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/shared/components/Feedback/toast";
import {
    onPortalSessionExpired, onPortalSessionRefreshed, portalSignIn, portalSignOut, refreshPortalSession, setPortalAccessToken,
    type PortalAccount, type PortalAuthResponse,
} from "./portalApi";
import { PortalSessionContext, type PortalSessionStatus, type PortalSessionValue } from "./portalSession";

const CHANNEL = "hourline-portal-session";

/** Tries at restoring the session on load before saying the server can't be reached. */
const RESTORE_ATTEMPTS = 3;

/** What the portal keeps of a client: the bell, the projects and the discussions. */
const CLIENT_KEYS = [["portal"], ["portal-discussion", "client"]];

/**
 * The client portal's session, apart from the staff one: it restores itself from the portal's refresh cookie, and a
 * sign-out in one tab signs the other tabs out too.
 */
export default function PortalSessionProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<PortalSessionStatus>("loading");
    const [account, setAccount] = useState<PortalAccount | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const channel = useRef<BroadcastChannel | null>(null);
    // whose session this is, to tell when another account's takes its place
    const accountId = useRef<number | null>(null);
    const queryClient = useQueryClient();

    const start = useCallback((auth: PortalAuthResponse) => {
        setPortalAccessToken(auth.accessToken);
        // another account in this browser: nothing of the last one's may stay on screen, and the pages load the new one's
        if (accountId.current !== null && accountId.current !== auth.account.id) {
            CLIENT_KEYS.forEach((queryKey) => void queryClient.resetQueries({ queryKey }));
        }
        accountId.current = auth.account.id;
        setAccount(auth.account);
        setNotice(null);
        setStatus("signedIn");
    }, [queryClient]);

    const end = useCallback((message: string | null) => {
        setPortalAccessToken(null);
        accountId.current = null;
        // what this client saw (the bell, the discussions) isn't for whoever signs in next
        CLIENT_KEYS.forEach((queryKey) => queryClient.removeQueries({ queryKey }));
        setAccount(null);
        setNotice(message);
        setStatus("signedOut");
    }, [queryClient]);

    useEffect(() => {
        onPortalSessionExpired(() => end("Your session ended. Please sign in again."));
        // a refresh brought another account's session (signed in from another tab): it takes over here too
        onPortalSessionRefreshed((auth) => {
            if (accountId.current !== null && accountId.current !== auth.account.id) start(auth);
        });

        let cancelled = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        // a rate limit or a server restarting says nothing about the cookie: try again a few times before sending the
        // client to sign in (a 401 is an answer: there is no session, and asking again won't change it)
        const restore = (attempt: number) => refreshPortalSession()
            .then((auth) => {
                if (cancelled) return;
                if (auth) start(auth);
                else setStatus("signedOut");
            })
            .catch(() => {
                if (cancelled) return;
                if (attempt < RESTORE_ATTEMPTS) retry = setTimeout(() => void restore(attempt + 1), attempt * 2000);
                else end("The server can't be reached right now. Try again in a moment.");
            });
        void restore(1);

        if (typeof BroadcastChannel !== "undefined") {
            channel.current = new BroadcastChannel(CHANNEL);
            channel.current.onmessage = (event) => {
                if (event.data === "signed-out") end(null);
            };
        }
        return () => {
            cancelled = true;
            clearTimeout(retry);
            channel.current?.close();
        };
    }, [start, end]);

    const signIn = useCallback(async (email: string, password: string) => {
        start(await portalSignIn(email, password));
    }, [start]);

    const signOut = useCallback(async () => {
        try {
            await portalSignOut();
        } catch {
            toast({ text: "You're still signed in", sub: "The server couldn't end your session just now. Try again in a moment.", icon: "alert" });
            return;
        }
        channel.current?.postMessage("signed-out");
        end(null);
    }, [end]);

    const value = useMemo<PortalSessionValue>(
        () => ({ status, account, notice, signIn, signOut, adopt: start }),
        [status, account, notice, signIn, signOut, start],
    );

    return <PortalSessionContext value={value}>{children}</PortalSessionContext>;
}
