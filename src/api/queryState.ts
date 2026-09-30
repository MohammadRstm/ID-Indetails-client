/**
 * A load that failed with nothing to show. A failed refresh (on focus, a live signal, "load more") keeps what
 * the query already had, so its screen stays up rather than turning into an error.
 */
export const loadFailed = (query: { isError: boolean; data: unknown }) => query.isError && query.data === undefined;
