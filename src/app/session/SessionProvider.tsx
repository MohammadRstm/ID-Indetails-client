import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { configureSession, http, refreshSession, signIn as apiSignIn, signOut as apiSignOut } from "@/api/http";
import { tokenStore } from "@/api/tokenStore";
import type { AuthResponse, CurrentUser } from "@/api/types";
import { ME_KEY, SessionContext, type SessionValue, type SessionStatus } from "./sessionContext";
import { clearToasts, toast } from "@/shared/components/Feedback/toast";
import { forgetFileUrls } from "@/shared/files/useFileUrl";
import { onSessionReset, resetSessionState } from "./sessionReset";

// Permissions aren't pushed by the API, so the signed-in user is read again now and then (and when the tab
// comes back into focus), which is how a change of permissions reaches an open app.
const ME_REFRESH_MS = 5 * 60_000;

const CHANNEL = "hourline-session";

/** Tries at restoring the session on load before saying the server can't be reached. */
const RESTORE_ATTEMPTS = 3;

// what the shared layer keeps outside React Query goes with the person too
onSessionReset(clearToasts);
onSessionReset(forgetFileUrls);

/**
 * Holds who is signed in. On load it restores the session from the refresh cookie, once. A sign-out in one tab
 * signs the others out too.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<SessionStatus>("loading");
    const [notice, setNotice] = useState<string | null>(null);
    const channel = useRef<BroadcastChannel | null>(null);

    const start = useCallback((auth: AuthResponse) => {
        tokenStore.set(auth.accessToken);
        queryClient.setQueryData(ME_KEY, auth.user);
        setNotice(null);
        setStatus("signedIn");
    }, [queryClient]);

    const end = useCallback((message: string | null) => {
        // signed out in another tab too: its access token must not outlive the session here
        tokenStore.set(null);
        queryClient.clear();
        resetSessionState();
        setNotice(message);
        setStatus("signedOut");
    }, [queryClient]);

    useEffect(() => {
        configureSession({
            onRefreshed: (auth) => {
                // another tab signed in as someone else: nothing of the last person's may stay on screen
                const before = queryClient.getQueryData<{ id: number }>(ME_KEY);
                if (before && before.id !== auth.user.id) {
                    queryClient.clear();
                    resetSessionState();
                }
                queryClient.setQueryData(ME_KEY, auth.user);
            },
            onExpired: () => end("Your session ended. Please sign in again."),
        });

        let cancelled = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        // a rate limit or a server restarting says nothing about the cookie: try again a few times before
        // sending the person to sign in
        const restore = (attempt: number) => refreshSession()
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
    }, [queryClient, start, end]);

    const me = useQuery({
        queryKey: ME_KEY,
        queryFn: async () => (await http.get<CurrentUser>("/auth/me")).data,
        enabled: status === "signedIn",
        refetchInterval: ME_REFRESH_MS,
        staleTime: 60_000,
    });

    const signIn = useCallback(async (email: string, password: string) => {
        start(await apiSignIn(email, password));
    }, [start]);

    const signOut = useCallback(async () => {
        try {
            await apiSignOut();
        } catch {
            // the session is still valid on the server: saying otherwise would leave it to the next person here
            toast({ text: "You're still signed in", sub: "The server couldn't end your session just now. Try signing out again in a moment.", icon: "alert" });
            return;
        }
        channel.current?.postMessage("signed-out");
        end(null);
    }, [end]);

    const value = useMemo<SessionValue>(() => ({
        status: status === "signedIn" && !me.data ? "loading" : status,
        user: status === "signedIn" ? me.data ?? null : null,
        notice,
        signIn,
        signOut,
        adopt: start,
    }), [status, me.data, notice, signIn, signOut, start]);

    return <SessionContext value={value}>{children}</SessionContext>;
}
