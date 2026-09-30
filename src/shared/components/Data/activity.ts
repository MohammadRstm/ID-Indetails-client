/** The API's activity level as the signal's number. */
export function activityLevelOf(level: string | null | undefined): number {
    return level === "busy" ? 3 : level === "steady" ? 2 : level === "quiet" ? 1 : 0;
}
