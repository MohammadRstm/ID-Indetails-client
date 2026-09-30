/*
 * State kept outside React Query (an open window, a draft) registers here, to be dropped when the person
 * signed in signs out or changes (another tab signed in as someone else, sharing the refresh cookie).
 */

const resets = new Set<() => void>();

export function onSessionReset(reset: () => void): () => void {
    resets.add(reset);
    return () => resets.delete(reset);
}

export function resetSessionState() {
    resets.forEach((reset) => reset());
}
