import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/shared/components/Feedback/toast";
import { onPortalSessionExpired, portalSignIn, portalSignOut, refreshPortalSession, setPortalAccessToken, type PortalAccount, type PortalAuthResponse } from "./portalApi";
import { PortalSessionContext, type PortalSessionStatus, type PortalSessionValue } from "./portalSession";

const CHANNEL = "hourline-portal-session";

/**
 * The client portal's session, apart from the staff one: it restores itself from the portal's refresh cookie, and a
 * sign-out in one tab signs the other tabs out too.
 */
export default function PortalSessionProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<PortalSessionStatus>("loading");
    const [account, setAccount] = useState<PortalAccount | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const channel = useRef<BroadcastChannel | null>(null);
    const queryClient = useQueryClient();

    const start = useCallback((auth: PortalAuthResponse) => {
        setPortalAccessToken(auth.accessToken);
        setAccount(auth.account);
        setNotice(null);
        setStatus("signedIn");
    }, []);

    const end = useCallback((message: string | null) => {
        setPortalAccessToken(null);
        // what this client saw (the bell, the discussions) isn't for whoever signs in next
        queryClient.removeQueries({ queryKey: ["portal"] });
        queryClient.removeQueries({ queryKey: ["portal-discussion", "client"] });
        setAccount(null);
        setNotice(message);
        setStatus("signedOut");
    }, [queryClient]);

    useEffect(() => {
        onPortalSessionExpired(() => end("Your session ended. Please sign in again."));
        let cancelled = false;
        refreshPortalSession()
            .then((auth) => {
                if (cancelled) return;
                if (auth) start(auth);
                else setStatus("signedOut");
            })
            .catch(() => {
                if (!cancelled) end("The server can't be reached right now. Try again in a moment.");
            });

        if (typeof BroadcastChannel !== "undefined") {
            channel.current = new BroadcastChannel(CHANNEL);
            channel.current.onmessage = (event) => {
                if (event.data === "signed-out") end(null);
            };
        }
        return () => {
            cancelled = true;
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
