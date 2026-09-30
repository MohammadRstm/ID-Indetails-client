import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toApiError } from "./errors";
import { tokenStore } from "./tokenStore";
import type { AuthResponse } from "./types";

/*
 * Every call to the API goes through `http`. It sends the access token, and on a 401 refreshes the session
 * once and repeats the request. Failures always reject with an ApiError.
 *
 * The API revokes every session of a user when a refresh token is used twice, so refreshes must never
 * overlap: one runs at a time in this tab (a shared promise) and across tabs (a Web Lock).
 */

// Arrays go as repeated keys (sections=a&sections=b), the way ASP.NET binds them.
export const http = axios.create({ baseURL: "/api", headers: { Accept: "application/json" }, paramsSerializer: { indexes: null } });

// The refresh itself goes around the interceptors, so a failed refresh can't trigger another.
const bare = axios.create({ baseURL: "/api", headers: { Accept: "application/json" }, paramsSerializer: { indexes: null } });

type SessionHandlers = {
    /** A refresh succeeded: the user may have changed (permissions, role). */
    onRefreshed: (auth: AuthResponse) => void;
    /** The session is gone (expired, revoked, signed out elsewhere). */
    onExpired: () => void;
};

let handlers: SessionHandlers = { onRefreshed: () => {}, onExpired: () => {} };

/** The session is over (a refresh found no session): the app signs out, as a 401 on a request would. */
export function sessionExpired() {
    handlers.onExpired();
}

export function configureSession(next: SessionHandlers) {
    handlers = next;
}

let refreshing: Promise<AuthResponse | null> | null = null;

/** Exchanges the refresh cookie for a new access token. Null when there is no session to restore. */
export function refreshSession(): Promise<AuthResponse | null> {
    refreshing ??= withRefreshLock(async () => {
        try {
            const { data } = await bare.post<AuthResponse>("/auth/refresh");
            tokenStore.set(data.accessToken);
            handlers.onRefreshed(data);
            return data;
        } catch (error) {
            const apiError = toApiError(error);
            if (apiError.status === 401) {
                tokenStore.set(null);
                return null;
            }
            throw apiError;
        }
    }).finally(() => {
        refreshing = null;
    });
    return refreshing;
}

function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) {
        return navigator.locks.request("hourline-refresh", work);
    }
    return work();
}

http.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        // a file request's error body arrives as a Blob: read it, so the API's message and code come through
        if (error.response?.data instanceof Blob) {
            try {
                error.response.data = JSON.parse(await error.response.data.text());
            } catch {
                // not the API's JSON; the status still says what happened
            }
        }
        const config = error.config as RetriableConfig | undefined;
        if (error.response?.status === 401 && config && !config._retried) {
            config._retried = true;
            let auth: AuthResponse | null;
            try {
                auth = await refreshSession();
            } catch (refreshError) {
                // the refresh itself failed (rate limit, server, network), which says nothing about the session:
                // this request fails, and the next one tries again
                return Promise.reject(toApiError(refreshError));
            }
            if (auth) return http(config);
            handlers.onExpired();
        }
        return Promise.reject(toApiError(error));
    },
);

/** Signs in with the API's shape; the caller stores the result. */
export async function signIn(email: string, password: string): Promise<AuthResponse> {
    try {
        const { data } = await bare.post<AuthResponse>("/auth/login", { email, password });
        tokenStore.set(data.accessToken);
        return data;
    } catch (error) {
        throw toApiError(error);
    }
}

/**
 * Ends the session on the server (and its refresh cookie); works with an expired access token too. Throws when
 * the server couldn't be reached or refused for now (offline, 5xx, rate limit): the session is still alive then.
 * It runs under the refresh lock, as a refresh in flight would otherwise race it for the same cookie.
 */
export async function signOut(): Promise<void> {
    await withRefreshLock(async () => {
        try {
            await bare.post("/auth/logout");
        } catch (error) {
            const apiError = toApiError(error);
            // any other 4xx means there is no session left to end
            if (apiError.status <= 0 || apiError.status >= 500 || apiError.status === 429) throw apiError;
        }
        tokenStore.set(null);
    });
}

/** Anonymous calls (invitations, password reset) that must not try to refresh. */
export async function anonymous<T>(method: "get" | "post", url: string, body?: unknown): Promise<T> {
    try {
        const { data } = method === "get" ? await bare.get<T>(url) : await bare.post<T>(url, body);
        return data;
    } catch (error) {
        throw toApiError(error);
    }
}
