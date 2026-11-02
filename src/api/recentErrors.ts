import type { ApiError } from "./errors";
import { onSessionReset } from "@/app/session/sessionReset";

/** A request that failed lately in this browser, for a bug report: its trace id finds its lines in the API log. */
export type RecentError = { ref: string; status: number; path: string | null; at: string };

const KEPT = 5;
let recent: RecentError[] = [];

// the next person signed in here doesn't send the last one's
onSessionReset(() => { recent = []; });

/** Keeps a failed request's trace id; sign-in refusals (401) are the session's business, not a fault. */
export function rememberError(error: ApiError, url: string | undefined) {
    if (!error.traceId || error.status < 400 || error.status === 401) return;
    recent = [{ ref: error.traceId, status: error.status, path: pathOf(url), at: new Date().toISOString() }, ...recent].slice(0, KEPT);
}

/** The requests that failed lately, newest first. */
export function recentErrors(): readonly RecentError[] {
    return recent;
}

/** The API path asked for, without its query: "/api/projects/4". */
function pathOf(url: string | undefined): string | null {
    if (!url) return null;
    const path = url.split("?")[0];
    return path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? "" : "/"}${path}`;
}
