import { QueryClient } from "@tanstack/react-query";
import { toApiError } from "./errors";

/** React Query defaults for the whole app. */
export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                // A 4xx won't change by asking again; network and server failures get two more tries.
                retry: (failures, error) => {
                    const status = toApiError(error).status;
                    if (status >= 400 && status < 500) return false;
                    return failures < 2;
                },
                refetchOnWindowFocus: true,
            },
            mutations: { retry: false },
        },
    });
}
