/** Seconds left on an access token, from its own expiry claim (never logged). */
export function secondsLeft(token: string): number {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
        return (payload.exp ?? 0) - Date.now() / 1000;
    } catch {
        return 0;
    }
}
