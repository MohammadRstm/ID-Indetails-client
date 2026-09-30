import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { configureSession, http, refreshSession, signIn as apiSignIn, signOut as apiSignOut } from "@/api/http";
import { tokenStore } from "@/api/tokenStore";
import type { AuthResponse, CurrentUser } from "@/api/types";
import { SessionContext, type SessionValue, type SessionStatus } from "./sessionContext";

export const ME_KEY = ["session", "me"] as const;

// Permissions aren't pushed by the API, so the signed-in user is read again now and then (and when the tab
// comes back into focus), which is how a change of permissions reaches an open app.
const ME_REFRESH_MS = 5 * 60_000;

const CHANNEL = "hourline-session";

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
        queryClient.clear();
        setNotice(message);
        setStatus("signedOut");
    }, [queryClient]);

    useEffect(() => {
        configureSession({
            onRefreshed: (auth) => queryClient.setQueryData(ME_KEY, auth.user),
            onExpired: () => end("Your session ended. Please sign in again."),
        });

        let cancelled = false;
        refreshSession()
            .then((auth) => {
                if (cancelled) return;
                if (auth) start(auth);
                else setStatus("signedOut");
            })
            .catch(() => !cancelled && end("The server can't be reached right now. Try again in a moment."));

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
        await apiSignOut().catch(() => undefined);
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
