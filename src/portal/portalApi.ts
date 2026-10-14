import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toApiError } from "@/api/errors";

/*
 * The client portal talks to /api/portal with its own access token and its own refresh cookie (on
 * /api/portal/auth), apart from the staff session in api/http.ts: a staff member and a client can be signed in in
 * the same browser, and neither token is ever sent to the other side.
 */

export type PortalProject = {
    id: number;
    title: string;
    status: "active" | "hold" | "completed" | "archived";
    /** Chat messages and comments by others that the client hasn't read yet. */
    unread: number;
};

export type PortalAccount = { id: number; email: string; firstName: string; lastName: string; projects: PortalProject[] };

export type PortalAuthResponse = { accessToken: string; accessTokenExpiresAt: string; account: PortalAccount };

export type PortalInvitationPreview = { email: string; projectTitle: string; expiresAt: string };

export const portalHttp = axios.create({ baseURL: "/api/portal", headers: { Accept: "application/json" } });
const bare = axios.create({ baseURL: "/api/portal", headers: { Accept: "application/json" } });

let accessToken: string | null = null;
let onExpired: () => void = () => {};
let onRefreshed: (auth: PortalAuthResponse) => void = () => {};

export function setPortalAccessToken(token: string | null) {
    accessToken = token;
}

/** The current access token, for the live connection. Null when nobody is signed in. */
export function getPortalAccessToken(): string | null {
    return accessToken;
}

/** Called when the portal session is gone (expired, revoked, signed out elsewhere). */
export function onPortalSessionExpired(handler: () => void) {
    onExpired = handler;
}

/** Called with every session a refresh brings, which may be another account's: one signed in from another tab. */
export function onPortalSessionRefreshed(handler: (auth: PortalAuthResponse) => void) {
    onRefreshed = handler;
}

/** The session is over (a refresh found none): the client is signed out, as a 401 on a request would do. */
export function portalSessionExpired() {
    onExpired();
}

let refreshing: Promise<PortalAuthResponse | null> | null = null;

/** Exchanges the portal refresh cookie for a new access token, one at a time across tabs. Null when there's no session. */
export function refreshPortalSession(): Promise<PortalAuthResponse | null> {
    refreshing ??= withLock(async () => {
        try {
            const { data } = await bare.post<PortalAuthResponse>("/auth/refresh");
            accessToken = data.accessToken;
            onRefreshed(data);
            return data;
        } catch (error) {
            const apiError = toApiError(error);
            if (apiError.status === 401) {
                accessToken = null;
                return null;
            }
            throw apiError;
        }
    }).finally(() => {
        refreshing = null;
    });
    return refreshing;
}

function withLock<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) {
        return navigator.locks.request("hourline-portal-refresh", work);
    }
    return work();
}

portalHttp.interceptors.request.use((config) => {
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

portalHttp.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const config = error.config as RetriableConfig | undefined;
        if (error.response?.status === 401 && config && !config._retried) {
            config._retried = true;
            const auth = await refreshPortalSession().catch((refreshError) => Promise.reject(toApiError(refreshError)));
            if (auth) return portalHttp(config);
            onExpired();
        }
        return Promise.reject(toApiError(error));
    },
);

/** Calls that need no session: signing in, invitations and password resets. */
export async function portalAnonymous<T>(url: string, body?: unknown): Promise<T> {
    try {
        const { data } = await bare.post<T>(url, body);
        return data;
    } catch (error) {
        throw toApiError(error);
    }
}

export async function portalSignIn(email: string, password: string): Promise<PortalAuthResponse> {
    const data = await portalAnonymous<PortalAuthResponse>("/auth/login", { email, password });
    accessToken = data.accessToken;
    return data;
}

/** Ends the session and its cookie on the server. Throws only when the server couldn't be reached. */
export async function portalSignOut(): Promise<void> {
    await withLock(async () => {
        try {
            await bare.post("/auth/logout");
        } catch (error) {
            const apiError = toApiError(error);
            if (apiError.status <= 0 || apiError.status >= 500 || apiError.status === 429) throw apiError;
        }
        accessToken = null;
    });
}
